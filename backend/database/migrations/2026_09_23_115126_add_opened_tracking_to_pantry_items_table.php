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
        Schema::table('pantry_items', function (Blueprint $table) {
            $table->timestamp('opened_at')->nullable()->after('expiration_date');
            $table->date('opened_expiration_date')->nullable()->after('opened_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('pantry_items', function (Blueprint $table) {
            $table->dropColumn(['opened_at', 'opened_expiration_date']);
        });
    }
};
