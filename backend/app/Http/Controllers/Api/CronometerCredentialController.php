<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateCronometerCredentialRequest;
use App\Models\CronometerCredential;
use Illuminate\Http\Request;

class CronometerCredentialController extends Controller
{
    /**
     * Show whether Cronometer credentials are configured (never returns the secrets).
     */
    public function show(Request $request): array
    {
        $credential = CronometerCredential::current($request->user());

        return [
            'is_configured' => $credential->isConfigured(),
            'username' => $credential->username,
            'timezone' => $credential->timezone,
            'has_totp_secret' => filled($credential->totp_secret),
        ];
    }

    /**
     * Store/replace the Cronometer credentials used by the pantry & cronometer MCP servers.
     */
    public function update(UpdateCronometerCredentialRequest $request): array
    {
        $credential = CronometerCredential::current($request->user());
        $credential->update($request->validated());

        return $this->show($request);
    }
}
