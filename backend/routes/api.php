<?php

use App\Http\Controllers\Api\AnthropicCredentialController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ChatController;
use App\Http\Controllers\Api\CronometerCredentialController;
use App\Http\Controllers\Api\CronometerDiaryController;
use App\Http\Controllers\Api\McpConfigController;
use App\Http\Controllers\Api\PantryAttentionController;
use App\Http\Controllers\Api\PantryItemController;
use App\Http\Controllers\Api\PantryStatsController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\RecipeController;
use App\Http\Controllers\Api\RecipeRecommendationController;
use App\Http\Controllers\Api\SproutController;
use Illuminate\Support\Facades\Route;

Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:6,1');

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/user', [ProfileController::class, 'show']);
    Route::put('/profile', [ProfileController::class, 'update']);
    Route::post('/logout', [AuthController::class, 'logout']);

    Route::apiResource('pantry-items', PantryItemController::class);
    Route::post('/pantry-items/{pantryItem}/consume', [PantryItemController::class, 'consume']);
    Route::get('/pantry/stats', [PantryStatsController::class, 'index']);
    Route::get('/pantry/attention', [PantryAttentionController::class, 'index']);

    Route::get('/settings/cronometer', [CronometerCredentialController::class, 'show']);
    Route::put('/settings/cronometer', [CronometerCredentialController::class, 'update']);

    Route::get('/settings/mcp-config', McpConfigController::class);

    Route::get('/settings/anthropic', [AnthropicCredentialController::class, 'show']);
    Route::put('/settings/anthropic', [AnthropicCredentialController::class, 'update']);

    Route::get('/cronometer/today', [CronometerDiaryController::class, 'today']);
    Route::put('/cronometer/diary/{entryId}', [CronometerDiaryController::class, 'update']);
    Route::delete('/cronometer/diary/{entryId}', [CronometerDiaryController::class, 'destroy']);

    Route::get('/recipes/recommendations', [RecipeRecommendationController::class, 'index']);
    Route::apiResource('recipes', RecipeController::class)->only(['index', 'store', 'update', 'destroy']);

    Route::post('/sprouts/{sprout}/harvest', [SproutController::class, 'harvest']);
    Route::apiResource('sprouts', SproutController::class)->only(['index', 'store', 'update', 'destroy']);

    Route::get('/chat', [ChatController::class, 'index']);
    Route::post('/chat', [ChatController::class, 'store']);
    Route::delete('/chat', [ChatController::class, 'destroy']);
});
