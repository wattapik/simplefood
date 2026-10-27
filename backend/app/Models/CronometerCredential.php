<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['username', 'password', 'totp_secret', 'timezone'])]
#[Hidden(['password', 'totp_secret'])]
class CronometerCredential extends Model
{
    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'username' => 'encrypted',
            'password' => 'encrypted',
            'totp_secret' => 'encrypted',
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
     * Each user has at most one credentials row. Created via the relationship (not
     * firstOrCreate(['user_id' => ...])) so the foreign key is set through the
     * relation itself rather than needing user_id in $fillable for mass assignment.
     */
    public static function current(User $user): self
    {
        return $user->cronometerCredential()->firstOrCreate([]);
    }

    public function isConfigured(): bool
    {
        return filled($this->username) && filled($this->password);
    }
}
