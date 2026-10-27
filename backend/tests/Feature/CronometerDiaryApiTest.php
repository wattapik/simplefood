<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Process;
use Tests\TestCase;

class CronometerDiaryApiTest extends TestCase
{
    use RefreshDatabase;

    private function configureCronometer(User $user): void
    {
        $this->actingAs($user)->putJson('/api/settings/cronometer', [
            'username' => 'me@example.com',
            'password' => 'secret',
        ]);
    }

    private array $overviewPayload = [
        'date' => '2026-09-23',
        'calories' => ['consumed' => 303, 'target' => 1136, 'remaining' => 833],
        'macros' => ['protein_g' => 10.8, 'carbs_g' => 54.9, 'fat_g' => 4.7, 'fiber_g' => 8.3],
        'foods' => [
            ['name' => 'Oatmeal', 'time' => '11:49:55', 'amount' => '40g', 'calories' => 152],
        ],
    ];

    public function test_it_requires_cronometer_credentials_to_be_configured(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->getJson('/api/cronometer/today');

        $response->assertUnprocessable()->assertJsonPath('message', 'Cronometer credentials are not configured yet. Add them in Settings first.');
        Process::assertNothingRan();
    }

    public function test_it_returns_todays_overview_from_the_bridge_script(): void
    {
        $user = User::factory()->create();
        $this->configureCronometer($user);

        Process::fake(['*cronometer-bridge*' => Process::result(output: json_encode($this->overviewPayload))]);

        $response = $this->actingAs($user)->getJson('/api/cronometer/today');

        $response->assertOk()->assertJson($this->overviewPayload);
    }

    public function test_it_returns_a_422_when_the_bridge_script_fails(): void
    {
        $user = User::factory()->create();
        $this->configureCronometer($user);

        Process::fake(['*cronometer-bridge*' => Process::result(
            errorOutput: json_encode(['error' => 'Invalid Cronometer credentials']),
            exitCode: 1,
        )]);

        $response = $this->actingAs($user)->getJson('/api/cronometer/today');

        $response->assertUnprocessable()->assertJsonPath('message', 'Invalid Cronometer credentials');
    }

    public function test_it_removes_a_diary_entry_and_returns_the_refreshed_overview(): void
    {
        $user = User::factory()->create();
        $this->configureCronometer($user);

        Process::fake(function ($process) {
            $command = implode(' ', (array) $process->command);

            if (str_contains($command, ' remove ')) {
                return Process::result(output: json_encode(['status' => 'ok']));
            }

            return Process::result(output: json_encode($this->overviewPayload));
        });

        $response = $this->actingAs($user)->deleteJson('/api/cronometer/diary/5200641531');

        $response->assertOk()->assertJson($this->overviewPayload);
        Process::assertRan(fn ($process) => str_contains(implode(' ', (array) $process->command), ' remove 5200641531'));
    }

    public function test_it_updates_a_diary_entry_and_returns_the_refreshed_overview(): void
    {
        $user = User::factory()->create();
        $this->configureCronometer($user);

        Process::fake(function ($process) {
            $command = implode(' ', (array) $process->command);

            if (str_contains($command, ' update ')) {
                return Process::result(output: json_encode(['status' => 'ok']));
            }

            return Process::result(output: json_encode($this->overviewPayload));
        });

        $response = $this->actingAs($user)->putJson('/api/cronometer/diary/5200641531', [
            'food_id' => 464877,
            'measure_id' => 1073268,
            'grams' => 50,
        ]);

        $response->assertOk()->assertJson($this->overviewPayload);
        Process::assertRan(fn ($process) => str_contains(
            implode(' ', (array) $process->command),
            ' update 5200641531 464877 1073268 50'
        ));
    }

    public function test_updating_a_diary_entry_validates_input(): void
    {
        $user = User::factory()->create();
        $this->configureCronometer($user);

        $response = $this->actingAs($user)->putJson('/api/cronometer/diary/5200641531', []);

        $response->assertUnprocessable()->assertJsonValidationErrors(['food_id', 'measure_id', 'grams']);
        Process::assertNothingRan();
    }

    public function test_a_failed_removal_returns_a_422(): void
    {
        $user = User::factory()->create();
        $this->configureCronometer($user);

        Process::fake(['*cronometer-bridge*' => Process::result(
            errorOutput: json_encode(['error' => 'Entry not found']),
            exitCode: 1,
        )]);

        $response = $this->actingAs($user)->deleteJson('/api/cronometer/diary/does-not-exist');

        $response->assertUnprocessable()->assertJsonPath('message', 'Entry not found');
    }

    public function test_diary_mutations_require_cronometer_credentials(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->deleteJson('/api/cronometer/diary/1')
            ->assertUnprocessable()->assertJsonPath('message', 'Cronometer credentials are not configured yet. Add them in Settings first.');

        $this->actingAs($user)->putJson('/api/cronometer/diary/1', ['food_id' => 1, 'measure_id' => 1, 'grams' => 10])
            ->assertUnprocessable()->assertJsonPath('message', 'Cronometer credentials are not configured yet. Add them in Settings first.');

        Process::assertNothingRan();
    }
}
