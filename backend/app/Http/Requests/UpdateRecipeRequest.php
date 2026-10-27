<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class UpdateRecipeRequest extends FormRequest
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
            'made_at' => ['sometimes', 'required', 'date'],
            // Ingredients are replaced as a whole array — the caller sends the full,
            // already-edited list (existing ones with a changed quantity, or a new
            // one appended), rather than patching a single index. Simpler than a
            // partial-update scheme, and this is what both the app's edit UI and
            // Claude naturally already have in hand after listing the recipe first.
            'ingredients' => ['sometimes', 'required', 'array', 'min:1'],
            'ingredients.*.name' => ['required_with:ingredients', 'string', 'max:255'],
            'ingredients.*.quantity' => ['required_with:ingredients', 'numeric', 'min:0'],
            'ingredients.*.unit' => ['required_with:ingredients', 'string', 'max:32'],
            'ingredients.*.cronometer_food_id' => ['nullable', 'string', 'max:255'],
            'notes' => ['sometimes', 'nullable', 'string'],
        ];
    }
}
