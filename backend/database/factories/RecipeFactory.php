<?php

namespace Database\Factories;

use App\Models\Recipe;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Recipe>
 */
class RecipeFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'name' => $this->faker->randomElement(['Vegetable Soup', 'Chicken Curry', 'Lentil Stew', 'Fried Rice']),
            'made_at' => $this->faker->dateTimeBetween('-2 months', 'now'),
            'ingredients' => [
                ['name' => 'Carrots', 'quantity' => 200, 'unit' => 'g', 'cronometer_food_id' => null],
                ['name' => 'Onion', 'quantity' => 100, 'unit' => 'g', 'cronometer_food_id' => null],
            ],
            'notes' => $this->faker->optional()->sentence(),
        ];
    }
}
