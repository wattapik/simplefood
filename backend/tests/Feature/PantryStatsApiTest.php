<?php

namespace Tests\Feature;

use App\Models\PantryItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Process;
use Tests\TestCase;

class PantryStatsApiTest extends TestCase
{
    use RefreshDatabase;

    private function configureCronometer(User $user): void
    {
        $this->actingAs($user)->putJson('/api/settings/cronometer', [
            'username' => 'me@example.com',
            'password' => 'secret',
        ]);
    }

    /** @param array<int, array{calories: float, protein_g: float, carbs_g: float, fat_g: float, fiber_g: float}> $nutritionByFoodId */
    private function fakeFoodNutrition(array $nutritionByFoodId): void
    {
        Process::fake(function ($process) use ($nutritionByFoodId) {
            $command = $process->command;

            if (! str_contains(implode(' ', (array) $command), 'food-nutrition-bridge')) {
                return Process::result(exitCode: 1, errorOutput: json_encode(['error' => 'unexpected command']));
            }

            $foodId = (int) end($command);

            return Process::result(output: json_encode([
                'food_id' => $foodId,
                'name' => "Food {$foodId}",
                'per_100g' => $nutritionByFoodId[$foodId] ?? ['calories' => 0, 'protein_g' => 0, 'carbs_g' => 0, 'fat_g' => 0, 'fiber_g' => 0],
            ]));
        });
    }

    public function test_it_requires_cronometer_credentials_to_be_configured(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->getJson('/api/pantry/stats');

        $response->assertUnprocessable()->assertJsonPath('message', 'Cronometer credentials are not configured yet. Add them in Settings first.');
        Process::assertNothingRan();
    }

    public function test_it_sums_calories_and_macros_scaled_by_quantity(): void
    {
        $user = User::factory()->create();
        $this->configureCronometer($user);
        $this->fakeFoodNutrition([
            111 => ['calories' => 379, 'protein_g' => 13.5, 'carbs_g' => 68.66, 'fat_g' => 5.89, 'fiber_g' => 10.4],
        ]);

        PantryItem::factory()->for($user)->create([
            'name' => 'Rolled Oats',
            'quantity' => 400,
            'unit' => 'g',
            'cronometer_food_id' => '111',
        ]);

        $response = $this->actingAs($user)->getJson('/api/pantry/stats');

        $response->assertOk()->assertJson([
            'overall' => [
                'calories' => 1516.0,
                'protein_g' => 54.0,
                'carbs_g' => 274.6,
                'fat_g' => 23.6,
                'fiber_g' => 41.6,
            ],
            'excluded' => [],
        ]);
    }

    public function test_it_converts_kilograms_to_grams_before_scaling(): void
    {
        $user = User::factory()->create();
        $this->configureCronometer($user);
        $this->fakeFoodNutrition([222 => ['calories' => 100, 'protein_g' => 10, 'carbs_g' => 10, 'fat_g' => 10, 'fiber_g' => 1]]);

        PantryItem::factory()->for($user)->create(['quantity' => 2, 'unit' => 'kg', 'cronometer_food_id' => '222']);

        $response = $this->actingAs($user)->getJson('/api/pantry/stats');

        $response->assertOk()->assertJsonPath('overall.calories', 2000.0);
    }

    public function test_it_excludes_items_without_a_linked_cronometer_food(): void
    {
        $user = User::factory()->create();
        $this->configureCronometer($user);
        $this->fakeFoodNutrition([]);

        PantryItem::factory()->for($user)->create(['name' => 'Mystery Item', 'cronometer_food_id' => null]);

        $response = $this->actingAs($user)->getJson('/api/pantry/stats');

        $response->assertOk()
            ->assertJsonPath('overall.calories', 0.0)
            ->assertJsonPath('excluded.0.name', 'Mystery Item')
            ->assertJsonPath('excluded.0.reason', 'not linked to a Cronometer food');
    }

