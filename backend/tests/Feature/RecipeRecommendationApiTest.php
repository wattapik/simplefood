<?php

namespace Tests\Feature;

use App\Models\PantryItem;
use App\Models\Recipe;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Process;
use Tests\TestCase;

class RecipeRecommendationApiTest extends TestCase
{
    use RefreshDatabase;

    private function configureCronometer(User $user): void
    {
        $this->actingAs($user)->putJson('/api/settings/cronometer', [
            'username' => 'me@example.com',
            'password' => 'secret',
        ]);
    }

    private function fakeCronometerBridge(array $overviewPayload, array $nutritionByFoodId = []): void
    {
        Process::fake(function ($process) use ($overviewPayload, $nutritionByFoodId) {
            $command = $process->command;
            $commandString = implode(' ', (array) $command);

            if (str_contains($commandString, 'food-nutrition-bridge')) {
                $foodId = (int) end($command);

                return Process::result(output: json_encode([
                    'food_id' => $foodId,
                    'name' => "Food {$foodId}",
                    'per_100g' => $nutritionByFoodId[$foodId] ?? ['calories' => 0, 'protein_g' => 0, 'carbs_g' => 0, 'fat_g' => 0, 'fiber_g' => 0],
                ]));
            }

            if (str_contains($commandString, 'cronometer-bridge')) {
                return Process::result(output: json_encode($overviewPayload));
            }

            return Process::result(exitCode: 1, errorOutput: json_encode(['error' => 'unexpected command']));
        });
    }

    private array $overviewPayload = [
        'date' => '2026-09-23',
        'calories' => ['consumed' => 1000, 'target' => 2000, 'remaining' => 1000],
        'macros' => ['protein_g' => 40.0, 'carbs_g' => 100.0, 'fat_g' => 30.0, 'fiber_g' => 10.0],
        'foods' => [],
        'nutrients' => [],
    ];

    public function test_it_recommends_a_recipe_using_an_expiring_ingredient(): void
    {
        $user = User::factory()->create();

        PantryItem::factory()->for($user)->create([
            'name' => 'Carrots', 'added_at' => now(), 'expiration_date' => now()->addDays(2), 'opened_at' => null,
        ]);
        $recipe = Recipe::factory()->for($user)->create([
            'name' => 'Vegetable Soup',
            'ingredients' => [['name' => 'Carrots', 'quantity' => 200, 'unit' => 'g', 'cronometer_food_id' => null]],
        ]);

        $response = $this->actingAs($user)->getJson('/api/recipes/recommendations');

        $response->assertOk()
            ->assertJsonCount(1, 'recommendations')
            ->assertJsonPath('recommendations.0.recipe.id', $recipe->id)
            ->assertJsonPath('recommendations.0.matches.0.ingredient', 'Carrots')
            ->assertJsonPath('recommendations.0.matches.0.pantry_item', 'Carrots');
    }

    public function test_matching_is_word_based_not_exact(): void
    {
        $user = User::factory()->create();

        PantryItem::factory()->for($user)->create([
            'name' => 'Beans, Kidney, Red, Mature Seeds, Raw', 'added_at' => now(), 'expiration_date' => now()->addDays(1), 'opened_at' => null,
        ]);
        Recipe::factory()->for($user)->create([
            'name' => 'Chili', 'ingredients' => [['name' => 'kidney beans', 'quantity' => 200, 'unit' => 'g', 'cronometer_food_id' => null]],
        ]);

        $response = $this->actingAs($user)->getJson('/api/recipes/recommendations');

        $response->assertOk()->assertJsonCount(1, 'recommendations');
    }

    public function test_it_does_not_recommend_a_recipe_with_no_expiring_ingredients(): void
    {
        $user = User::factory()->create();

        PantryItem::factory()->for($user)->create([
            'name' => 'Rice', 'added_at' => now(), 'expiration_date' => now()->addMonths(6), 'opened_at' => null,
        ]);
        Recipe::factory()->for($user)->create([
            'name' => 'Vegetable Soup',
            'ingredients' => [['name' => 'Carrots', 'quantity' => 200, 'unit' => 'g', 'cronometer_food_id' => null]],
        ]);

        $response = $this->actingAs($user)->getJson('/api/recipes/recommendations');

        $response->assertOk()->assertJsonCount(0, 'recommendations');
    }

