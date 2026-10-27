<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\PantryStatsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

class PantryStatsController extends Controller
{
    public function __construct(private PantryStatsService $stats) {}

    /**
     * Calories/macros summed across the pantry (and per location), based on item
     * quantities and their linked Cronometer foods.
     */
    public function index(Request $request): JsonResponse
    {
        try {
            return response()->json($this->stats->compute($request->user()), 200, options: JSON_PRESERVE_ZERO_FRACTION);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }
}
