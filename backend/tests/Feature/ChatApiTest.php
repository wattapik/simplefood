<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Process;
use Tests\TestCase;

class ChatApiTest extends TestCase
{
    use RefreshDatabase;

    private function configureAnthropic(User $user): void
    {
        $this->actingAs($user)->putJson('/api/settings/anthropic', ['api_key' => 'sk-ant-test']);
    }

    /** Fakes the bridge script returning a fixed set of raw Anthropic-format messages. */
    private function fakeBridgeReturning(array $messages): void
    {
        Process::fake(function ($process) use ($messages) {
            $command = implode(' ', (array) $process->command);
            if (! str_contains($command, 'chat-agent-bridge')) {
                return Process::result(exitCode: 1, errorOutput: json_encode(['error' => 'unexpected command']));
            }

            return Process::result(output: json_encode(['messages' => $messages]));
        });
    }

    public function test_it_requires_an_anthropic_api_key_to_be_configured(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/chat', ['message' => 'hello']);

        $response->assertUnprocessable()->assertJsonPath('message', 'Anthropic API key is not configured yet. Add it in Settings first.');
        Process::assertNothingRan();
    }

    public function test_fetching_history_also_requires_configuration_upfront(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->getJson('/api/chat');

        $response->assertUnprocessable()->assertJsonPath('message', 'Anthropic API key is not configured yet. Add it in Settings first.');
    }

    public function test_it_sends_a_message_and_returns_the_display_history(): void
    {
        $user = User::factory()->create();
        $this->configureAnthropic($user);

        $this->fakeBridgeReturning([
            ['role' => 'user', 'content' => 'What do I have that is high in protein?'],
            ['role' => 'assistant', 'content' => [['type' => 'text', 'text' => 'You have chicken breast and lentils.']]],
        ]);

        $response = $this->actingAs($user)->postJson('/api/chat', ['message' => 'What do I have that is high in protein?']);

        $response->assertOk()->assertJson([
            'messages' => [
                ['role' => 'user', 'text' => 'What do I have that is high in protein?'],
                ['role' => 'assistant', 'text' => 'You have chicken breast and lentils.'],
            ],
        ]);
    }

    public function test_tool_use_and_tool_result_blocks_are_hidden_from_the_display_history(): void
    {
        $user = User::factory()->create();
        $this->configureAnthropic($user);

        $this->fakeBridgeReturning([
            ['role' => 'user', 'content' => 'I ate 100g of oats'],
            ['role' => 'assistant', 'content' => [['type' => 'tool_use', 'id' => 'toolu_1', 'name' => 'consume_pantry_item', 'input' => []]]],
            ['role' => 'user', 'content' => [['type' => 'tool_result', 'tool_use_id' => 'toolu_1', 'content' => 'Deducted 100g.']]],
            ['role' => 'assistant', 'content' => [['type' => 'text', 'text' => 'Deducted 100g of oats from your pantry.']]],
        ]);

        $response = $this->actingAs($user)->postJson('/api/chat', ['message' => 'I ate 100g of oats']);

        $response->assertOk()->assertJson([
            'messages' => [
                ['role' => 'user', 'text' => 'I ate 100g of oats'],
                ['role' => 'assistant', 'text' => 'Deducted 100g of oats from your pantry.'],
            ],
        ]);
    }

    public function test_history_persists_across_requests(): void
    {
        $user = User::factory()->create();
        $this->configureAnthropic($user);

        $this->fakeBridgeReturning([
            ['role' => 'user', 'content' => 'hi'],
            ['role' => 'assistant', 'content' => [['type' => 'text', 'text' => 'Hello!']]],
        ]);
        $this->actingAs($user)->postJson('/api/chat', ['message' => 'hi']);

        $response = $this->actingAs($user)->getJson('/api/chat');

        $response->assertOk()->assertJson([
            'messages' => [
                ['role' => 'user', 'text' => 'hi'],
                ['role' => 'assistant', 'text' => 'Hello!'],
            ],
        ]);
    }

    public function test_resetting_clears_the_conversation(): void
    {
        $user = User::factory()->create();
        $this->configureAnthropic($user);

        $this->fakeBridgeReturning([
            ['role' => 'user', 'content' => 'hi'],
            ['role' => 'assistant', 'content' => [['type' => 'text', 'text' => 'Hello!']]],
        ]);
        $this->actingAs($user)->postJson('/api/chat', ['message' => 'hi']);

        $this->actingAs($user)->deleteJson('/api/chat')->assertNoContent();

        $response = $this->actingAs($user)->getJson('/api/chat');
        $response->assertOk()->assertJson(['messages' => []]);
    }

    public function test_a_failed_bridge_script_returns_a_422(): void
    {
        $user = User::factory()->create();
        $this->configureAnthropic($user);

        Process::fake(['*chat-agent-bridge*' => Process::result(
            errorOutput: json_encode(['error' => 'Invalid API key']),
            exitCode: 1,
        )]);

        $response = $this->actingAs($user)->postJson('/api/chat', ['message' => 'hi']);

        $response->assertUnprocessable()->assertJsonPath('message', 'Invalid API key');
    }

    public function test_an_unparseable_bridge_response_is_logged_and_returns_a_422(): void
    {
        $user = User::factory()->create();
        $this->configureAnthropic($user);

        Process::fake(['*chat-agent-bridge*' => Process::result(output: 'not valid json', exitCode: 0)]);

        Log::shouldReceive('error')
            ->once()
            ->with('Chat agent bridge returned an unparseable response.', \Mockery::on(fn (array $context) => $context['user_id'] === $user->id
                && $context['exit_code'] === 0
                && str_contains($context['stdout'], 'not valid json')
            ));

        $response = $this->actingAs($user)->postJson('/api/chat', ['message' => 'hi']);

        $response->assertUnprocessable()->assertJsonPath('message', 'Chat agent returned an unexpected response.');
    }

    public function test_guests_cannot_use_chat(): void
    {
        $this->postJson('/api/chat', ['message' => 'hi'])->assertUnauthorized();
        $this->getJson('/api/chat')->assertUnauthorized();
        $this->deleteJson('/api/chat')->assertUnauthorized();
    }
}
