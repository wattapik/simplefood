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
        Schema::create('pantry_items', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('brand')->nullable();
            $table->decimal('quantity', 10, 2);
            $table->string('unit');
            $table->string('category')->nullable();
            $table->string('location');
            $table->timestamp('added_at');
            $table->date('expiration_date')->nullable();
            $table->string('cronometer_food_id')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index('location');
            $table->index('expiration_date');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('pantry_items');
    }
};
