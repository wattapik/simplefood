<?php

namespace Tests\Feature;

use App\Models\Recipe;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RecipeApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_creates_a_recipe_defaulting_made_at_to_today(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/recipes', [
            'name' => 'Vegetable Soup',
            'ingredients' => [
                ['name' => 'Carrots', 'quantity' => 200, 'unit' => 'g'],
                ['name' => 'Onion', 'quantity' => 100, 'unit' => 'g'],
            ],
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.name', 'Vegetable Soup')
            ->assertJsonPath('data.made_at', now()->toDateString())
            ->assertJsonPath('data.ingredients.0.name', 'Carrots');

        $this->assertDatabaseHas('recipes', ['user_id' => $user->id, 'name' => 'Vegetable Soup']);
    }

    public function test_made_at_can_be_set_explicitly(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/recipes', [
            'name' => 'Vegetable Soup',
            'made_at' => '2026-01-15',
            'ingredients' => [['name' => 'Carrots', 'quantity' => 200, 'unit' => 'g']],
        ]);

        $response->assertCreated()->assertJsonPath('data.made_at', '2026-01-15');
    }

    public function test_ingredients_can_carry_an_optional_cronometer_food_id(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/recipes', [
            'name' => 'Vegetable Soup',
            'ingredients' => [['name' => 'Carrots', 'quantity' => 200, 'unit' => 'g', 'cronometer_food_id' => '12345']],
        ]);

        $response->assertCreated()->assertJsonPath('data.ingredients.0.cronometer_food_id', '12345');
    }

    public function test_it_requires_a_name_and_at_least_one_ingredient(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/recipes', ['ingredients' => []])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name', 'ingredients']);
    }

    public function test_each_ingredient_requires_a_name_quantity_and_unit(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/recipes', [
            'name' => 'Vegetable Soup',
            'ingredients' => [['name' => 'Carrots']],
        ])->assertUnprocessable()->assertJsonValidationErrors(['ingredients.0.quantity', 'ingredients.0.unit']);
    }

    public function test_it_lists_recipes_most_recently_made_first(): void
    {
        $user = User::factory()->create();
        $older = Recipe::factory()->for($user)->create(['made_at' => now()->subDays(10)]);
        $newer = Recipe::factory()->for($user)->create(['made_at' => now()->subDay()]);

        $response = $this->actingAs($user)->getJson('/api/recipes');

        $response->assertOk()
            ->assertJsonPath('data.0.id', $newer->id)
            ->assertJsonPath('data.1.id', $older->id);
    }

    public function test_it_searches_recipes_by_name(): void
    {
        $user = User::factory()->create();
        Recipe::factory()->for($user)->create(['name' => 'Vegetable Soup']);
        Recipe::factory()->for($user)->create(['name' => 'Chicken Curry']);

        $response = $this->actingAs($user)->getJson('/api/recipes?search=soup');

        $response->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'Vegetable Soup');
    }

    public function test_the_same_name_can_have_multiple_versions(): void
    {
        $user = User::factory()->create();
        Recipe::factory()->for($user)->create([
            'name' => 'Vegetable Soup', 'made_at' => now()->subMonth(),
            'ingredients' => [['name' => 'Carrots', 'quantity' => 200, 'unit' => 'g']],
        ]);
        Recipe::factory()->for($user)->create([
            'name' => 'Vegetable Soup', 'made_at' => now(),
            'ingredients' => [['name' => 'Carrots', 'quantity' => 250, 'unit' => 'g']],
        ]);

        $response = $this->actingAs($user)->getJson('/api/recipes?search=Vegetable Soup');

        $response->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_it_deletes_a_recipe(): void
    {
        $user = User::factory()->create();
        $recipe = Recipe::factory()->for($user)->create();

        $this->actingAs($user)->deleteJson("/api/recipes/{$recipe->id}")->assertNoContent();

        $this->assertDatabaseMissing('recipes', ['id' => $recipe->id]);
    }

    public function test_a_user_cannot_delete_another_users_recipe(): void
    {
        $userA = User::factory()->create();
        $userB = User::factory()->create();
        $recipe = Recipe::factory()->for($userA)->create();

        $this->actingAs($userB)->deleteJson("/api/recipes/{$recipe->id}")->assertNotFound();

        $this->assertDatabaseHas('recipes', ['id' => $recipe->id]);
    }

    public function test_it_updates_an_ingredients_quantity(): void
    {
        $user = User::factory()->create();
        $recipe = Recipe::factory()->for($user)->create([
            'ingredients' => [['name' => 'Carrots', 'quantity' => 200, 'unit' => 'g', 'cronometer_food_id' => null]],
        ]);

        $response = $this->actingAs($user)->putJson("/api/recipes/{$recipe->id}", [
            'ingredients' => [['name' => 'Carrots', 'quantity' => 250, 'unit' => 'g', 'cronometer_food_id' => null]],
        ]);

        $response->assertOk()->assertJsonPath('data.ingredients.0.quantity', 250);
        $this->assertEquals(250, $recipe->fresh()->ingredients[0]['quantity']);
    }

    public function test_it_adds_a_new_ingredient_to_an_existing_recipe(): void
    {
        $user = User::factory()->create();
        $recipe = Recipe::factory()->for($user)->create([
            'ingredients' => [['name' => 'Carrots', 'quantity' => 200, 'unit' => 'g', 'cronometer_food_id' => null]],
        ]);

        $response = $this->actingAs($user)->putJson("/api/recipes/{$recipe->id}", [
            'ingredients' => [
                ['name' => 'Carrots', 'quantity' => 200, 'unit' => 'g', 'cronometer_food_id' => null],
                ['name' => 'Potato', 'quantity' => 150, 'unit' => 'g', 'cronometer_food_id' => null],
            ],
        ]);

        $response->assertOk()->assertJsonCount(2, 'data.ingredients')->assertJsonPath('data.ingredients.1.name', 'Potato');
    }

    public function test_updating_a_recipe_does_not_require_every_field(): void
    {
        $user = User::factory()->create();
        $recipe = Recipe::factory()->for($user)->create(['name' => 'Vegetable Soup', 'notes' => null]);

        $response = $this->actingAs($user)->putJson("/api/recipes/{$recipe->id}", ['notes' => 'a bit too salty']);

        $response->assertOk()
            ->assertJsonPath('data.name', 'Vegetable Soup')
            ->assertJsonPath('data.notes', 'a bit too salty');
    }

    public function test_a_user_cannot_update_another_users_recipe(): void
    {
        $userA = User::factory()->create();
        $userB = User::factory()->create();
        $recipe = Recipe::factory()->for($userA)->create(['name' => 'Original']);

        $this->actingAs($userB)->putJson("/api/recipes/{$recipe->id}", ['name' => 'Hijacked'])->assertNotFound();

        $this->assertEquals('Original', $recipe->fresh()->name);
    }

    public function test_users_only_see_their_own_recipes(): void
    {
        $userA = User::factory()->create();
        $userB = User::factory()->create();
        Recipe::factory()->for($userA)->create();

        $response = $this->actingAs($userB)->getJson('/api/recipes');

        $response->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_guests_cannot_access_recipes(): void
    {
        $this->getJson('/api/recipes')->assertUnauthorized();
        $this->postJson('/api/recipes', [])->assertUnauthorized();
        $this->putJson('/api/recipes/1', [])->assertUnauthorized();
        $this->deleteJson('/api/recipes/1')->assertUnauthorized();
    }
}
