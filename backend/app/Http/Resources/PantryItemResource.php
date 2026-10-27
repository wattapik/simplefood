<?php

namespace App\Http\Resources;

use App\Models\PantryItem;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin PantryItem */
class PantryItemResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $effectiveExpiration = $this->effectiveExpirationDate();

        return [
            'id' => $this->id,
            'name' => $this->name,
            'brand' => $this->brand,
            'quantity' => (float) $this->quantity,
            'unit' => $this->unit,
            'category' => $this->category,
            'location' => $this->location->value,
            'added_at' => $this->added_at?->toIso8601String(),
            'expiration_date' => $this->expiration_date?->toDateString(),
            'opened_at' => $this->opened_at?->toIso8601String(),
            'opened_expiration_date' => $this->opened_expiration_date?->toDateString(),
            'effective_expiration_date' => $effectiveExpiration?->toDateString(),
            'cronometer_food_id' => $this->cronometer_food_id,
            'notes' => $this->notes,
            'is_opened' => (bool) $this->opened_at,
            'is_expiring_soon' => (bool) $effectiveExpiration?->isBefore(now()->addDays(4)),
            'is_expired' => (bool) $effectiveExpiration?->isPast(),
        ];
    }
}
