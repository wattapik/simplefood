<?php

namespace App\Support;

class UnitConverter
{
    /**
     * Convert an amount between compatible units (g<->kg, ml<->l). Returns null if
     * the units are the same-typed but not convertible (e.g. g to pcs).
     */
    public static function convert(float $amount, string $fromUnit, string $toUnit): ?float
    {
        $fromUnit = strtolower($fromUnit);
        $toUnit = strtolower($toUnit);

        if ($fromUnit === $toUnit) {
            return $amount;
        }

        $factors = [
            'g' => ['kg' => 0.001],
            'kg' => ['g' => 1000],
            'ml' => ['l' => 0.001],
            'l' => ['ml' => 1000],
        ];

        return isset($factors[$fromUnit][$toUnit]) ? $amount * $factors[$fromUnit][$toUnit] : null;
    }

    /**
     * Convert an amount to grams exactly. Only mass units (g/kg) are supported — count
     * units (pcs) have no defined weight, and volume units need `toGramsApprox` instead.
     */
    public static function toGrams(float $amount, string $unit): ?float
    {
        return self::convert($amount, $unit, 'g');
    }

    /**
     * Convert an amount to grams for nutrition estimates, treating ml/l as water-density
     * (1ml ≈ 1g) when no exact mass conversion applies. This is an approximation — most
     * food liquids (milk, juice, broth) are close enough to water's density that it's a
     * reasonable estimate, but it will be off for anything notably denser/lighter (oil,
     * syrup). Cronometer's own per-food "measures" data isn't a reliable alternative:
     * for at least one real product it returned an implausible ~100g/ml, which is almost
     * certainly a data-entry error in that (community-contributed) food, not a density we
     * should trust blindly. Count units (pcs) still return null — there's no reasonable
     * default weight for those at all.
     */
    public static function toGramsApprox(float $amount, string $unit): ?float
    {
        if (($grams = self::toGrams($amount, $unit)) !== null) {
            return $grams;
        }

        return self::convert($amount, $unit, 'ml');
    }
}
