<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateAnthropicCredentialRequest;
use App\Models\AnthropicCredential;
use Illuminate\Http\Request;

class AnthropicCredentialController extends Controller
{
    /**
     * Show whether an Anthropic API key is configured (never returns the key itself).
     */
    public function show(Request $request): array
    {
        $credential = AnthropicCredential::current($request->user());

        return [
            'is_configured' => $credential->isConfigured(),
            'model' => $credential->model,
        ];
    }

    /**
     * Store/replace the Anthropic API key used by the in-app chat fallback.
     */
    public function update(UpdateAnthropicCredentialRequest $request): array
    {
        $credential = AnthropicCredential::current($request->user());
        $credential->update($request->validated());

        return $this->show($request);
    }
}
