<?php

namespace App\Services;

use App\Models\AnthropicCredential;
use App\Models\ChatConversation;
use App\Models\CronometerCredential;
use App\Models\User;
use App\Support\ProcessEnvironment;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Process;
use RuntimeException;

class ChatAgentService
{
    /**
     * Send a message to the in-app chat agent — a fallback for when your Claude
     * subscription is exhausted, since this uses the billed Anthropic API instead.
     * Runs the full agentic tool-use loop (via pantry-mcp's chat-agent-bridge.js,
     * which drives the same MCP tools your Claude Desktop/Code sessions use) and
     * persists the updated conversation.
     *
     * @return array<int, array{role: string, text: string}>
     */
    public function reply(User $user, string $userMessage): array
    {
        $anthropicCredential = $this->requireConfiguredCredential($user);
        $bridgePath = config('services.anthropic.bridge_path');

        if (! is_string($bridgePath) || ! file_exists($bridgePath)) {
            throw new RuntimeException(
                "Chat agent bridge script not found at [{$bridgePath}]. Run `npm run build` in pantry-mcp."
            );
        }

        $conversation = ChatConversation::current($user);
        $messages = $conversation->messages ?? [];
        $messages[] = ['role' => 'user', 'content' => $userMessage];

        // A fresh, short-lived pantry API token for this one turn — separate from the
        // "pantry-mcp" token Settings > Generate MCP config manages, so regenerating
        // that one for your external Claude client never disrupts this feature.
        $user->tokens()->where('name', 'chat-agent-turn')->delete();
        $pantryToken = $user->createToken('chat-agent-turn')->plainTextToken;

        $cronometerCredential = CronometerCredential::current($user);

        // Passed as a file rather than piped via stdin: PHP's built-in dev server
        // (`php artisan serve`) doesn't reliably close a piped Process::input() stream,
        // which left the bridge script's stdin read hanging indefinitely in local
        // development. A file sidesteps that and matches how the other bridge scripts
        // already receive their arguments (argv, not stdin).
        $inputPath = tempnam(sys_get_temp_dir(), 'simplefood-chat-');
        file_put_contents($inputPath, json_encode(['messages' => $messages]));

        try {
            $result = Process::timeout(90)->env([
                'ANTHROPIC_API_KEY' => $anthropicCredential->api_key,
                'ANTHROPIC_MODEL' => $anthropicCredential->model ?? '',
                'PANTRY_API_URL' => rtrim(config('app.url'), '/').'/api',
                'PANTRY_API_TOKEN' => $pantryToken,
                'CRONOMETER_USERNAME' => $cronometerCredential->username ?? '',
                'CRONOMETER_PASSWORD' => $cronometerCredential->password ?? '',
                'CRONOMETER_TOTP_SECRET' => $cronometerCredential->totp_secret ?? '',
                'CRONOMETER_ACCOUNT_TZ' => $cronometerCredential->timezone ?? '',
                'CRONOMETER_UVX_PATH' => ProcessEnvironment::resolveUvxPath(),
                'PATH' => ProcessEnvironment::pathWithLocalBin(),
                'HOME' => ProcessEnvironment::writableHomeDirectory(),
            ])->run(['node', $bridgePath, $inputPath]);
        } finally {
            @unlink($inputPath);
        }

        $user->tokens()->where('name', 'chat-agent-turn')->delete();

        if ($result->failed()) {
            $error = json_decode($result->errorOutput(), true)['error'] ?? null;
            throw new RuntimeException($error ?? 'Could not reach Claude: '.$result->errorOutput());
        }

        $data = json_decode($result->output(), true);

        if (! is_array($data) || ! isset($data['messages']) || ! is_array($data['messages'])) {
            // This has been seen intermittently in production without reproducing on
            // demand (a fresh conversation and a replay of the real stored history
            // both succeed) — logging the raw bridge output here is what actually lets
            // the next occurrence be diagnosed, instead of just the generic message
            // the user sees.
            Log::error('Chat agent bridge returned an unparseable response.', [
                'user_id' => $user->id,
                'exit_code' => $result->exitCode(),
                'stdout' => $result->output(),
                'stderr' => $result->errorOutput(),
            ]);

            throw new RuntimeException('Chat agent returned an unexpected response.');
        }

        $conversation->update(['messages' => $data['messages']]);

        return self::toDisplayHistory($data['messages']);
    }

    /**
     * @return array<int, array{role: string, text: string}>
     */
    public function history(User $user): array
    {
        return self::toDisplayHistory(ChatConversation::current($user)->messages ?? []);
    }

    public function reset(User $user): void
    {
        ChatConversation::current($user)->update(['messages' => []]);
    }

    /**
     * @throws RuntimeException if an Anthropic API key hasn't been saved yet.
     */
    public function assertConfigured(User $user): void
    {
        $this->requireConfiguredCredential($user);
    }

    private function requireConfiguredCredential(User $user): AnthropicCredential
    {
        $credential = AnthropicCredential::current($user);

        if (! $credential->isConfigured()) {
            throw new RuntimeException('Anthropic API key is not configured yet. Add it in Settings first.');
        }

        return $credential;
    }

    /**
     * Reduce the raw Anthropic-format conversation (which includes tool_use/tool_result
     * blocks) down to just the text turns, for display in the chat UI.
     *
     * @param  array<int, array<string, mixed>>  $messages
     * @return array<int, array{role: string, text: string}>
     */
    private static function toDisplayHistory(array $messages): array
    {
        $display = [];

        foreach ($messages as $message) {
            $role = $message['role'] ?? null;
            $content = $message['content'] ?? null;
            $text = '';

            if (is_string($content)) {
                $text = $content;
            } elseif (is_array($content)) {
                foreach ($content as $block) {
                    if (($block['type'] ?? null) === 'text' && is_string($block['text'] ?? null)) {
                        $text .= ($text === '' ? '' : "\n").$block['text'];
                    }
                }
            }

            if (is_string($role) && $text !== '') {
                $display[] = ['role' => $role, 'text' => $text];
            }
        }

        return $display;
    }
}
