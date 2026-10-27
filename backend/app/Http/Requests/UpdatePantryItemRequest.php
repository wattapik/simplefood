<?php

namespace App\Http\Requests;

use App\Enums\PantryLocation;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdatePantryItemRequest extends FormRequest
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
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'brand' => ['nullable', 'string', 'max:255'],
            'quantity' => ['sometimes', 'required', 'numeric', 'min:0'],
            'unit' => ['sometimes', 'required', 'string', 'max:32'],
            'category' => ['nullable', 'string', 'max:255'],
            'location' => ['sometimes', 'required', Rule::enum(PantryLocation::class)],
            'added_at' => ['nullable', 'date'],
            'expiration_date' => ['nullable', 'date'],
            'opened_at' => ['nullable', 'date'],
            'opened_expiration_date' => ['nullable', 'date'],
            'cronometer_food_id' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string'],
        ];
    }
}
