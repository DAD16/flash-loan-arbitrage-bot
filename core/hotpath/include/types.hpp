#pragma once
/**
 * @file types.hpp
 * @brief Core types for the MATRIX hot path
 *
 * High-performance types optimized for SIMD operations and cache efficiency.
 */

#include <cstdint>
#include <array>
#include <immintrin.h>

namespace matrix::hotpath {

// ============================================================================
// COMPILE-TIME CONFIGURATION
// ============================================================================

/// Maximum pools to process in a single SIMD batch
constexpr size_t SIMD_BATCH_SIZE = 8;

/// Price precision (18 decimals like Ethereum)
constexpr uint64_t PRICE_PRECISION = 1'000'000'000'000'000'000ULL; // 1e18

/// Basis points precision
constexpr int64_t BPS_PRECISION = 10000;

// ============================================================================
// SIMD-ALIGNED TYPES
// ============================================================================

/// 256-bit unsigned integer for reserves/amounts (4x uint64)
struct alignas(32) U256 {
    uint64_t limbs[4]; // Little-endian: limbs[0] is least significant

    U256() : limbs{0, 0, 0, 0} {}

    explicit U256(uint64_t value) : limbs{value, 0, 0, 0} {}

    U256(uint64_t l0, uint64_t l1, uint64_t l2, uint64_t l3)
        : limbs{l0, l1, l2, l3} {}

    bool is_zero() const {
        return limbs[0] == 0 && limbs[1] == 0 && limbs[2] == 0 && limbs[3] == 0;
    }

    // Get lower 128 bits as two uint64s (for most DeFi calculations)
    uint64_t low64() const { return limbs[0]; }
    __uint128_t low128() const {
        return (static_cast<__uint128_t>(limbs[1]) << 64) | limbs[0];
    }
};

/// Pool reserves optimized for SIMD processing
struct alignas(64) PoolReserves {
    U256 reserve0;
    U256 reserve1;
    uint64_t timestamp_ms;
    uint32_t pool_id;      // Internal pool identifier
    uint32_t dex_id;       // DEX identifier
    uint8_t decimals0;     // Token0 decimals
    uint8_t decimals1;     // Token1 decimals
    uint8_t _padding[6];   // Padding to 64-byte alignment
};

static_assert(sizeof(PoolReserves) == 128, "PoolReserves must be 128 bytes");

/// Batch of pool reserves for SIMD processing
struct alignas(64) PoolBatch {
    std::array<PoolReserves, SIMD_BATCH_SIZE> pools;
    size_t count; // Actual number of pools (may be < SIMD_BATCH_SIZE)
};

/// Price result from calculation
struct alignas(32) PriceResult {
    U256 price;           // Price with 18 decimal precision
    uint64_t timestamp_ms;
    uint32_t pool_id;
    uint32_t dex_id;
    int64_t confidence;   // Confidence score in BPS (0-10000)
    uint8_t _padding[4];
};

static_assert(sizeof(PriceResult) == 64, "PriceResult must be 64 bytes");

/// Arbitrage opportunity
struct alignas(64) ArbitrageOpportunity {
    uint32_t buy_pool_id;
    uint32_t buy_dex_id;
    uint32_t sell_pool_id;
    uint32_t sell_dex_id;
    U256 buy_price;       // Price to buy at
    U256 sell_price;      // Price to sell at
    int64_t spread_bps;   // Spread in basis points
    U256 max_amount;      // Maximum executable amount
    U256 estimated_profit;// Estimated profit
    uint64_t timestamp_ms;
    uint8_t _padding[8];
};

static_assert(sizeof(ArbitrageOpportunity) == 192, "ArbitrageOpportunity size check");

/// Batch of opportunities
struct OpportunityBatch {
    std::array<ArbitrageOpportunity, SIMD_BATCH_SIZE> opportunities;
    size_t count;
};

// ============================================================================
// SIMD VECTOR TYPES
// ============================================================================

/// 4 x 64-bit unsigned integers (AVX2)
using u64x4 = __m256i;

/// 8 x 32-bit unsigned integers (AVX2)
using u32x8 = __m256i;

/// 4 x 64-bit doubles (AVX2)
using f64x4 = __m256d;

// ============================================================================
// CONFIGURATION
// ============================================================================

/// Scanner configuration
struct ScannerConfig {
    int64_t min_spread_bps;     // Minimum spread to report (e.g., 10 = 0.1%)
    int64_t max_slippage_bps;   // Maximum acceptable slippage
    U256 min_liquidity;         // Minimum pool liquidity
    U256 max_position_size;     // Maximum position size
    bool include_same_dex;      // Include same-DEX opportunities
};

/// Default scanner configuration
inline ScannerConfig default_scanner_config() {
    ScannerConfig config{};
    config.min_spread_bps = 10;        // 0.1%
    config.max_slippage_bps = 50;      // 0.5%
    config.min_liquidity = U256(100'000'000'000'000'000'000ULL); // ~$100 min
    config.max_position_size = U256(10'000'000'000'000'000'000'000ULL); // ~$10k max
    config.include_same_dex = false;
    return config;
}

} // namespace matrix::hotpath
