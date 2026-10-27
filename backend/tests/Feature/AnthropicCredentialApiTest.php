<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AnthropicCredentialApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_reports_not_configured_by_default(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->getJson('/api/settings/anthropic');

        $response->assertOk()->assertJsonPath('is_configured', false);
    }

    public function test_it_saves_the_api_key_without_ever_exposing_it(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->putJson('/api/settings/anthropic', [
            'api_key' => 'sk-ant-super-secret',
            'model' => 'claude-sonnet-5',
        ]);

        $response->assertOk()
            ->assertJsonPath('is_configured', true)
            ->assertJsonPath('model', 'claude-sonnet-5')
            ->assertJsonMissingPath('api_key');

        $this->assertDatabaseHas('anthropic_credentials', ['user_id' => $user->id]);
    }

    public function test_each_users_key_is_isolated(): void
    {
        $userA = User::factory()->create();
        $userB = User::factory()->create();

        $this->actingAs($userA)->putJson('/api/settings/anthropic', ['api_key' => 'sk-ant-a']);

        $this->actingAs($userB)->getJson('/api/settings/anthropic')->assertOk()->assertJsonPath('is_configured', false);
    }

    public function test_guests_cannot_access_anthropic_settings(): void
    {
        $this->getJson('/api/settings/anthropic')->assertUnauthorized();
    }
}
