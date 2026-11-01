
// QA_ACCURATE_ATAN2_BEGIN: non-official arithmetic substitution, no colour tuning.
float qaAccurateAtan2(float y, float x)
{
    uint xb = floatBitsToUint(x), yb = floatBitsToUint(y);
    uint ax = xb & 0x7fffffffu, ay = yb & 0x7fffffffu;
    bool sx = (xb & 0x80000000u) != 0u, sy = (yb & 0x80000000u) != 0u;
    if (ax > 0x7f800000u || ay > 0x7f800000u) return uintBitsToFloat(0x7fc00000u);
    float a;
    if (ay == 0u) a = 0.0;
    else if (ax == 0u) a = 1.57079632679489661923;
    else if (ax == 0x7f800000u || ay == 0x7f800000u)
        a = ax == ay ? 0.78539816339744830962 : (ay == 0x7f800000u ? 1.57079632679489661923 : 0.0);
    else
    {
        uint hi = max(ax, ay), lo = min(ax, ay);
        float r;
        // Integer mantissas preserve ratios when both finite inputs are subnormal.
        // Mixed subnormal/normal scaling avoids dividing an FTZ operand directly.
        if (hi < 0x00800000u) r = float(lo) / float(hi);
        else if (lo < 0x00800000u)
            r = (float(lo) / float((hi & 0x007fffffu) | 0x00800000u)) * exp2(1.0 - float(hi >> 23u));
        else r = uintBitsToFloat(lo) / uintBitsToFloat(hi);
        bool reduce = r > 0.41421356237309504880;
        float z = reduce ? (r - 1.0) / (r + 1.0) : r;
        float z2 = z * z;
        float p = 1.0 / 17.0;
        p = -1.0 / 15.0 + z2 * p;
        p = 1.0 / 13.0 + z2 * p;
        p = -1.0 / 11.0 + z2 * p;
        p = 1.0 / 9.0 + z2 * p;
        p = -1.0 / 7.0 + z2 * p;
        p = 1.0 / 5.0 + z2 * p;
        p = -1.0 / 3.0 + z2 * p;
        a = z * (1.0 + z2 * p);
        if (reduce) a += 0.78539816339744830962;
        if (ay > ax) a = 1.57079632679489661923 - a;
    }
    if (sx) a = 3.14159265358979323846 - a;
    // Explicit signed zero, independent of compiler unary-minus folding.
    return uintBitsToFloat(floatBitsToUint(a) | (sy ? 0x80000000u : 0u));
}
// QA_ACCURATE_ATAN2_END