    public function test_only_the_most_recently_made_version_of_a_name_is_considered(): void
    {
        $user = User::factory()->create();

        PantryItem::factory()->for($user)->create([
            'name' => 'Carrots', 'added_at' => now(), 'expiration_date' => now()->addDays(1), 'opened_at' => null,
        ]);
        Recipe::factory()->for($user)->create([
            'name' => 'Vegetable Soup', 'made_at' => now()->subMonth(),
            'ingredients' => [['name' => 'Carrots', 'quantity' => 200, 'unit' => 'g', 'cronometer_food_id' => null]],
        ]);
        $latest = Recipe::factory()->for($user)->create([
            'name' => 'Vegetable Soup', 'made_at' => now(),
            'ingredients' => [['name' => 'Potato', 'quantity' => 200, 'unit' => 'g', 'cronometer_food_id' => null]],
        ]);

        $response = $this->actingAs($user)->getJson('/api/recipes/recommendations');

        // Only the latest "Vegetable Soup" is considered, and its ingredients (potato)
        // don't match the expiring carrots — so no recommendation, even though an
        // older version of the same name would have matched.
        $response->assertOk()->assertJsonCount(0, 'recommendations');
        $this->assertNotNull($latest);
    }

    public function test_it_includes_todays_cronometer_summary_when_configured(): void
    {
        $user = User::factory()->create();
        $this->configureCronometer($user);
        $this->fakeCronometerBridge($this->overviewPayload);

        $response = $this->actingAs($user)->getJson('/api/recipes/recommendations');

        $response->assertOk()->assertJsonPath('today.calories.consumed', 1000);
    }

    public function test_today_is_null_when_cronometer_is_not_configured(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->getJson('/api/recipes/recommendations');

        $response->assertOk()->assertJsonPath('today', null);
    }

    public function test_it_computes_recipe_nutrition_when_an_ingredient_is_linked(): void
    {
        $user = User::factory()->create();
        $this->configureCronometer($user);
        $this->fakeCronometerBridge($this->overviewPayload, [
            111 => ['calories' => 41, 'protein_g' => 0.9, 'carbs_g' => 9.6, 'fat_g' => 0.2, 'fiber_g' => 2.8],
        ]);

        PantryItem::factory()->for($user)->create([
            'name' => 'Carrots', 'added_at' => now(), 'expiration_date' => now()->addDays(1), 'opened_at' => null,
        ]);
        Recipe::factory()->for($user)->create([
            'name' => 'Vegetable Soup',
            'ingredients' => [['name' => 'Carrots', 'quantity' => 200, 'unit' => 'g', 'cronometer_food_id' => '111']],
        ]);

        $response = $this->actingAs($user)->getJson('/api/recipes/recommendations');

        // 200g of carrots = 2x the per-100g figures.
        $response->assertOk()
            ->assertJsonPath('recommendations.0.nutrition.calories', 82.0)
            ->assertJsonPath('recommendations.0.nutrition.protein_g', 1.8);
    }

    public function test_recipe_nutrition_is_null_when_no_ingredient_is_linked(): void
    {
        $user = User::factory()->create();
        $this->configureCronometer($user);
        $this->fakeCronometerBridge($this->overviewPayload);

        PantryItem::factory()->for($user)->create([
            'name' => 'Carrots', 'added_at' => now(), 'expiration_date' => now()->addDays(1), 'opened_at' => null,
        ]);
        Recipe::factory()->for($user)->create([
            'name' => 'Vegetable Soup',
            'ingredients' => [['name' => 'Carrots', 'quantity' => 200, 'unit' => 'g', 'cronometer_food_id' => null]],
        ]);

        $response = $this->actingAs($user)->getJson('/api/recipes/recommendations');

        $response->assertOk()->assertJsonPath('recommendations.0.nutrition', null);
    }

    public function test_guests_cannot_access_recommendations(): void
    {
        $this->getJson('/api/recipes/recommendations')->assertUnauthorized();
    }
}
