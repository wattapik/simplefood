<?php

namespace Database\Factories;

use App\Enums\PantryLocation;
use App\Models\PantryItem;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PantryItem>
 */
class PantryItemFactory extends Factory
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
            'name' => $this->faker->randomElement(['Rolled Oats', 'Chicken Breast', 'Frozen Peas', 'Cheddar Cheese', 'Brown Rice']),
            'brand' => $this->faker->optional()->company(),
            'quantity' => $this->faker->randomFloat(2, 1, 2000),
            'unit' => $this->faker->randomElement(['g', 'kg', 'ml', 'l', 'pcs']),
            'category' => $this->faker->randomElement(['Grains', 'Meat', 'Vegetables', 'Dairy', 'Snacks']),
            'location' => $this->faker->randomElement(PantryLocation::cases()),
            'added_at' => $this->faker->dateTimeBetween('-3 months', 'now'),
            'expiration_date' => $this->faker->optional()->dateTimeBetween('now', '+6 months'),
            'cronometer_food_id' => null,
            'notes' => $this->faker->optional()->sentence(),
        ];
    }

    /**
     * Indicate that the item expires soon.
     */
    public function expiringSoon(): static
    {
        return $this->state(fn (array $attributes) => [
            'expiration_date' => now()->addDays(3),
        ]);
    }
}
