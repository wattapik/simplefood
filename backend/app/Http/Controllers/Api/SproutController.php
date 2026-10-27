<?php

namespace App\Http\Controllers\Api;

use App\Enums\PantryLocation;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreSproutRequest;
use App\Http\Requests\UpdateSproutRequest;
use App\Http\Resources\SproutResource;
use App\Models\Sprout;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

class SproutController extends Controller
{
    /**
     * List the user's sprout batches, still-growing ones first (soonest ready date
     * first), then harvested ones most recently harvested first.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $query = $request->user()->sprouts()
            ->orderByRaw('harvested_at is not null')
            ->orderBy('estimated_ready_at')
            ->orderByDesc('harvested_at');

        if ($request->string('status')->toString() === 'growing') {
            $query->whereNull('harvested_at');
        } elseif ($request->string('status')->toString() === 'harvested') {
            $query->whereNotNull('harvested_at');
        }

        return SproutResource::collection($query->get());
    }

    /**
     * Start tracking a new batch of seeds set to sprout, e.g. "I've just set 50g of
     * broccoli seeds to sprout in dirt".
     */
    public function store(StoreSproutRequest $request): JsonResponse
    {
        $sprout = $request->user()->sprouts()->create([
            ...$request->validated(),
            'started_at' => $request->validated('started_at') ?? now(),
        ]);

        return response()->json(['data' => new SproutResource($sprout)], 201);
    }

    /**
     * Correct or extend a tracked batch — e.g. fixing the seed weight, medium, or
     * ready-date estimate. Does not harvest it; see harvest() for that.
     */
    public function update(UpdateSproutRequest $request, Sprout $sprout): JsonResponse
    {
        $sprout->update($request->validated());

        return response()->json(['data' => new SproutResource($sprout)]);
    }

    /**
     * Stop tracking a batch entirely, e.g. it went moldy and was thrown out. If it was
     * already harvested into a pantry item, that pantry item is left alone — this only
     * removes the sprouting record.
     */
    public function destroy(Sprout $sprout): Response
    {
        $sprout->delete();

        return response()->noContent();
    }

    /**
     * Mark a batch as finished growing and move it into the fridge as a pantry item,
     * using Claude's (or the user's own) best estimate of how long it'll keep. The
     * harvested amount is independent of the seed weight originally recorded — sprouts
     * grow well beyond their seed's weight — so it's only known if given here; otherwise
     * the pantry item is recorded as existing without a specific amount.
     */
    public function harvest(Request $request, Sprout $sprout): JsonResponse
    {
        if ($sprout->harvested_at) {
            return response()->json(['message' => 'This batch has already been harvested.'], 422);
        }

        $validated = $request->validate([
            'quantity' => ['nullable', 'numeric', 'min:0'],
            'unit' => ['nullable', 'string', 'max:32', 'required_with:quantity'],
            'expiration_date' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
        ]);

        $pantryItem = $sprout->user->pantryItems()->create([
            'name' => $sprout->seed_name,
            'quantity' => $validated['quantity'] ?? 1,
            'unit' => $validated['unit'] ?? 'batch',
            'category' => 'Sprouts',
            'location' => PantryLocation::Fridge,
            'added_at' => now(),
            'expiration_date' => $validated['expiration_date'] ?? null,
            'notes' => $validated['notes'] ?? $sprout->notes,
        ]);

        $sprout->update([
            'harvested_at' => now(),
            'pantry_item_id' => $pantryItem->id,
        ]);

        return response()->json(['data' => new SproutResource($sprout)]);
    }
}
