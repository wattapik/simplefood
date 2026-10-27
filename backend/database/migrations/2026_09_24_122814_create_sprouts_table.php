<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('sprouts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('seed_name');
            // Freeform tag Claude assigns from how the user describes the growing setup,
            // e.g. "sprout jar" or "dirt tray" — not an enum, since sprouting mediums vary
            // too widely to enumerate up front.
            $table->string('medium');
            $table->decimal('seed_quantity', 10, 2)->nullable();
            $table->string('seed_unit')->nullable();
            $table->timestamp('started_at');
            // Claude's best-guess date this batch will be ready to eat, editable as the
            // batch is corrected/checked on.
            $table->date('estimated_ready_at')->nullable();
            // Null while still growing; set once the user says it's done, at which point
            // a pantry item is created in the fridge and linked via pantry_item_id.
            $table->timestamp('harvested_at')->nullable();
            $table->foreignId('pantry_item_id')->nullable()->constrained()->nullOnDelete();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'harvested_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('sprouts');
    }
};
