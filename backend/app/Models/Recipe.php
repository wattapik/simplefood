<?php

namespace App\Models;

use Database\Factories\RecipeFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One instance of making a dish — not a single canonical "the recipe". The same
 * `name` can have many rows over time (e.g. "Vegetable Soup" made three different
 * times with three different ingredient lists), since what actually goes into a
 * dish drifts from one time to the next and that history is worth keeping rather
 * than overwriting. Making the dish again is always a new row (RecipeController
 * store()) — this row can still be edited in place (update()) to fix or extend
 * what was recorded for *this* occasion (a mistyped weight, a forgotten
 * ingredient), which is a correction, not a new occasion.
 */
#[Fillable(['name', 'made_at', 'ingredients', 'notes'])]
class Recipe extends Model
{
    /** @use HasFactory<RecipeFactory> */
    use HasFactory;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'made_at' => 'date',
            'ingredients' => 'array',
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
     * Scope route-model binding to the authenticated user, same as PantryItem — one
     * account can't view or delete another's recipes by guessing an id.
     */
    public function resolveRouteBinding($value, $field = null): ?self
    {
        return $this->where($field ?? $this->getRouteKeyName(), $value)
            ->where('user_id', request()->user()?->id)
            ->firstOrFail();
    }
}
