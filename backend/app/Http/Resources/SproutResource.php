<?php

namespace App\Http\Resources;

use App\Models\Sprout;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Sprout */
class SproutResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'seed_name' => $this->seed_name,
            'medium' => $this->medium,
            'seed_quantity' => $this->seed_quantity !== null ? (float) $this->seed_quantity : null,
            'seed_unit' => $this->seed_unit,
            'started_at' => $this->started_at?->toIso8601String(),
            'estimated_ready_at' => $this->estimated_ready_at?->toDateString(),
            'harvested_at' => $this->harvested_at?->toIso8601String(),
            'pantry_item_id' => $this->pantry_item_id,
            'notes' => $this->notes,
            'is_harvested' => (bool) $this->harvested_at,
            'is_overdue' => ! $this->harvested_at && (bool) $this->estimated_ready_at?->isPast(),
        ];
    }
}
