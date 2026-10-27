<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class UpdateSproutRequest extends FormRequest
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
            'seed_name' => ['sometimes', 'required', 'string', 'max:255'],
            'medium' => ['sometimes', 'required', 'string', 'max:255'],
            'seed_quantity' => ['nullable', 'numeric', 'min:0'],
            'seed_unit' => ['nullable', 'string', 'max:32'],
            'started_at' => ['sometimes', 'required', 'date'],
            'estimated_ready_at' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
        ];
    }
}
