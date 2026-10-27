<?php

namespace Tests\Feature;

use App\Models\PantryItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PantryAttentionApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_lists_items_expiring_within_the_horizon(): void
    {
        $user = User::factory()->create();

        $soon = PantryItem::factory()->for($user)->create([
            'name' => 'Yoghurt', 'added_at' => now(), 'expiration_date' => now()->addDays(3), 'opened_at' => null,
        ]);
        PantryItem::factory()->for($user)->create([
            'name' => 'Rice', 'added_at' => now(), 'expiration_date' => now()->addMonths(6), 'opened_at' => null,
        ]);

        $response = $this->actingAs($user)->getJson('/api/pantry/attention');

        $response->assertOk()
            ->assertJsonCount(1, 'expiring')
            ->assertJsonPath('expiring.0.id', $soon->id)
            ->assertJsonPath('expiring_within_days', 7);
    }

    public function test_expiring_list_is_sorted_soonest_first(): void
    {
        $user = User::factory()->create();

        $later = PantryItem::factory()->for($user)->create([
            'added_at' => now(), 'expiration_date' => now()->addDays(6), 'opened_at' => null,
        ]);
        $sooner = PantryItem::factory()->for($user)->create([
            'added_at' => now(), 'expiration_date' => now()->addDays(1), 'opened_at' => null,
        ]);

        $response = $this->actingAs($user)->getJson('/api/pantry/attention');

        $response->assertOk()
            ->assertJsonPath('expiring.0.id', $sooner->id)
            ->assertJsonPath('expiring.1.id', $later->id);
    }

    public function test_it_uses_the_opened_estimate_when_sooner_than_the_original_date(): void
    {
        $user = User::factory()->create();

        $item = PantryItem::factory()->for($user)->create([
            'added_at' => now()->subDays(30),
            'expiration_date' => now()->addMonths(6),
            'opened_at' => now()->subDay(),
            'opened_expiration_date' => now()->addDays(2),
        ]);

        $response = $this->actingAs($user)->getJson('/api/pantry/attention');

        $response->assertOk()->assertJsonPath('expiring.0.id', $item->id);
    }

    public function test_it_includes_already_expired_items(): void
    {
        $user = User::factory()->create();

        $item = PantryItem::factory()->for($user)->create([
            'added_at' => now()->subDays(10), 'expiration_date' => now()->subDay(), 'opened_at' => null,
        ]);

        $response = $this->actingAs($user)->getJson('/api/pantry/attention');

        $response->assertOk()->assertJsonPath('expiring.0.id', $item->id);
    }

    public function test_it_lists_unopened_items_sitting_past_the_stagnant_threshold(): void
    {
        $user = User::factory()->create();

        $forgotten = PantryItem::factory()->for($user)->create([
            'name' => 'Canned Beans', 'added_at' => now()->subDays(30), 'expiration_date' => null, 'opened_at' => null,
        ]);
        PantryItem::factory()->for($user)->create([
            'name' => 'Fresh Bread', 'added_at' => now()->subDays(2), 'expiration_date' => null, 'opened_at' => null,
        ]);

        $response = $this->actingAs($user)->getJson('/api/pantry/attention');

        $response->assertOk()
            ->assertJsonCount(1, 'stagnant')
            ->assertJsonPath('stagnant.0.id', $forgotten->id)
            ->assertJsonPath('stagnant_after_days', 21);
    }

    public function test_opened_items_are_never_stagnant_no_matter_how_old(): void
    {
        $user = User::factory()->create();

        PantryItem::factory()->for($user)->create([
            'added_at' => now()->subDays(60), 'expiration_date' => null, 'opened_at' => now()->subDays(60),
        ]);

        $response = $this->actingAs($user)->getJson('/api/pantry/attention');

        $response->assertOk()->assertJsonCount(0, 'stagnant');
    }

    public function test_an_item_can_appear_in_both_lists(): void
    {
        $user = User::factory()->create();

        $item = PantryItem::factory()->for($user)->create([
            'added_at' => now()->subDays(25), 'expiration_date' => now()->addDays(1), 'opened_at' => null,
        ]);

        $response = $this->actingAs($user)->getJson('/api/pantry/attention');

        $response->assertOk()
            ->assertJsonPath('expiring.0.id', $item->id)
            ->assertJsonPath('stagnant.0.id', $item->id);
    }

    public function test_empty_pantry_returns_empty_lists(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->getJson('/api/pantry/attention');

        $response->assertOk()->assertJsonCount(0, 'expiring')->assertJsonCount(0, 'stagnant');
    }

    public function test_guests_cannot_access_pantry_attention(): void
    {
        $this->getJson('/api/pantry/attention')->assertUnauthorized();
    }

    public function test_it_only_shows_the_authenticated_users_own_items(): void
    {
        $userA = User::factory()->create();
        $userB = User::factory()->create();

        PantryItem::factory()->for($userA)->create([
            'added_at' => now()->subDays(30), 'expiration_date' => null, 'opened_at' => null,
        ]);

        $response = $this->actingAs($userB)->getJson('/api/pantry/attention');

        $response->assertOk()->assertJsonCount(0, 'stagnant');
    }
}
