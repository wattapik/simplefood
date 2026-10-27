<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateCronometerDiaryEntryRequest;
use App\Services\CronometerService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

class CronometerDiaryController extends Controller
{
    public function __construct(private CronometerService $cronometer) {}

    /**
     * Today's basic Cronometer overview (calories, macros, foods logged).
     */
    public function today(Request $request): JsonResponse
    {
        try {
            return response()->json($this->cronometer->todayOverview($request->user(), forceRefresh: $request->boolean('refresh')));
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    /**
     * Remove one food logged today, then return the refreshed overview.
     */
    public function destroy(Request $request, string $entryId): JsonResponse
    {
        try {
            $this->cronometer->removeDiaryEntry($request->user(), $entryId);

            return response()->json($this->cronometer->todayOverview($request->user(), forceRefresh: true));
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    /**
     * Change the amount logged for one food today, then return the refreshed overview.
     */
    public function update(UpdateCronometerDiaryEntryRequest $request, string $entryId): JsonResponse
    {
        try {
            $this->cronometer->updateDiaryEntry(
                $request->user(),
                $entryId,
                $request->validated('food_id'),
                $request->validated('measure_id'),
                $request->validated('grams'),
            );

            return response()->json($this->cronometer->todayOverview($request->user(), forceRefresh: true));
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }
}