    public function test_it_excludes_items_with_a_non_convertible_unit(): void
    {
        $user = User::factory()->create();
        $this->configureCronometer($user);
        $this->fakeFoodNutrition([333 => ['calories' => 200, 'protein_g' => 0, 'carbs_g' => 0, 'fat_g' => 0, 'fiber_g' => 0]]);

        PantryItem::factory()->for($user)->create(['name' => 'Eggs', 'unit' => 'pcs', 'cronometer_food_id' => '333']);

        $response = $this->actingAs($user)->getJson('/api/pantry/stats');

        $response->assertOk()
            ->assertJsonPath('overall.calories', 0.0)
            ->assertJsonPath('excluded.0.name', 'Eggs')
            ->assertJsonPath('excluded.0.reason', 'unit "pcs" can\'t be converted to grams');
    }

    public function test_a_pcs_tracked_items_density_is_still_reported_even_though_it_cant_scale_into_totals(): void
    {
        $user = User::factory()->create();
        $this->configureCronometer($user);
        $this->fakeFoodNutrition([333 => ['calories' => 155, 'protein_g' => 13, 'carbs_g' => 1.1, 'fat_g' => 11, 'fiber_g' => 0]]);

        $item = PantryItem::factory()->for($user)->create(['name' => 'Eggs', 'unit' => 'pcs', 'cronometer_food_id' => '333']);

        $response = $this->actingAs($user)->getJson('/api/pantry/stats');

        $response->assertOk()->assertJsonPath("items.{$item->id}.calories", 155.0);
    }

    public function test_items_map_is_null_for_an_unlinked_item(): void
    {
        $user = User::factory()->create();
        $this->configureCronometer($user);
        $this->fakeFoodNutrition([]);

        $item = PantryItem::factory()->for($user)->create(['name' => 'Mystery', 'cronometer_food_id' => null]);

        $response = $this->actingAs($user)->getJson('/api/pantry/stats');

        $response->assertOk()->assertJsonPath("items.{$item->id}", null);
    }

    public function test_it_approximates_liquids_as_water_density_and_flags_them(): void
    {
        $user = User::factory()->create();
        $this->configureCronometer($user);
        $this->fakeFoodNutrition([
            444 => ['calories' => 70, 'protein_g' => 5, 'carbs_g' => 7, 'fat_g' => 3, 'fiber_g' => 1],
        ]);

        PantryItem::factory()->for($user)->create(['name' => 'Soy Milk', 'quantity' => 1, 'unit' => 'l', 'cronometer_food_id' => '444']);

        $response = $this->actingAs($user)->getJson('/api/pantry/stats');

        // 1l ≈ 1000g at water density, so 10x the per-100g figures.
        $response->assertOk()
            ->assertJsonPath('overall.calories', 700.0)
            ->assertJsonPath('overall.protein_g', 50.0)
            ->assertJsonPath('excluded', [])
            ->assertJsonPath('approximated.0.name', 'Soy Milk')
            ->assertJsonPath('approximated.0.unit', 'l');
    }

    public function test_it_breaks_totals_down_by_location(): void
    {
        $user = User::factory()->create();
        $this->configureCronometer($user);
        $this->fakeFoodNutrition([
            1 => ['calories' => 100, 'protein_g' => 0, 'carbs_g' => 0, 'fat_g' => 0, 'fiber_g' => 0],
            2 => ['calories' => 100, 'protein_g' => 0, 'carbs_g' => 0, 'fat_g' => 0, 'fiber_g' => 0],
        ]);

        PantryItem::factory()->for($user)->create(['quantity' => 100, 'unit' => 'g', 'location' => 'fridge', 'cronometer_food_id' => '1']);
        PantryItem::factory()->for($user)->create(['quantity' => 100, 'unit' => 'g', 'location' => 'freezer', 'cronometer_food_id' => '2']);

        $response = $this->actingAs($user)->getJson('/api/pantry/stats');

        $response->assertOk()
            ->assertJsonPath('by_location.fridge.calories', 100.0)
            ->assertJsonPath('by_location.freezer.calories', 100.0)
            ->assertJsonPath('by_location.pantry.calories', 0.0)
            ->assertJsonPath('overall.calories', 200.0);
    }
}
