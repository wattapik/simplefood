<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // Seeds the first account from .env, or falls back to defaults you should
        // change immediately from the app's Settings screen. Uses User::create()
        // rather than the factory deliberately — the factory pulls in Faker, which
        // is a require-dev dependency and isn't installed in a `composer install
        // --no-dev` production build.
        User::create([
            'name' => env('APP_USER_NAME', 'Pantry Owner'),
            'email' => env('APP_USER_EMAIL', 'me@example.com'),
            'password' => bcrypt(env('APP_USER_PASSWORD', 'password')),
        ]);
    }
}
