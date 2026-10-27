<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\RecipeRecommendationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RecipeRecommendationController extends Controller
{
    public function __construct(private RecipeRecommendationService $recommendations) {}

    /**
     * Previously-made recipes that use something currently expiring soon in the
     * pantry, with each recipe's own nutrition (when linked to Cronometer foods)
     * and today's Cronometer totals for context.
     */
    public function index(Request $request): JsonResponse
    {
        return response()->json($this->recommendations->compute($request->user()), 200, options: JSON_PRESERVE_ZERO_FRACTION);
    }
}
