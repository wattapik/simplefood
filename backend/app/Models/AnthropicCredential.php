<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['api_key', 'model'])]
#[Hidden(['api_key'])]
class AnthropicCredential extends Model
{
    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'api_key' => 'encrypted',
        ];
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Each user has at most one Anthropic API credential row.
     */
    public static function current(User $user): self
    {
        return $user->anthropicCredential()->firstOrCreate([]);
    }

    public function isConfigured(): bool
    {
        return filled($this->api_key);
    }
}
