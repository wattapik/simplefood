<?php

namespace Database\Factories;

use App\Models\Sprout;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Sprout>
 */
class SproutFactory extends Factory
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
            'seed_name' => $this->faker->randomElement(['Broccoli seeds', 'Alfalfa seeds', 'Mung beans', 'Radish seeds']),
            'medium' => $this->faker->randomElement(['sprout jar', 'dirt tray']),
            'seed_quantity' => $this->faker->optional()->randomFloat(2, 10, 100),
            'seed_unit' => 'g',
            'started_at' => $this->faker->dateTimeBetween('-2 weeks', 'now'),
            'estimated_ready_at' => $this->faker->dateTimeBetween('now', '+1 week'),
            'harvested_at' => null,
            'pantry_item_id' => null,
            'notes' => $this->faker->optional()->sentence(),
        ];
    }

    /**
     * Indicate that this batch has already been harvested.
     */
    public function harvested(): static
    {
        return $this->state(fn (array $attributes) => [
            'harvested_at' => now(),
        ]);
    }
}
