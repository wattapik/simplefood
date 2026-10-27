<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ProfileApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_updates_the_name_and_email(): void
    {
        $user = User::factory()->create(['email' => 'old@example.com']);

        $response = $this->actingAs($user)->putJson('/api/profile', [
            'name' => 'New Name',
            'email' => 'new@example.com',
        ]);

        $response->assertOk()
            ->assertJsonPath('name', 'New Name')
            ->assertJsonPath('email', 'new@example.com');

        $this->assertDatabaseHas('users', ['id' => $user->id, 'email' => 'new@example.com']);
    }

    public function test_it_changes_the_password_when_the_current_one_is_correct(): void
    {
        $user = User::factory()->create(['password' => bcrypt('old-password')]);

        $response = $this->actingAs($user)->putJson('/api/profile', [
            'current_password' => 'old-password',
            'password' => 'new-password-123',
            'password_confirmation' => 'new-password-123',
        ]);

        $response->assertOk();
        $this->assertTrue(Hash::check('new-password-123', $user->fresh()->password));
    }

    public function test_it_rejects_a_password_change_with_the_wrong_current_password(): void
    {
        $user = User::factory()->create(['password' => bcrypt('old-password')]);

        $response = $this->actingAs($user)->putJson('/api/profile', [
            'current_password' => 'totally-wrong',
            'password' => 'new-password-123',
            'password_confirmation' => 'new-password-123',
        ]);

        $response->assertUnprocessable()->assertJsonValidationErrors('current_password');
        $this->assertTrue(Hash::check('old-password', $user->fresh()->password));
    }

    public function test_it_rejects_an_email_already_used_by_another_account(): void
    {
        User::factory()->create(['email' => 'taken@example.com']);
        $user = User::factory()->create(['email' => 'me@example.com']);

        $response = $this->actingAs($user)->putJson('/api/profile', ['email' => 'taken@example.com']);

        $response->assertUnprocessable()->assertJsonValidationErrors('email');
    }

    public function test_a_user_can_keep_their_own_email_unchanged(): void
    {
        $user = User::factory()->create(['email' => 'me@example.com']);

        $response = $this->actingAs($user)->putJson('/api/profile', ['email' => 'me@example.com', 'name' => 'Still Me']);

        $response->assertOk()->assertJsonPath('email', 'me@example.com');
    }

    public function test_guests_cannot_update_a_profile(): void
    {
        $response = $this->putJson('/api/profile', ['name' => 'Nope']);

        $response->assertUnauthorized();
    }
}
