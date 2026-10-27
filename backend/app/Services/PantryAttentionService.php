<?php

namespace App\Services;

use App\Http\Resources\PantryItemResource;
use App\Models\User;

/**
 * Surfaces the pantry's "out of sight, out of mind" problem: food that's physically
 * there but easy to forget about, either because it's quietly approaching its
 * expiration date or because it's just been sitting untouched since it was added.
 * Deliberately simple — no recipe suggestions or nutrient-gap cross-referencing here,
 * just "here's what needs your attention," matching how the rest of the app avoids
 * guessing (no invented shelf-life estimates, no assumed nutrition data).
 */
class PantryAttentionService
{
    /** How far ahead counts as "coming up soon" — wider than the 4-day highlight
     * threshold used elsewhere, since this is meant as a proactive weekly-style
     * heads-up rather than an urgent warning. */
    public const EXPIRING_WITHIN_DAYS = 7;

    /** How long an item can sit unopened before it's flagged as possibly forgotten. */
    public const STAGNANT_AFTER_DAYS = 21;

    /**
     * @return array{expiring: array<int, mixed>, stagnant: array<int, mixed>, expiring_within_days: int, stagnant_after_days: int}
     */
    public function compute(User $user): array
    {
        $items = $user->pantryItems;
        $horizon = now()->addDays(self::EXPIRING_WITHIN_DAYS);
        $stagnantCutoff = now()->subDays(self::STAGNANT_AFTER_DAYS);

        $expiring = $items
            ->filter(fn ($item) => $item->effectiveExpirationDate()?->lessThanOrEqualTo($horizon) ?? false)
            ->sortBy(fn ($item) => $item->effectiveExpirationDate())
            ->values();

        $stagnant = $items
            ->filter(fn ($item) => ! $item->opened_at && $item->added_at && $item->added_at->lessThanOrEqualTo($stagnantCutoff))
            ->sortBy(fn ($item) => $item->added_at)
            ->values();

        return [
            'expiring' => PantryItemResource::collection($expiring)->resolve(),
            'stagnant' => PantryItemResource::collection($stagnant)->resolve(),
            'expiring_within_days' => self::EXPIRING_WITHIN_DAYS,
            'stagnant_after_days' => self::STAGNANT_AFTER_DAYS,
        ];
    }
}
