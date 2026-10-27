<?php

namespace App\Services;

use App\Enums\PantryLocation;
use App\Models\User;
use App\Support\UnitConverter;
use RuntimeException;

class PantryStatsService
{
    public function __construct(private CronometerService $cronometer) {}

    /**
     * Sum calories/macros across the whole pantry (and per location), based on each
     * item's quantity and its linked Cronometer food's nutrition-per-100g. Items with
     * no linked Cronometer food, or a unit that can't be converted to grams/mL at all
     * (e.g. pcs), are left out of the totals and listed under `excluded` so the numbers
     * stay honest. ml/l items are included using an approximate 1ml≈1g conversion (see
     * UnitConverter::toGramsApprox) and listed under `approximated` so that's visible too.
     *
     * Also returns `items`: each item's nutrition-per-100g ("density"), keyed by id, for
     * the pantry list's sort/filter-by-nutrient UI. This is independent of quantity/unit
     * convertibility — even a `pcs`-tracked item has a well-defined density once linked to
     * a Cronometer food, even though it can't contribute to the scaled totals above.
     *
     * @return array<string, mixed>
     */
    public function compute(User $user): array
    {
        // Fail fast with one clear error rather than the same "not configured" message
        // once per pantry item.
        $this->cronometer->assertConfigured($user);

        $totals = self::emptyTotals();
        $byLocation = [];
        foreach (PantryLocation::cases() as $location) {
            $byLocation[$location->value] = self::emptyTotals();
        }

        $excluded = [];
        $approximated = [];
        $items = [];

        foreach ($user->pantryItems as $item) {
            if (! $item->cronometer_food_id) {
                $excluded[] = ['name' => $item->name, 'reason' => 'not linked to a Cronometer food'];
                $items[$item->id] = null;

                continue;
            }

            try {
                $per100g = $this->cronometer->nutritionForFood($user, (int) $item->cronometer_food_id);
            } catch (RuntimeException $e) {
                $excluded[] = ['name' => $item->name, 'reason' => $e->getMessage()];
                $items[$item->id] = null;

                continue;
            }

            $items[$item->id] = self::round($per100g);

            $exactGrams = UnitConverter::toGrams((float) $item->quantity, $item->unit);
            $grams = $exactGrams ?? UnitConverter::toGramsApprox((float) $item->quantity, $item->unit);

            if ($grams === null) {
                $excluded[] = ['name' => $item->name, 'reason' => "unit \"{$item->unit}\" can't be converted to grams"];

                continue;
            }

            if ($exactGrams === null) {
                $approximated[] = ['name' => $item->name, 'unit' => $item->unit];
            }

            $contribution = self::scale($per100g, $grams / 100);

            $totals = self::add($totals, $contribution);
            $byLocation[$item->location->value] = self::add($byLocation[$item->location->value], $contribution);
        }

        return [
            'overall' => self::round($totals),
            'by_location' => array_map(fn (array $t) => self::round($t), $byLocation),
            'excluded' => $excluded,
            'approximated' => $approximated,
            'items' => $items,
        ];
    }

    /**
     * @return array{calories: float, protein_g: float, carbs_g: float, fat_g: float, fiber_g: float}
     */
    private static function emptyTotals(): array
    {
        return ['calories' => 0.0, 'protein_g' => 0.0, 'carbs_g' => 0.0, 'fat_g' => 0.0, 'fiber_g' => 0.0];
    }

    /**
     * @param  array<string, float>  $totals
     * @return array<string, float>
     */
    private static function scale(array $totals, float $factor): array
    {
        return array_map(fn (float $v) => $v * $factor, $totals);
    }

    /**
     * @param  array<string, float>  $a
     * @param  array<string, float>  $b
     * @return array<string, float>
     */
    private static function add(array $a, array $b): array
    {
        foreach ($a as $key => $value) {
            $a[$key] = $value + $b[$key];
        }

        return $a;
    }

    /**
     * @param  array<string, float>  $totals
     * @return array<string, float>
     */
    private static function round(array $totals): array
    {
        return array_map(fn (float $v) => round($v, 1), $totals);
    }
}
