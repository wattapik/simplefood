<?php

namespace App\Http\Requests;

use App\Enums\PantryLocation;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StorePantryItemRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'brand' => ['nullable', 'string', 'max:255'],
            'quantity' => ['required', 'numeric', 'min:0'],
            'unit' => ['required', 'string', 'max:32'],
            'category' => ['nullable', 'string', 'max:255'],
            'location' => ['required', Rule::enum(PantryLocation::class)],
            'added_at' => ['nullable', 'date'],
            'expiration_date' => ['nullable', 'date'],
            'opened_at' => ['nullable', 'date'],
            'opened_expiration_date' => ['nullable', 'date'],
            'cronometer_food_id' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string'],
        ];
    }
}
