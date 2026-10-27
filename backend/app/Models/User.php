<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

#[Fillable(['name', 'email', 'password'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    /**
     * @return HasMany<PantryItem, $this>
     */
    public function pantryItems(): HasMany
    {
        return $this->hasMany(PantryItem::class);
    }

    /**
     * @return HasMany<Recipe, $this>
     */
    public function recipes(): HasMany
    {
        return $this->hasMany(Recipe::class);
    }

    /**
     * @return HasMany<Sprout, $this>
     */
    public function sprouts(): HasMany
    {
        return $this->hasMany(Sprout::class);
    }

    /**
     * @return HasOne<CronometerCredential, $this>
     */
    public function cronometerCredential(): HasOne
    {
        return $this->hasOne(CronometerCredential::class);
    }

    /**
     * @return HasOne<AnthropicCredential, $this>
     */
    public function anthropicCredential(): HasOne
    {
        return $this->hasOne(AnthropicCredential::class);
    }

    /**
     * @return HasOne<ChatConversation, $this>
     */
    public function chatConversation(): HasOne
    {
        return $this->hasOne(ChatConversation::class);
    }
}
