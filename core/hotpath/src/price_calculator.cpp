/**
 * @file price_calculator.cpp
 * @brief SIMD-accelerated price calculation implementation
 */

#include "price_calculator.hpp"
#include <algorithm>
#include <cmath>

namespace matrix::hotpath {

// ============================================================================
// SINGLE POOL PRICE CALCULATION
// ============================================================================

PriceResult calculate_price(const PoolReserves& reserves) {
    PriceResult result{};
    result.pool_id = reserves.pool_id;
    result.dex_id = reserves.dex_id;
    result.timestamp_ms = reserves.timestamp_ms;

    // Handle zero reserves
    if (reserves.reserve0.is_zero()) {
        result.price = U256(0);
        result.confidence = 0;
        return result;
    }

    // Calculate price = reserve1 / reserve0 * 10^18
    // For most DeFi pools, reserves fit in 128 bits
    // Use __uint128_t for intermediate calculation

    __uint128_t r0 = reserves.reserve0.low128();
    __uint128_t r1 = reserves.reserve1.low128();

    if (r0 == 0) {
        result.price = U256(0);
        result.confidence = 0;
        return result;
    }

    // Multiply by precision first to avoid precision loss
    __uint128_t precision = PRICE_PRECISION;
    __uint128_t price_128;

    // Check for overflow: if r1 * precision would overflow 128 bits
    if (r1 > (static_cast<__uint128_t>(-1) / precision)) {
        // Scale down both to avoid overflow
        __uint128_t scale = r1 / (static_cast<__uint128_t>(1) << 64);
        if (scale == 0) scale = 1;
        r1 /= scale;
        r0 /= scale;
        if (r0 == 0) r0 = 1;
    }

    price_128 = (r1 * precision) / r0;

    // Store in U256
    result.price.limbs[0] = static_cast<uint64_t>(price_128);
    result.price.limbs[1] = static_cast<uint64_t>(price_128 >> 64);

    // Calculate confidence based on liquidity depth
    // geometric_mean = sqrt(reserve0 * reserve1)
    double r0_d = static_cast<double>(reserves.reserve0.low64());
    double r1_d = static_cast<double>(reserves.reserve1.low64());
    double liquidity = std::sqrt(r0_d * r1_d);

    // Confidence scoring (simplified)
    if (liquidity >= 1e24) {
        result.confidence = 10000; // 100%
    } else if (liquidity >= 1e21) {
        result.confidence = 9000;  // 90%
    } else if (liquidity >= 1e18) {
        result.confidence = 7000;  // 70%
    } else {
        result.confidence = 3000;  // 30%
    }

    return result;
}

// ============================================================================
// BATCH PRICE CALCULATION
// ============================================================================

void calculate_prices_batch(const PoolBatch& batch, PriceResult* results) {
    // Process in groups of 4 for SIMD efficiency
    size_t i = 0;

    // SIMD path: process 4 pools at a time using approximate double math
    // for the fast path, then refine with exact calculation if needed
    for (; i + 4 <= batch.count; i += 4) {
        alignas(32) uint64_t reserve0_lows[4];
        alignas(32) uint64_t reserve1_lows[4];
        alignas(32) double prices_approx[4];

        // Extract low 64 bits of reserves
        for (int j = 0; j < 4; ++j) {
            reserve0_lows[j] = batch.pools[i + j].reserve0.low64();
            reserve1_lows[j] = batch.pools[i + j].reserve1.low64();
        }

        // Fast SIMD price approximation
        detail::fast_price_approx_x4(reserve0_lows, reserve1_lows, prices_approx);

        // Convert to full precision results
        for (int j = 0; j < 4; ++j) {
            const auto& pool = batch.pools[i + j];
            auto& result = results[i + j];

            result.pool_id = pool.pool_id;
            result.dex_id = pool.dex_id;
            result.timestamp_ms = pool.timestamp_ms;

            // Use exact calculation for the final result
            // The SIMD approximation was for potential early filtering
            result = calculate_price(pool);
        }
    }

    // Scalar remainder
    for (; i < batch.count; ++i) {
        results[i] = calculate_price(batch.pools[i]);
    }
}

// ============================================================================
// SWAP CALCULATIONS
// ============================================================================

U256 calculate_swap_output(const U256& reserve_in, const U256& reserve_out, const U256& amount_in) {
    // Constant product AMM formula with 0.3% fee:
    // amountOut = (reserveOut * amountIn * 997) / (reserveIn * 1000 + amountIn * 997)

    if (reserve_in.is_zero() || amount_in.is_zero()) {
        return U256(0);
    }

    // Use 128-bit math for most cases
    __uint128_t r_in = reserve_in.low128();
    __uint128_t r_out = reserve_out.low128();
    __uint128_t a_in = amount_in.low128();

    // amountIn * 997
    __uint128_t amount_in_with_fee = a_in * 997;

    // numerator = reserveOut * amountIn * 997
    __uint128_t numerator = r_out * amount_in_with_fee;

    // denominator = reserveIn * 1000 + amountIn * 997
    __uint128_t denominator = r_in * 1000 + amount_in_with_fee;

    if (denominator == 0) {
        return U256(0);
    }

    __uint128_t result = numerator / denominator;

    U256 output;
    output.limbs[0] = static_cast<uint64_t>(result);
    output.limbs[1] = static_cast<uint64_t>(result >> 64);

    return output;
}

void calculate_swap_outputs_batch(
    const U256& reserve_in,
    const U256& reserve_out,
    const U256* amounts_in,
    U256* amounts_out,
    size_t count
) {
    // For batch processing, we can use SIMD for the main calculation
    // but need to be careful with 128-bit overflow

    __uint128_t r_in = reserve_in.low128();
    __uint128_t r_out = reserve_out.low128();

    // Process 4 at a time using SIMD for the multiplications
    size_t i = 0;
    for (; i + 4 <= count; i += 4) {
        // Extract amounts
        alignas(32) uint64_t a_in_low[4];
        for (int j = 0; j < 4; ++j) {
            a_in_low[j] = amounts_in[i + j].low64();
        }

        // SIMD multiply by 997 (using double approximation for speed)
        f64x4 amounts = simd::cvt_u64x4_to_f64x4(simd::load_aligned(a_in_low));
        f64x4 fee_mult = _mm256_set1_pd(997.0);
        f64x4 r_out_vec = _mm256_set1_pd(static_cast<double>(r_out));
        f64x4 r_in_vec = _mm256_set1_pd(static_cast<double>(r_in));

        // numerator = r_out * amount * 997
        f64x4 numerator = simd::mul_f64x4(simd::mul_f64x4(r_out_vec, amounts), fee_mult);

        // denominator = r_in * 1000 + amount * 997
        f64x4 denominator = simd::add_f64x4(
            simd::mul_f64x4(r_in_vec, _mm256_set1_pd(1000.0)),
            simd::mul_f64x4(amounts, fee_mult)
        );

        f64x4 result = simd::div_f64x4(numerator, denominator);

        // Store results
        alignas(32) double results_d[4];
        simd::store_f64x4(results_d, result);

        for (int j = 0; j < 4; ++j) {
            amounts_out[i + j] = simd::double_to_u256(results_d[j]);
        }
    }

    // Scalar remainder
    for (; i < count; ++i) {
        amounts_out[i] = calculate_swap_output(reserve_in, reserve_out, amounts_in[i]);
    }
}

// ============================================================================
// SLIPPAGE CALCULATION
// ============================================================================

int64_t calculate_slippage_bps(const U256& reserve_in, const U256& reserve_out, const U256& amount_in) {
    // Slippage = (spot_price - execution_price) / spot_price * 10000
    // spot_price = reserve_out / reserve_in
    // execution_price = amount_out / amount_in

    if (reserve_in.is_zero() || amount_in.is_zero()) {
        return 0;
    }

    double r_in = simd::u256_to_double(reserve_in);
    double r_out = simd::u256_to_double(reserve_out);
    double a_in = simd::u256_to_double(amount_in);

    double spot_price = r_out / r_in;

    U256 amount_out = calculate_swap_output(reserve_in, reserve_out, amount_in);
    double a_out = simd::u256_to_double(amount_out);

    double exec_price = a_out / a_in;

    double slippage = (spot_price - exec_price) / spot_price;
    return static_cast<int64_t>(slippage * BPS_PRECISION);
}

// ============================================================================
// OPTIMAL TRADE SIZE
// ============================================================================

U256 calculate_optimal_trade_size(
    const U256& reserve0_buy, const U256& reserve1_buy,
    const U256& reserve0_sell, const U256& reserve1_sell
) {
    // Optimal arbitrage size formula (simplified):
    // sqrt(reserve0_buy * reserve1_buy * reserve0_sell * reserve1_sell * 997^2 / 1000^2)
    // - reserve0_buy

    double r0_buy = simd::u256_to_double(reserve0_buy);
    double r1_buy = simd::u256_to_double(reserve1_buy);
    double r0_sell = simd::u256_to_double(reserve0_sell);
    double r1_sell = simd::u256_to_double(reserve1_sell);

    double fee_factor = 0.997 * 0.997; // Two swaps

    double geometric_mean = std::sqrt(r0_buy * r1_buy * r0_sell * r1_sell * fee_factor);
    double optimal = geometric_mean - r0_buy;

    if (optimal <= 0) {
        return U256(0);
    }

    return simd::double_to_u256(optimal);
}

// ============================================================================
// ARBITRAGE PROFIT
// ============================================================================

U256 calculate_arbitrage_profit(
    const PoolReserves& buy_reserves,
    const PoolReserves& sell_reserves,
    const U256& trade_size
) {
    // 1. Buy token1 with token0 at buy_pool
    U256 token1_received = calculate_swap_output(
        buy_reserves.reserve0,
        buy_reserves.reserve1,
        trade_size
    );

    // 2. Sell token1 for token0 at sell_pool
    U256 token0_received = calculate_swap_output(
        sell_reserves.reserve1,
        sell_reserves.reserve0,
        token1_received
    );

    // 3. Profit = token0_received - trade_size
    if (simd::cmp_u256(token0_received, trade_size) > 0) {
        return simd::sub_u256(token0_received, trade_size);
    }

    return U256(0);
}

// ============================================================================
// BATCH PRICE CALCULATOR CLASS
// ============================================================================

BatchPriceCalculator::BatchPriceCalculator() : pool_count_(0) {
    // Initialize pools to zero
    std::memset(pools_, 0, sizeof(pools_));
}

BatchPriceCalculator::~BatchPriceCalculator() = default;

bool BatchPriceCalculator::add_pool(const PoolReserves& reserves) {
    if (pool_count_ >= MAX_POOLS) {
        return false;
    }
    pools_[pool_count_++] = reserves;
    return true;
}

size_t BatchPriceCalculator::process(PriceResult* results) {
    // Process in batches of SIMD_BATCH_SIZE
    size_t processed = 0;

    while (processed < pool_count_) {
        size_t batch_size = std::min(SIMD_BATCH_SIZE, pool_count_ - processed);

        PoolBatch batch;
        batch.count = batch_size;
        for (size_t i = 0; i < batch_size; ++i) {
            batch.pools[i] = pools_[processed + i];
        }

        calculate_prices_batch(batch, results + processed);
        processed += batch_size;
    }

    return pool_count_;
}

void BatchPriceCalculator::clear() {
    pool_count_ = 0;
}

} // namespace matrix::hotpath
