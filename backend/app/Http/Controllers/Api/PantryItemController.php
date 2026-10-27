<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StorePantryItemRequest;
use App\Http\Requests\UpdatePantryItemRequest;
use App\Http\Resources\PantryItemResource;
use App\Models\PantryItem;
use App\Support\UnitConverter;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Validation\ValidationException;

class PantryItemController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $query = $request->user()->pantryItems()->orderBy('expiration_date')->orderBy('name');

        if ($request->filled('location')) {
            $query->where('location', $request->string('location'));
        }

        if ($request->filled('category')) {
            $query->where('category', $request->string('category'));
        }

        if ($request->filled('search')) {
            $query->where('name', 'like', '%'.$request->string('search').'%');
        }

        if ($request->filled('expiring_within_days')) {
            $query->whereNotNull('expiration_date')
                ->whereDate('expiration_date', '<=', now()->addDays((int) $request->integer('expiring_within_days')));
        }

        return PantryItemResource::collection($query->get());
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(StorePantryItemRequest $request): PantryItemResource
    {
        $item = $request->user()->pantryItems()->create([
            ...$request->validated(),
            'added_at' => $request->validated('added_at') ?? now(),
        ]);

        return PantryItemResource::make($item);
    }

    /**
     * Display the specified resource.
     */
    public function show(PantryItem $pantryItem): PantryItemResource
    {
        return PantryItemResource::make($pantryItem);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(UpdatePantryItemRequest $request, PantryItem $pantryItem): PantryItemResource
    {
        $pantryItem->update($request->validated());

        return PantryItemResource::make($pantryItem);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(PantryItem $pantryItem): Response
    {
        $pantryItem->delete();

        return response()->noContent();
    }

    /**
     * Deduct an eaten/used amount from a pantry item. Used by the pantry MCP server
     * when logging what was eaten (e.g. "100g oats"). Deletes the item once its
     * quantity reaches zero, since a fully-consumed item is no longer in the pantry.
     */
    public function consume(Request $request, PantryItem $pantryItem): PantryItemResource|Response
    {
        $validated = $request->validate([
            'quantity' => ['required', 'numeric', 'min:0.01'],
            'unit' => ['required', 'string', 'max:32'],
        ]);

        $amount = UnitConverter::convert((float) $validated['quantity'], $validated['unit'], $pantryItem->unit);

        if ($amount === null) {
            throw ValidationException::withMessages([
                'unit' => "Cannot convert {$validated['unit']} to this item's unit ({$pantryItem->unit}). Use the same unit as the pantry item.",
            ]);
        }

        $pantryItem->quantity = max(0, $pantryItem->quantity - $amount);

        if ($pantryItem->quantity <= 0) {
            $pantryItem->delete();

            return response()->noContent();
        }

        $pantryItem->save();

        return PantryItemResource::make($pantryItem);
    }
}
