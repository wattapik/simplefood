<?php

namespace Tests\Unit;

use App\Support\UnitConverter;
use Tests\TestCase;

class UnitConverterTest extends TestCase
{
    public function test_convert_handles_same_unit(): void
    {
        $this->assertSame(5.0, UnitConverter::convert(5, 'g', 'g'));
    }

    public function test_convert_handles_mass_units(): void
    {
        $this->assertSame(500.0, UnitConverter::convert(0.5, 'kg', 'g'));
        $this->assertSame(0.5, UnitConverter::convert(500, 'g', 'kg'));
    }

    public function test_convert_handles_volume_units(): void
    {
        $this->assertSame(1000.0, UnitConverter::convert(1, 'l', 'ml'));
    }

    public function test_convert_returns_null_for_incompatible_units(): void
    {
        $this->assertNull(UnitConverter::convert(5, 'g', 'pcs'));
        $this->assertNull(UnitConverter::convert(5, 'g', 'ml'));
    }

    public function test_to_grams_only_accepts_mass_units(): void
    {
        $this->assertSame(500.0, UnitConverter::toGrams(0.5, 'kg'));
        $this->assertNull(UnitConverter::toGrams(500, 'ml'));
        $this->assertNull(UnitConverter::toGrams(5, 'pcs'));
    }

    public function test_to_grams_approx_uses_exact_conversion_for_mass_units(): void
    {
        $this->assertSame(500.0, UnitConverter::toGramsApprox(0.5, 'kg'));
    }

    public function test_to_grams_approx_treats_liquids_as_water_density(): void
    {
        $this->assertSame(1000.0, UnitConverter::toGramsApprox(1, 'l'));
        $this->assertSame(250.0, UnitConverter::toGramsApprox(250, 'ml'));
    }

    public function test_to_grams_approx_still_rejects_count_units(): void
    {
        $this->assertNull(UnitConverter::toGramsApprox(5, 'pcs'));
    }
}
