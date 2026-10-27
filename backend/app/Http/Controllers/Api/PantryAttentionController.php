<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\PantryAttentionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PantryAttentionController extends Controller
{
    public function __construct(private PantryAttentionService $attention) {}

    /**
     * Pantry items worth a second look: expiring soon, or sitting unopened long
     * enough to be easy to forget about.
     */
    public function index(Request $request): JsonResponse
    {
        return response()->json($this->attention->compute($request->user()));
    }
}
