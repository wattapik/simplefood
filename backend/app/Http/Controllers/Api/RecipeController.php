<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreRecipeRequest;
use App\Http\Requests\UpdateRecipeRequest;
use App\Http\Resources\RecipeResource;
use App\Models\Recipe;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

class RecipeController extends Controller
{
    /**
     * List the user's recipes, most recently made first. Every time a dish was made
     * is its own row (see Recipe), so the same name can appear many times — this
     * intentionally returns all of them rather than collapsing to one per name, so
     * search shows the full history of a dish.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $query = $request->user()->recipes()->orderByDesc('made_at')->orderByDesc('id');

        if ($request->filled('search')) {
            $query->where('name', 'like', '%'.$request->string('search').'%');
        }

        return RecipeResource::collection($query->get());
    }

    /**
     * Record one instance of making a dish — a new row every time you actually make
     * it again, never an edit of a previous one, since what actually went in tends
     * to drift from one time to the next (see Recipe's own docblock).
     */
    public function store(StoreRecipeRequest $request): JsonResponse
    {
        $recipe = $request->user()->recipes()->create([
            ...$request->validated(),
            'made_at' => $request->validated('made_at') ?? now()->toDateString(),
        ]);

        return response()->json(['data' => new RecipeResource($recipe)], 201);
    }

    /**
     * Fix or extend one already-recorded entry — a mistyped/forgotten-ingredient
     * correction, distinct from store() above: this edits the same row rather than
     * adding a new one, for when the recording itself was wrong or incomplete
     * (e.g. you said 200g of carrots but it was actually 250g, or forgot to mention
     * the potato), not for a genuinely new occasion of making the dish.
     */
    public function update(UpdateRecipeRequest $request, Recipe $recipe): JsonResponse
    {
        $recipe->update($request->validated());

        return response()->json(['data' => new RecipeResource($recipe)]);
    }

    public function destroy(Recipe $recipe): Response
    {
        $recipe->delete();

        return response()->noContent();
    }
}
