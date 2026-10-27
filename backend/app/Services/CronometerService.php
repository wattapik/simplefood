<?php

namespace App\Services;

use App\Models\CronometerCredential;
use App\Models\User;
use App\Support\ProcessEnvironment;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Process;
use RuntimeException;

class CronometerService
{
    /**
     * Fetch a basic "what have I eaten today" summary from Cronometer, by shelling out
     * to pantry-mcp's cronometer-bridge script (which reuses cronometer-api-mcp over
     * stdio rather than reimplementing Cronometer's undocumented API).
     *
     * @return array<string, mixed>
     */
    public function todayOverview(User $user, bool $forceRefresh = false): array
    {
        $credential = $this->requireConfiguredCredential($user);
        $cacheKey = "cronometer.today-overview.{$user->id}";

        if ($forceRefresh) {
            Cache::forget($cacheKey);
        }

        return Cache::remember(
            $cacheKey,
            now()->addMinutes(2),
            fn () => $this->runBridge(config('services.cronometer.bridge_path'), $credential, ['fetch'])
        );
    }

    /**
     * Remove a single diary entry logged today (e.g. undoing something the chat
     * agent added, or a duplicate). Invalidates the cached overview so the next
     * todayOverview() call reflects it immediately.
     *
     * @throws RuntimeException if Cronometer credentials haven't been saved yet, or
     *                          the removal itself fails.
     */
    public function removeDiaryEntry(User $user, string $entryId): void
    {
        $credential = $this->requireConfiguredCredential($user);

        $this->runBridge(config('services.cronometer.bridge_path'), $credential, ['remove', $entryId]);

        Cache::forget("cronometer.today-overview.{$user->id}");
    }

    /**
     * Change how much of a diary entry was logged. Cronometer's API has no direct
     * "edit amount" call, so this removes the old entry and adds a fresh one with
     * the same food/measure but the new amount — $foodId/$measureId are the values
     * already returned alongside the entry by todayOverview(), so the caller never
     * needs to re-search Cronometer's food database just to change a quantity.
     *
     * @throws RuntimeException if Cronometer credentials haven't been saved yet, or
     *                          the update itself fails.
     */
    public function updateDiaryEntry(User $user, string $entryId, int $foodId, int $measureId, float $grams): void
    {
        $credential = $this->requireConfiguredCredential($user);

        $this->runBridge(config('services.cronometer.bridge_path'), $credential, [
            'update', $entryId, (string) $foodId, (string) $measureId, (string) $grams,
        ]);

        Cache::forget("cronometer.today-overview.{$user->id}");
    }

    /**
     * Fetch a food's nutrition facts (per 100g) from Cronometer. Cached for a long time
     * since a given food's nutrition doesn't change — and shared across users, since
     * the nutrition facts themselves aren't user-specific (only the credentials used to
     * look them up are).
     *
     * @return array{calories: float, protein_g: float, carbs_g: float, fat_g: float, fiber_g: float}
     */
    public function nutritionForFood(User $user, int $foodId): array
    {
        $credential = $this->requireConfiguredCredential($user);

        return Cache::remember(
            "cronometer.food-nutrition.{$foodId}",
            now()->addDays(30),
            function () use ($credential, $foodId) {
                $data = $this->runBridge(config('services.cronometer.food_bridge_path'), $credential, [(string) $foodId]);

                if (! isset($data['per_100g']) || ! is_array($data['per_100g'])) {
                    throw new RuntimeException("Cronometer returned an unexpected response for food #{$foodId}.");
                }

                return $data['per_100g'];
            }
        );
    }

    /**
     * @throws RuntimeException if Cronometer credentials haven't been saved yet.
     */
    public function assertConfigured(User $user): void
    {
        $this->requireConfiguredCredential($user);
    }

    private function requireConfiguredCredential(User $user): CronometerCredential
    {
        $credential = CronometerCredential::current($user);

        if (! $credential->isConfigured()) {
            throw new RuntimeException('Cronometer credentials are not configured yet. Add them in Settings first.');
        }

        return $credential;
    }

    /**
     * @param  array<int, string>  $args
     * @return array<string, mixed>
     */
    private function runBridge(mixed $bridgePath, CronometerCredential $credential, array $args = []): array
    {
        if (! is_string($bridgePath) || ! file_exists($bridgePath)) {
            throw new RuntimeException(
                "Cronometer bridge script not found at [{$bridgePath}]. Run `npm run build` in pantry-mcp, ".
                'or check the CRONOMETER_*_BRIDGE_PATH settings in .env.'
            );
        }

        $result = Process::timeout(30)->env([
            'CRONOMETER_USERNAME' => $credential->username,
            'CRONOMETER_PASSWORD' => $credential->password,
            'CRONOMETER_TOTP_SECRET' => $credential->totp_secret ?? '',
            'CRONOMETER_ACCOUNT_TZ' => $credential->timezone ?? '',
            'CRONOMETER_UVX_PATH' => ProcessEnvironment::resolveUvxPath(),
            'PATH' => ProcessEnvironment::pathWithLocalBin(),
            'HOME' => ProcessEnvironment::writableHomeDirectory(),
        ])->run(['node', $bridgePath, ...$args]);

        if ($result->failed()) {
            $error = json_decode($result->errorOutput(), true)['error'] ?? null;
            throw new RuntimeException($error ?? 'Could not fetch data from Cronometer: '.$result->errorOutput());
        }

        $data = json_decode($result->output(), true);

        if (! is_array($data)) {
            throw new RuntimeException('Cronometer bridge returned an unexpected response.');
        }

        return $data;
    }
}
