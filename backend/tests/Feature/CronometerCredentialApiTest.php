<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CronometerCredentialApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_reports_not_configured_by_default(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->getJson('/api/settings/cronometer');

        $response->assertOk()->assertJsonPath('is_configured', false);
    }

    public function test_it_saves_credentials_without_ever_exposing_the_password(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->putJson('/api/settings/cronometer', [
            'username' => 'me@example.com',
            'password' => 'super-secret',
            'timezone' => 'America/Los_Angeles',
        ]);

        $response->assertOk()
            ->assertJsonPath('is_configured', true)
            ->assertJsonPath('username', 'me@example.com')
            ->assertJsonMissingPath('password');

        $this->assertDatabaseHas('cronometer_credentials', ['timezone' => 'America/Los_Angeles']);
    }

    public function test_mcp_config_includes_stored_credentials_and_a_fresh_api_token(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user)->putJson('/api/settings/cronometer', [
            'username' => 'me@example.com',
            'password' => 'super-secret',
        ]);

        $response = $this->actingAs($user)->getJson('/api/settings/mcp-config');

        $response->assertOk()
            ->assertJsonPath('mcpServers.cronometer.env.CRONOMETER_USERNAME', 'me@example.com')
            ->assertJsonPath('mcpServers.cronometer.env.CRONOMETER_PASSWORD', 'super-secret');

        $this->assertNotEmpty($response->json('mcpServers.pantry.env.PANTRY_API_TOKEN'));
    }

    public function test_each_users_cronometer_credentials_are_isolated_from_each_other(): void
    {
        $userA = User::factory()->create();
        $userB = User::factory()->create();

        $this->actingAs($userA)->putJson('/api/settings/cronometer', [
            'username' => 'a@example.com',
            'password' => 'secret-a',
        ]);

        $this->actingAs($userB)->getJson('/api/settings/cronometer')->assertOk()->assertJsonPath('is_configured', false);

        $mcpConfig = $this->actingAs($userB)->getJson('/api/settings/mcp-config');
        $mcpConfig->assertOk()->assertJsonPath('mcpServers.cronometer.env.CRONOMETER_USERNAME', 'your@email.com');
    }
}
