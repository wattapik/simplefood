<?php

namespace App\Services;

use App\Http\Resources\RecipeResource;
use App\Models\Recipe;
use App\Models\User;
use App\Support\UnitConverter;
use RuntimeException;

/**
 * "Pull from pantry → suggest recipes that use what's expiring soon" (the recipe
 * recommendations idea from the app's own feature notes). Deliberately simple, per
 * that same note: this only ever resurfaces recipes the user has actually made
 * before — nothing here invents a new recipe or a numeric nutrition target to hit.
 * For the "cross-reference with Cronometer" idea, there's no per-nutrient target
 * exposed by the Cronometer API to compute a real gap against (see the Diary tab's
 * nutrition score for the same limitation) — so instead of fabricating one, this
 * just returns each recipe's own computed nutrition (when its ingredients are
 * linked to Cronometer foods) alongside today's totals, so the user can make that
 * judgment call themselves with real numbers on both sides.
 */
class RecipeRecommendationService
{
    public function __construct(
        private PantryAttentionService $attention,
        private CronometerService $cronometer
    ) {}

    /**
     * @return array{recommendations: array<int, mixed>, today: array{calories: mixed, macros: mixed}|null}
     */
    public function compute(User $user): array
    {
        $expiring = $this->attention->compute($user)['expiring'];

        $latestPerName = $user->recipes()
            ->orderByDesc('made_at')
            ->orderByDesc('id')
            ->get()
            ->unique('name')
            ->values();

        $cronometerConfigured = $this->isCronometerConfigured($user);

        $recommendations = $latestPerName
            ->map(function (Recipe $recipe) use ($expiring, $user, $cronometerConfigured) {
                $matches = $this->matchExpiringIngredients($recipe, $expiring);

                if ($matches === []) {
                    return null;
                }

                return [
                    'recipe' => (new RecipeResource($recipe))->resolve(),
                    'matches' => $matches,
                    'nutrition' => $cronometerConfigured ? $this->computeNutrition($user, $recipe) : null,
                ];
            })
            ->filter()
            ->sortByDesc(fn (array $r) => count($r['matches']))
            ->values()
            ->all();

        return [
            'recommendations' => $recommendations,
            'today' => $this->todaySummary($user),
        ];
    }

    /**
     * @param  array<int, array{name: string, effective_expiration_date: ?string}>  $expiring
     * @return array<int, array{ingredient: string, pantry_item: string, effective_expiration_date: ?string}>
     */
    private function matchExpiringIngredients(Recipe $recipe, array $expiring): array
    {
        $matches = [];

        foreach ($recipe->ingredients as $ingredient) {
            foreach ($expiring as $item) {
                if (self::namesLooselyMatch($ingredient['name'], $item['name'])) {
                    $matches[] = [
                        'ingredient' => $ingredient['name'],
                        'pantry_item' => $item['name'],
                        'effective_expiration_date' => $item['effective_expiration_date'],
                    ];
                }
            }
        }

        return $matches;
    }

    /**
     * @return array{calories: float, protein_g: float, carbs_g: float, fat_g: float, fiber_g: float}|null
     *                                                                                                     null if no ingredient is linked to a Cronometer food.
     */
    private function computeNutrition(User $user, Recipe $recipe): ?array
    {
        $totals = ['calories' => 0.0, 'protein_g' => 0.0, 'carbs_g' => 0.0, 'fat_g' => 0.0, 'fiber_g' => 0.0];
        $anyLinked = false;

        foreach ($recipe->ingredients as $ingredient) {
            if (empty($ingredient['cronometer_food_id'])) {
                continue;
            }

            try {
                $per100g = $this->cronometer->nutritionForFood($user, (int) $ingredient['cronometer_food_id']);
            } catch (RuntimeException) {
                continue;
            }

            $quantity = (float) $ingredient['quantity'];
            $grams = UnitConverter::toGrams($quantity, $ingredient['unit']) ?? UnitConverter::toGramsApprox($quantity, $ingredient['unit']);

            if ($grams === null) {
                continue;
            }

            $anyLinked = true;
            $factor = $grams / 100;
            foreach ($totals as $key => $value) {
                $totals[$key] = $value + ($per100g[$key] * $factor);
            }
        }

        if (! $anyLinked) {
            return null;
        }

        return array_map(fn (float $v) => round($v, 1), $totals);
    }

    /**
     * @return array{calories: mixed, macros: mixed}|null
     */
    private function todaySummary(User $user): ?array
    {
        try {
            $overview = $this->cronometer->todayOverview($user);
        } catch (RuntimeException) {
            return null;
        }

        return ['calories' => $overview['calories'], 'macros' => $overview['macros']];
    }

    private function isCronometerConfigured(User $user): bool
    {
        try {
            $this->cronometer->assertConfigured($user);

            return true;
        } catch (RuntimeException) {
            return false;
        }
    }

    /**
     * Loose match on shared significant words (length > 3) rather than a plain
     * substring check both ways — pantry item names and hand-typed ingredient names
     * rarely share word order (e.g. "kidney beans" vs "Beans, Kidney, Red, Mature
     * Seeds, Raw"), and this is a lightweight way to catch that without any external
     * matching library.
     */
    private static function namesLooselyMatch(string $a, string $b): bool
    {
        return array_intersect(self::significantWords($a), self::significantWords($b)) !== [];
    }

    /**
     * @return array<int, string>
     */
    private static function significantWords(string $text): array
    {
        preg_match_all('/[a-z]+/', strtolower($text), $matches);

        return array_values(array_filter($matches[0], fn (string $w) => strlen($w) > 3));
    }
}
