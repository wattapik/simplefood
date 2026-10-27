<?php

namespace App\Models;

use Database\Factories\SproutFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One batch of seeds set to sprout — from when the user starts it (e.g. "I've just set
 * 50g of broccoli seeds to sprout in dirt") through to harvest, at which point it's
 * marked harvested and a corresponding PantryItem is created in the fridge (see
 * SproutController::harvest). seed_quantity/seed_unit are nullable because the user may
 * not say how much seed they used — this still gets tracked, just without an amount.
 */
#[Fillable(['seed_name', 'medium', 'seed_quantity', 'seed_unit', 'started_at', 'estimated_ready_at', 'harvested_at', 'pantry_item_id', 'notes'])]
class Sprout extends Model
{
    /** @use HasFactory<SproutFactory> */
    use HasFactory;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'seed_quantity' => 'decimal:2',
            'started_at' => 'datetime',
            'estimated_ready_at' => 'date',
            'harvested_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return BelongsTo<PantryItem, $this>
     */
    public function pantryItem(): BelongsTo
    {
        return $this->belongsTo(PantryItem::class);
    }

    /**
     * Scope route-model binding to the authenticated user, same as PantryItem and
     * Recipe — one account can't view or modify another's sprouts by guessing an id.
     */
    public function resolveRouteBinding($value, $field = null): ?self
    {
        return $this->where($field ?? $this->getRouteKeyName(), $value)
            ->where('user_id', request()->user()?->id)
            ->firstOrFail();
    }
}
