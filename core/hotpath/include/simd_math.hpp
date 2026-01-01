#pragma once
/**
 * @file simd_math.hpp
 * @brief SIMD-optimized mathematical operations
 *
 * AVX2/AVX-512 accelerated math for high-frequency trading calculations.
 */

#include "types.hpp"
#include <immintrin.h>
#include <cmath>

namespace matrix::hotpath::simd {

// ============================================================================
// SIMD LOAD/STORE OPERATIONS
// ============================================================================

/// Load 4 x 64-bit integers from aligned memory
inline u64x4 load_aligned(const uint64_t* ptr) {
    return _mm256_load_si256(reinterpret_cast<const __m256i*>(ptr));
}

/// Load 4 x 64-bit integers from unaligned memory
inline u64x4 load_unaligned(const uint64_t* ptr) {
    return _mm256_loadu_si256(reinterpret_cast<const __m256i*>(ptr));
}

/// Store 4 x 64-bit integers to aligned memory
inline void store_aligned(uint64_t* ptr, u64x4 v) {
    _mm256_store_si256(reinterpret_cast<__m256i*>(ptr), v);
}

/// Store 4 x 64-bit integers to unaligned memory
inline void store_unaligned(uint64_t* ptr, u64x4 v) {
    _mm256_storeu_si256(reinterpret_cast<__m256i*>(ptr), v);
}

// ============================================================================
// SIMD ARITHMETIC (64-bit)
// ============================================================================

/// Add 4 x 64-bit integers
inline u64x4 add_u64x4(u64x4 a, u64x4 b) {
    return _mm256_add_epi64(a, b);
}

/// Subtract 4 x 64-bit integers
inline u64x4 sub_u64x4(u64x4 a, u64x4 b) {
    return _mm256_sub_epi64(a, b);
}

/// Multiply 4 x 64-bit integers (lower 64 bits of result)
/// Note: AVX2 doesn't have native 64-bit multiply, we use 32-bit
inline u64x4 mul_u64x4_low(u64x4 a, u64x4 b) {
    // Use _mm256_mul_epu32 for lower 32 bits, then shift and add
    __m256i a_lo = _mm256_and_si256(a, _mm256_set1_epi64x(0xFFFFFFFF));
    __m256i b_lo = _mm256_and_si256(b, _mm256_set1_epi64x(0xFFFFFFFF));
    return _mm256_mul_epu32(a_lo, b_lo);
}

/// Bitwise AND
inline u64x4 and_u64x4(u64x4 a, u64x4 b) {
    return _mm256_and_si256(a, b);
}

/// Bitwise OR
inline u64x4 or_u64x4(u64x4 a, u64x4 b) {
    return _mm256_or_si256(a, b);
}

/// Shift left by immediate
template<int N>
inline u64x4 shl_u64x4(u64x4 v) {
    return _mm256_slli_epi64(v, N);
}

/// Shift right by immediate
template<int N>
inline u64x4 shr_u64x4(u64x4 v) {
    return _mm256_srli_epi64(v, N);
}

// ============================================================================
// SIMD COMPARISON
// ============================================================================

/// Compare equal (64-bit)
inline u64x4 cmpeq_u64x4(u64x4 a, u64x4 b) {
    return _mm256_cmpeq_epi64(a, b);
}

/// Compare greater than (signed 64-bit)
inline u64x4 cmpgt_i64x4(u64x4 a, u64x4 b) {
    return _mm256_cmpgt_epi64(a, b);
}

// ============================================================================
// SIMD FLOATING POINT (for fast approximations)
// ============================================================================

/// Load 4 x 64-bit doubles
inline f64x4 load_f64x4(const double* ptr) {
    return _mm256_loadu_pd(ptr);
}

/// Store 4 x 64-bit doubles
inline void store_f64x4(double* ptr, f64x4 v) {
    _mm256_storeu_pd(ptr, v);
}

/// Multiply 4 doubles
inline f64x4 mul_f64x4(f64x4 a, f64x4 b) {
    return _mm256_mul_pd(a, b);
}

/// Divide 4 doubles
inline f64x4 div_f64x4(f64x4 a, f64x4 b) {
    return _mm256_div_pd(a, b);
}

/// Add 4 doubles
inline f64x4 add_f64x4(f64x4 a, f64x4 b) {
    return _mm256_add_pd(a, b);
}

/// Subtract 4 doubles
inline f64x4 sub_f64x4(f64x4 a, f64x4 b) {
    return _mm256_sub_pd(a, b);
}

/// Fused multiply-add: a * b + c
inline f64x4 fma_f64x4(f64x4 a, f64x4 b, f64x4 c) {
    return _mm256_fmadd_pd(a, b, c);
}

/// Convert 4 x uint64 to 4 x double (approximate, loses precision for large values)
inline f64x4 cvt_u64x4_to_f64x4(u64x4 v) {
    // Extract to scalar and convert (AVX2 doesn't have direct u64->f64)
    alignas(32) uint64_t vals[4];
    store_aligned(vals, v);
    return _mm256_set_pd(
        static_cast<double>(vals[3]),
        static_cast<double>(vals[2]),
        static_cast<double>(vals[1]),
        static_cast<double>(vals[0])
    );
}

// ============================================================================
// HORIZONTAL OPERATIONS
// ============================================================================

/// Horizontal sum of 4 doubles
inline double hsum_f64x4(f64x4 v) {
    __m128d low = _mm256_castpd256_pd128(v);
    __m128d high = _mm256_extractf128_pd(v, 1);
    __m128d sum = _mm_add_pd(low, high);
    sum = _mm_hadd_pd(sum, sum);
    return _mm_cvtsd_f64(sum);
}

/// Horizontal maximum of 4 doubles
inline double hmax_f64x4(f64x4 v) {
    __m128d low = _mm256_castpd256_pd128(v);
    __m128d high = _mm256_extractf128_pd(v, 1);
    __m128d max1 = _mm_max_pd(low, high);
    max1 = _mm_max_pd(max1, _mm_shuffle_pd(max1, max1, 1));
    return _mm_cvtsd_f64(max1);
}

/// Horizontal minimum of 4 doubles
inline double hmin_f64x4(f64x4 v) {
    __m128d low = _mm256_castpd256_pd128(v);
    __m128d high = _mm256_extractf128_pd(v, 1);
    __m128d min1 = _mm_min_pd(low, high);
    min1 = _mm_min_pd(min1, _mm_shuffle_pd(min1, min1, 1));
    return _mm_cvtsd_f64(min1);
}

// ============================================================================
// U256 OPERATIONS (256-bit unsigned integer math)
// ============================================================================

/// Add two U256 values
inline U256 add_u256(const U256& a, const U256& b) {
    U256 result;
    uint64_t carry = 0;

    for (int i = 0; i < 4; ++i) {
        __uint128_t sum = static_cast<__uint128_t>(a.limbs[i]) +
                          static_cast<__uint128_t>(b.limbs[i]) + carry;
        result.limbs[i] = static_cast<uint64_t>(sum);
        carry = static_cast<uint64_t>(sum >> 64);
    }

    return result;
}

/// Subtract two U256 values (a - b), assumes a >= b
inline U256 sub_u256(const U256& a, const U256& b) {
    U256 result;
    uint64_t borrow = 0;

    for (int i = 0; i < 4; ++i) {
        __uint128_t diff = static_cast<__uint128_t>(a.limbs[i]) -
                           static_cast<__uint128_t>(b.limbs[i]) - borrow;
        result.limbs[i] = static_cast<uint64_t>(diff);
        borrow = (diff >> 127) & 1; // Check if we borrowed
    }

    return result;
}

/// Multiply U256 by uint64 (U256 * u64 -> U256, truncated)
inline U256 mul_u256_u64(const U256& a, uint64_t b) {
    U256 result;
    __uint128_t carry = 0;

    for (int i = 0; i < 4; ++i) {
        __uint128_t prod = static_cast<__uint128_t>(a.limbs[i]) *
                           static_cast<__uint128_t>(b) + carry;
        result.limbs[i] = static_cast<uint64_t>(prod);
        carry = prod >> 64;
    }

    return result;
}

/// Divide U256 by uint64 (U256 / u64 -> U256)
inline U256 div_u256_u64(const U256& a, uint64_t b) {
    U256 result;
    __uint128_t remainder = 0;

    for (int i = 3; i >= 0; --i) {
        __uint128_t dividend = (remainder << 64) | a.limbs[i];
        result.limbs[i] = static_cast<uint64_t>(dividend / b);
        remainder = dividend % b;
    }

    return result;
}

/// Compare U256: returns -1 if a < b, 0 if a == b, 1 if a > b
inline int cmp_u256(const U256& a, const U256& b) {
    for (int i = 3; i >= 0; --i) {
        if (a.limbs[i] < b.limbs[i]) return -1;
        if (a.limbs[i] > b.limbs[i]) return 1;
    }
    return 0;
}

/// Convert U256 to double (approximate, for calculations)
inline double u256_to_double(const U256& v) {
    // Handle as 256-bit value with proper scaling
    double result = 0.0;
    double scale = 1.0;
    for (int i = 0; i < 4; ++i) {
        result += static_cast<double>(v.limbs[i]) * scale;
        scale *= 18446744073709551616.0; // 2^64
    }
    return result;
}

/// Convert double to U256 (approximate)
inline U256 double_to_u256(double v) {
    U256 result;
    if (v < 0) return result; // Return 0 for negative

    for (int i = 3; i >= 0; --i) {
        double scale = std::pow(2.0, 64.0 * i);
        if (v >= scale) {
            result.limbs[i] = static_cast<uint64_t>(v / scale);
            v -= static_cast<double>(result.limbs[i]) * scale;
        }
    }
    return result;
}

} // namespace matrix::hotpath::simd
