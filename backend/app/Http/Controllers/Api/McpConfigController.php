<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CronometerCredential;
use Illuminate\Http\Request;

class McpConfigController extends Controller
{
    /**
     * Build a ready-to-paste MCP client config (Claude Desktop / Claude Code format)
     * wiring up this app's pantry MCP server and the cronometer-api-mcp server, using
     * the credentials stored in the settings panel. Rotates the pantry MCP's API token
     * each time it's requested, so old copies of the config stop working once replaced.
     */
    public function __invoke(Request $request): array
    {
        $user = $request->user();
        $user->tokens()->where('name', 'pantry-mcp')->delete();
        $token = $user->createToken('pantry-mcp')->plainTextToken;

        $cronometer = CronometerCredential::current($user);

        return [
            'mcpServers' => [
                'pantry' => [
                    'command' => 'node',
                    'args' => ['/absolute/path/to/pantry-mcp/dist/index.js'],
                    'env' => [
                        'PANTRY_API_URL' => rtrim(config('app.url'), '/').'/api',
                        'PANTRY_API_TOKEN' => $token,
                    ],
                ],
                'cronometer' => [
                    'command' => 'uvx',
                    'args' => ['cronometer-api-mcp'],
                    'env' => [
                        'CRONOMETER_USERNAME' => $cronometer->username ?? 'your@email.com',
                        'CRONOMETER_PASSWORD' => $cronometer->password ?? 'your-password',
                        'CRONOMETER_TOTP_SECRET' => $cronometer->totp_secret ?? '',
                        'CRONOMETER_ACCOUNT_TZ' => $cronometer->timezone ?? '',
                    ],
                ],
            ],
        ];
    }
}
