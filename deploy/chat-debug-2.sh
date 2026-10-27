#!/usr/bin/env bash
# Follow-up to chat-debug.sh: replays the user's REAL stored conversation history
# (loaded read-only, never written back) through the chat-agent bridge, to check
# whether something already sitting in that stored history — rather than the
# linking logic itself — is what's causing the 422 through the actual chat UI.
# Run from the directory containing docker-compose.yml.
set -euo pipefail

if command -v docker-compose >/dev/null 2>&1 && ! docker compose version >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  COMPOSE="docker compose"
fi

echo "==> Using: $COMPOSE"
echo

echo "==> Inspecting the stored conversation (read-only)"
$COMPOSE exec backend php artisan tinker --execute='
$user = App\Models\User::first();
$conversation = App\Models\ChatConversation::current($user);
$messages = $conversation->messages ?? [];
echo "Stored message count: ".count($messages)."\n";
echo "Stored JSON byte length: ".strlen(json_encode($messages))."\n";
$toolUseCount = 0; $toolResultCount = 0;
foreach ($messages as $m) {
    if (is_array($m["content"] ?? null)) {
        foreach ($m["content"] as $b) {
            if (($b["type"] ?? null) === "tool_use") $toolUseCount++;
            if (($b["type"] ?? null) === "tool_result") $toolResultCount++;
        }
    }
}
echo "tool_use blocks: $toolUseCount, tool_result blocks: $toolResultCount\n";
'
echo

echo "==> Replaying the real stored history through the bridge (read-only — the result is NOT saved back). May take up to 90s."
$COMPOSE exec backend php artisan tinker --execute='
use Illuminate\Support\Facades\Process;
use App\Support\ProcessEnvironment;

$user = App\Models\User::first();
$anthropic = App\Models\AnthropicCredential::current($user);
$cronometer = App\Models\CronometerCredential::current($user);
$bridgePath = config("services.anthropic.bridge_path");
$conversation = App\Models\ChatConversation::current($user);

$messages = $conversation->messages ?? [];
$messages[] = ["role" => "user", "content" => "What is in my pantry?"];

$pantryToken = $user->createToken("debug-chat-test-2")->plainTextToken;

$inputPath = tempnam(sys_get_temp_dir(), "debug-chat-2-");
file_put_contents($inputPath, json_encode(["messages" => $messages]));

$result = Process::timeout(90)->env([
    "ANTHROPIC_API_KEY" => $anthropic->api_key,
    "ANTHROPIC_MODEL" => $anthropic->model ?? "",
    "PANTRY_API_URL" => rtrim(config("app.url"), "/")."/api",
    "PANTRY_API_TOKEN" => $pantryToken,
    "CRONOMETER_USERNAME" => $cronometer->username ?? "",
    "CRONOMETER_PASSWORD" => $cronometer->password ?? "",
    "CRONOMETER_TOTP_SECRET" => $cronometer->totp_secret ?? "",
    "CRONOMETER_ACCOUNT_TZ" => $cronometer->timezone ?? "",
    "CRONOMETER_UVX_PATH" => ProcessEnvironment::resolveUvxPath(),
    "PATH" => ProcessEnvironment::pathWithLocalBin(),
    "HOME" => ProcessEnvironment::writableHomeDirectory(),
])->run(["node", $bridgePath, $inputPath]);

$user->tokens()->where("name", "debug-chat-test-2")->delete();
@unlink($inputPath);
// Deliberately NOT calling $conversation->update(...) — this is read-only.

file_put_contents("/tmp/debug2-stdout.txt", $result->output());
file_put_contents("/tmp/debug2-stderr.txt", $result->errorOutput());

echo "exit code: ".$result->exitCode()."\n";
echo "stdout length: ".strlen($result->output())."\n";
echo "stderr length: ".strlen($result->errorOutput())."\n";
$decoded = json_decode($result->output(), true);
echo "stdout is valid JSON with a messages array: ".(is_array($decoded) && isset($decoded["messages"]) && is_array($decoded["messages"]) ? "yes" : "no")."\n";
'
echo

echo "==> First/last 1500 chars of stdout from that run"
$COMPOSE exec backend head -c 1500 /tmp/debug2-stdout.txt
echo
echo "...(truncated)..."
$COMPOSE exec backend tail -c 1500 /tmp/debug2-stdout.txt
echo
echo

echo "==> Full stderr from that run"
$COMPOSE exec backend cat /tmp/debug2-stderr.txt
echo

echo "==> Done. Paste all of the above back."
