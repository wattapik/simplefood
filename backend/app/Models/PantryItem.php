<?php

namespace App\Models;

use App\Enums\PantryLocation;
use Carbon\CarbonInterface;
use Database\Factories\PantryItemFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'name',
    'brand',
    'quantity',
    'unit',
    'category',
    'location',
    'added_at',
    'expiration_date',
    'opened_at',
    'opened_expiration_date',
    'cronometer_food_id',
    'notes',
])]
class PantryItem extends Model
{
    /** @use HasFactory<PantryItemFactory> */
    use HasFactory;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'quantity' => 'decimal:2',
            'location' => PantryLocation::class,
            'added_at' => 'datetime',
            'expiration_date' => 'date',
            'opened_at' => 'datetime',
            'opened_expiration_date' => 'date',
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
     * Scope route-model binding (show/update/destroy/consume) to the authenticated
     * user, so one account can never look up, edit, or delete another's pantry items
     * by guessing an id — this fails as a 404, same as the item not existing at all.
     */
    public function resolveRouteBinding($value, $field = null): ?self
    {
        return $this->where($field ?? $this->getRouteKeyName(), $value)
            ->where('user_id', request()->user()?->id)
            ->firstOrFail();
    }

    /**
     * The date that should actually be used to judge freshness: once opened, that's
     * whichever is sooner of the original best-before date and the user's own estimate
     * of how long it's good for once opened (opened_expiration_date, which they set
     * themselves — this app doesn't guess shelf life after opening).
     */
    public function effectiveExpirationDate(): ?CarbonInterface
    {
        if (! $this->opened_at || ! $this->opened_expiration_date) {
            return $this->expiration_date;
        }

        if (! $this->expiration_date) {
            return $this->opened_expiration_date;
        }

        return $this->opened_expiration_date->lessThan($this->expiration_date)
            ? $this->opened_expiration_date
            : $this->expiration_date;
    }
}
