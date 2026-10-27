<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateProfileRequest;
use App\Models\User;
use Illuminate\Http\Request;

class ProfileController extends Controller
{
    /**
     * The authenticated user's profile.
     */
    public function show(Request $request): User
    {
        return $request->user();
    }

    /**
     * Update the authenticated user's name, email, and/or password. Changing the
     * password requires the current one (current_password validation rule).
     */
    public function update(UpdateProfileRequest $request): User
    {
        $user = $request->user();

        $user->fill($request->safe()->only(['name', 'email', 'password']));
        $user->save();

        return $user;
    }
}
