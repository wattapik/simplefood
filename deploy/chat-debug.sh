#!/usr/bin/env bash
# Diagnoses two reported bugs: pantry items showing as "not linked to a
# Cronometer food" and the chat agent returning a 422 "unexpected response" when
# asked to link items. Run this on the server, from the directory containing
# docker-compose.yml. It only reads existing stored credentials/tokens and makes
# one real Claude + Cronometer round trip; nothing is modified except a
# short-lived Sanctum token that it creates and deletes itself.
set -euo pipefail

if command -v docker-compose >/dev/null 2>&1 && ! docker compose version >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  COMPOSE="docker compose"
fi

echo "==> Using: $COMPOSE"
echo

echo "==> 1. Checking the pantry-mcp bridge scripts exist in the image"
$COMPOSE exec backend ls -la /pantry-mcp/dist/food-nutrition-bridge.js /pantry-mcp/dist/cronometer-bridge.js /pantry-mcp/dist/chat-agent-bridge.js
echo

echo "==> 2. Testing a direct Cronometer nutrition lookup (same code path as Stats/Compare)"
$COMPOSE exec backend php artisan tinker --execute='
$user = App\Models\User::first();
$linked = $user->pantryItems()->whereNotNull("cronometer_food_id")->get();
echo "Pantry items with cronometer_food_id set: ".$linked->count()." of ".$user->pantryItems()->count()."\n";
$item = $linked->first();
if (!$item) { echo "None are linked at all — nothing more to test here.\n"; exit; }
echo "Testing item: {$item->name} (food_id={$item->cronometer_food_id})\n";
try {
    $result = app(App\Services\CronometerService::class)->nutritionForFood($user, (int) $item->cronometer_food_id);
    echo "OK: ".json_encode($result)."\n";
} catch (\Throwable $e) {
    echo "ERROR: ".$e->getMessage()."\n";
}
'
echo

echo "==> 3. Reproducing the chat agent call directly (this makes a real Claude API call, may take up to 90s)"
$COMPOSE exec backend php artisan tinker --execute='
use Illuminate\Support\Facades\Process;
use App\Support\ProcessEnvironment;

$user = App\Models\User::first();
$anthropic = App\Models\AnthropicCredential::current($user);
$cronometer = App\Models\CronometerCredential::current($user);
$bridgePath = config("services.anthropic.bridge_path");

if (!$anthropic->isConfigured()) { echo "Anthropic API key is not configured — cannot test.\n"; exit; }

$pantryToken = $user->createToken("debug-chat-test")->plainTextToken;

$inputPath = tempnam(sys_get_temp_dir(), "debug-chat-");
file_put_contents($inputPath, json_encode(["messages" => [
    ["role" => "user", "content" => "Link every pantry item that has no Cronometer food yet to a matching Cronometer food."],
]]));

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

$user->tokens()->where("name", "debug-chat-test")->delete();
@unlink($inputPath);

file_put_contents("/tmp/debug-stdout.txt", $result->output());
file_put_contents("/tmp/debug-stderr.txt", $result->errorOutput());

echo "exit code: ".$result->exitCode()."\n";
echo "stdout length: ".strlen($result->output())."\n";
echo "stderr length: ".strlen($result->errorOutput())."\n";
$decoded = json_decode($result->output(), true);
echo "stdout is valid JSON with a messages array: ".(is_array($decoded) && isset($decoded["messages"]) && is_array($decoded["messages"]) ? "yes" : "no")."\n";
'
echo

echo "==> 4. First/last 2000 chars of stdout from that run"
$COMPOSE exec backend head -c 2000 /tmp/debug-stdout.txt
echo
echo "...(truncated)..."
$COMPOSE exec backend tail -c 2000 /tmp/debug-stdout.txt
echo
echo

echo "==> 5. Full stderr from that run"
$COMPOSE exec backend cat /tmp/debug-stderr.txt
echo

echo "==> Done. Paste all of the above back."
