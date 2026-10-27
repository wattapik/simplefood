<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('pantry_items', function (Blueprint $table) {
            $table->foreignId('user_id')->nullable()->after('id')->constrained()->cascadeOnDelete();
        });

        Schema::table('cronometer_credentials', function (Blueprint $table) {
            $table->foreignId('user_id')->nullable()->after('id')->constrained()->cascadeOnDelete();
        });

        // Backfill existing rows (from before this app supported multiple users) to
        // the first account, so nothing orphaned goes missing for the current user.
        $firstUserId = DB::table('users')->orderBy('id')->value('id');

        if ($firstUserId) {
            DB::table('pantry_items')->whereNull('user_id')->update(['user_id' => $firstUserId]);
            DB::table('cronometer_credentials')->whereNull('user_id')->update(['user_id' => $firstUserId]);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('pantry_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('user_id');
        });

        Schema::table('cronometer_credentials', function (Blueprint $table) {
            $table->dropConstrainedForeignId('user_id');
        });
    }
};
