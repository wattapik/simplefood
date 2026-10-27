<?php

namespace Tests\Feature;

use App\Models\Sprout;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SproutApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_starts_tracking_a_sprout_batch(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/sprouts', [
            'seed_name' => 'Broccoli seeds',
            'medium' => 'dirt tray',
            'seed_quantity' => 50,
            'seed_unit' => 'g',
            'estimated_ready_at' => now()->addDays(5)->toDateString(),
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.seed_name', 'Broccoli seeds')
            ->assertJsonPath('data.medium', 'dirt tray')
            ->assertJsonPath('data.seed_quantity', 50)
            ->assertJsonPath('data.is_harvested', false);

        $this->assertDatabaseHas('sprouts', ['user_id' => $user->id, 'seed_name' => 'Broccoli seeds']);
    }

    public function test_seed_quantity_is_optional(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/sprouts', [
            'seed_name' => 'Alfalfa seeds',
            'medium' => 'sprout jar',
        ]);

        $response->assertCreated()->assertJsonPath('data.seed_quantity', null);
    }

    public function test_it_requires_a_seed_name_and_medium(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/sprouts', [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['seed_name', 'medium']);
    }

    public function test_it_lists_growing_batches_before_harvested_ones(): void
    {
        $user = User::factory()->create();
        $harvested = Sprout::factory()->for($user)->harvested()->create();
        $growing = Sprout::factory()->for($user)->create(['estimated_ready_at' => now()->addDays(3)]);

        $response = $this->actingAs($user)->getJson('/api/sprouts');

        $response->assertOk()
            ->assertJsonPath('data.0.id', $growing->id)
            ->assertJsonPath('data.1.id', $harvested->id);
    }

    public function test_it_filters_by_status(): void
    {
        $user = User::factory()->create();
        Sprout::factory()->for($user)->harvested()->create();
        Sprout::factory()->for($user)->create();

        $response = $this->actingAs($user)->getJson('/api/sprouts?status=growing');

        $response->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.is_harvested', false);
    }

    public function test_it_updates_a_sprout_batch(): void
    {
        $user = User::factory()->create();
        $sprout = Sprout::factory()->for($user)->create(['medium' => 'sprout jar']);

        $response = $this->actingAs($user)->putJson("/api/sprouts/{$sprout->id}", [
            'medium' => 'dirt tray',
            'seed_quantity' => 75,
        ]);

        $response->assertOk()
            ->assertJsonPath('data.medium', 'dirt tray')
            ->assertJsonPath('data.seed_quantity', 75);
    }

    public function test_it_deletes_a_sprout_batch(): void
    {
        $user = User::factory()->create();
        $sprout = Sprout::factory()->for($user)->create();

        $this->actingAs($user)->deleteJson("/api/sprouts/{$sprout->id}")->assertNoContent();

        $this->assertDatabaseMissing('sprouts', ['id' => $sprout->id]);
    }

    public function test_harvesting_creates_a_fridge_pantry_item_and_marks_it_harvested(): void
    {
        $user = User::factory()->create();
        $sprout = Sprout::factory()->for($user)->create(['seed_name' => 'Broccoli sprouts']);

        $response = $this->actingAs($user)->postJson("/api/sprouts/{$sprout->id}/harvest", [
            'quantity' => 150,
            'unit' => 'g',
            'expiration_date' => now()->addDays(6)->toDateString(),
        ]);

        $response->assertOk()->assertJsonPath('data.is_harvested', true);

        $sprout->refresh();
        $this->assertNotNull($sprout->harvested_at);
        $this->assertNotNull($sprout->pantry_item_id);

        $this->assertDatabaseHas('pantry_items', [
            'id' => $sprout->pantry_item_id,
            'user_id' => $user->id,
            'name' => 'Broccoli sprouts',
            'quantity' => 150,
            'unit' => 'g',
            'location' => 'fridge',
        ]);
        $this->assertEquals(now()->addDays(6)->toDateString(), $sprout->pantryItem->expiration_date->toDateString());
    }

    public function test_harvesting_without_an_amount_still_creates_a_pantry_item(): void
    {
        $user = User::factory()->create();
        $sprout = Sprout::factory()->for($user)->create();

        $response = $this->actingAs($user)->postJson("/api/sprouts/{$sprout->id}/harvest", []);

        $response->assertOk();
        $this->assertDatabaseHas('pantry_items', [
            'id' => $sprout->refresh()->pantry_item_id,
            'quantity' => 1,
            'unit' => 'batch',
        ]);
    }

    public function test_a_batch_cannot_be_harvested_twice(): void
    {
        $user = User::factory()->create();
        $sprout = Sprout::factory()->for($user)->harvested()->create();

        $this->actingAs($user)->postJson("/api/sprouts/{$sprout->id}/harvest", [])->assertUnprocessable();
    }

    public function test_a_user_cannot_view_update_delete_or_harvest_another_users_sprout(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $sprout = Sprout::factory()->for($owner)->create();

        $this->actingAs($intruder)->putJson("/api/sprouts/{$sprout->id}", ['medium' => 'hijacked'])->assertNotFound();
        $this->actingAs($intruder)->deleteJson("/api/sprouts/{$sprout->id}")->assertNotFound();
        $this->actingAs($intruder)->postJson("/api/sprouts/{$sprout->id}/harvest", [])->assertNotFound();
    }

    public function test_guests_cannot_access_sprouts(): void
    {
        $this->getJson('/api/sprouts')->assertUnauthorized();
        $this->postJson('/api/sprouts', [])->assertUnauthorized();
    }
}
