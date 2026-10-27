<?php

namespace Tests\Feature;

use App\Enums\PantryLocation;
use App\Models\PantryItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PantryItemApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_lists_pantry_items_for_the_authenticated_user(): void
    {
        $user = User::factory()->create();
        PantryItem::factory()->for($user)->count(3)->create();

        $response = $this->actingAs($user)->getJson('/api/pantry-items');

        $response->assertOk()->assertJsonCount(3, 'data');
    }

    public function test_it_only_lists_the_authenticated_users_own_items(): void
    {
        $user = User::factory()->create();
        PantryItem::factory()->for($user)->count(2)->create();
        PantryItem::factory()->count(5)->create(); // other users' items

        $response = $this->actingAs($user)->getJson('/api/pantry-items');

        $response->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_it_filters_pantry_items_by_location(): void
    {
        $user = User::factory()->create();
        PantryItem::factory()->for($user)->create(['location' => PantryLocation::Freezer]);
        PantryItem::factory()->for($user)->create(['location' => PantryLocation::Fridge]);

        $response = $this->actingAs($user)->getJson('/api/pantry-items?location=freezer');

        $response->assertOk()->assertJsonCount(1, 'data');
        $response->assertJsonPath('data.0.location', 'freezer');
    }

    public function test_it_creates_a_pantry_item(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/pantry-items', [
            'name' => 'Rolled Oats',
            'quantity' => 500,
            'unit' => 'g',
            'category' => 'Grains',
            'location' => 'pantry',
            'expiration_date' => now()->addMonths(6)->toDateString(),
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('pantry_items', ['name' => 'Rolled Oats', 'location' => 'pantry']);
    }

    public function test_it_rejects_an_invalid_location(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/pantry-items', [
            'name' => 'Rolled Oats',
            'quantity' => 500,
            'unit' => 'g',
            'location' => 'garage',
        ]);

        $response->assertUnprocessable()->assertJsonValidationErrors('location');
    }

    public function test_it_updates_a_pantry_item(): void
    {
        $user = User::factory()->create();
        $item = PantryItem::factory()->for($user)->create(['name' => 'Old Name']);

        $response = $this->actingAs($user)->putJson("/api/pantry-items/{$item->id}", [
            'name' => 'New Name',
        ]);

        $response->assertOk()->assertJsonPath('data.name', 'New Name');
    }

    public function test_it_deletes_a_pantry_item(): void
    {
        $user = User::factory()->create();
        $item = PantryItem::factory()->for($user)->create();

        $response = $this->actingAs($user)->deleteJson("/api/pantry-items/{$item->id}");

        $response->assertNoContent();
        $this->assertDatabaseMissing('pantry_items', ['id' => $item->id]);
    }

    public function test_consuming_partially_deducts_the_quantity(): void
    {
        $user = User::factory()->create();
        $item = PantryItem::factory()->for($user)->create(['quantity' => 500, 'unit' => 'g']);

        $response = $this->actingAs($user)->postJson("/api/pantry-items/{$item->id}/consume", [
            'quantity' => 100,
            'unit' => 'g',
        ]);

        $response->assertOk()->assertJsonPath('data.quantity', 400);
        $this->assertDatabaseHas('pantry_items', ['id' => $item->id, 'quantity' => 400]);
    }

    public function test_consuming_converts_between_grams_and_kilograms(): void
    {
        $user = User::factory()->create();
        $item = PantryItem::factory()->for($user)->create(['quantity' => 2, 'unit' => 'kg']);

        $response = $this->actingAs($user)->postJson("/api/pantry-items/{$item->id}/consume", [
            'quantity' => 500,
            'unit' => 'g',
        ]);

        $response->assertOk()->assertJsonPath('data.quantity', 1.5);
    }

    public function test_consuming_the_full_quantity_deletes_the_item(): void
    {
        $user = User::factory()->create();
        $item = PantryItem::factory()->for($user)->create(['quantity' => 100, 'unit' => 'g']);

        $response = $this->actingAs($user)->postJson("/api/pantry-items/{$item->id}/consume", [
            'quantity' => 150,
            'unit' => 'g',
        ]);

        $response->assertNoContent();
        $this->assertDatabaseMissing('pantry_items', ['id' => $item->id]);
    }

    public function test_consuming_with_a_non_convertible_unit_is_rejected(): void
    {
        $user = User::factory()->create();
        $item = PantryItem::factory()->for($user)->create(['quantity' => 5, 'unit' => 'pcs']);

        $response = $this->actingAs($user)->postJson("/api/pantry-items/{$item->id}/consume", [
            'quantity' => 100,
            'unit' => 'g',
        ]);

        $response->assertUnprocessable()->assertJsonValidationErrors('unit');
        $this->assertDatabaseHas('pantry_items', ['id' => $item->id, 'quantity' => 5]);
    }

    public function test_guests_cannot_access_pantry_items(): void
    {
        $response = $this->getJson('/api/pantry-items');

        $response->assertUnauthorized();
    }

    public function test_a_user_cannot_view_update_or_delete_another_users_pantry_item(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $item = PantryItem::factory()->for($owner)->create();

        $this->actingAs($intruder)->getJson("/api/pantry-items/{$item->id}")->assertNotFound();
        $this->actingAs($intruder)->putJson("/api/pantry-items/{$item->id}", ['name' => 'Hijacked'])->assertNotFound();
        $this->actingAs($intruder)->deleteJson("/api/pantry-items/{$item->id}")->assertNotFound();
        $this->actingAs($intruder)->postJson("/api/pantry-items/{$item->id}/consume", ['quantity' => 1, 'unit' => $item->unit])->assertNotFound();

        $this->assertDatabaseHas('pantry_items', ['id' => $item->id, 'name' => $item->name]);
    }

    public function test_marking_an_item_opened_with_a_sooner_estimate_overrides_the_original_expiration(): void
    {
        $user = User::factory()->create();
        $item = PantryItem::factory()->for($user)->create(['expiration_date' => now()->addMonths(6)->toDateString()]);

        $response = $this->actingAs($user)->putJson("/api/pantry-items/{$item->id}", [
            'opened_at' => now()->toIso8601String(),
            'opened_expiration_date' => now()->addDays(3)->toDateString(),
        ]);

        $response->assertOk()
            ->assertJsonPath('data.is_opened', true)
            ->assertJsonPath('data.effective_expiration_date', now()->addDays(3)->toDateString())
            ->assertJsonPath('data.is_expiring_soon', true);
    }

    public function test_the_original_expiration_still_applies_if_it_is_sooner_than_the_opened_estimate(): void
    {
        $user = User::factory()->create();
        $item = PantryItem::factory()->for($user)->create(['expiration_date' => now()->addDay()->toDateString()]);

        $response = $this->actingAs($user)->putJson("/api/pantry-items/{$item->id}", [
            'opened_at' => now()->toIso8601String(),
            'opened_expiration_date' => now()->addMonths(6)->toDateString(),
        ]);

        $response->assertOk()->assertJsonPath('data.effective_expiration_date', now()->addDay()->toDateString());
    }

    public function test_an_unopened_item_is_unaffected_by_effective_expiration_logic(): void
    {
        $user = User::factory()->create();
        $item = PantryItem::factory()->for($user)->create(['expiration_date' => now()->addMonths(6)->toDateString()]);

        $response = $this->actingAs($user)->getJson("/api/pantry-items/{$item->id}");

        $response->assertOk()
            ->assertJsonPath('data.is_opened', false)
            ->assertJsonPath('data.effective_expiration_date', now()->addMonths(6)->toDateString());
    }

    public function test_clearing_opened_at_reverts_to_the_original_expiration(): void
    {
        $user = User::factory()->create();
        $item = PantryItem::factory()->for($user)->create([
            'expiration_date' => now()->addMonths(6)->toDateString(),
            'opened_at' => now(),
            'opened_expiration_date' => now()->addDays(3)->toDateString(),
        ]);

        $response = $this->actingAs($user)->putJson("/api/pantry-items/{$item->id}", ['opened_at' => null]);

        $response->assertOk()
            ->assertJsonPath('data.is_opened', false)
            ->assertJsonPath('data.effective_expiration_date', now()->addMonths(6)->toDateString());
    }
}
