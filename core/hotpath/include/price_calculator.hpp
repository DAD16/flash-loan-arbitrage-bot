#pragma once
/**
 * @file price_calculator.hpp
 * @brief SIMD-accelerated price calculations
 *
 * High-performance price calculation for AMM pools using SIMD instructions.
 * Calculates prices from reserves with proper decimal handling.
 */

#include "types.hpp"
#include "simd_math.hpp"

namespace matrix::hotpath {

// ============================================================================
// PRICE CALCULATION FUNCTIONS
// ============================================================================

/**
 * @brief Calculate price from pool reserves (single pool)
 *
 * Price = reserve1 / reserve0 * 10^18 (normalized to 18 decimals)
 *
 * @param reserves Pool reserves
 * @return PriceResult with calculated price
 */
PriceResult calculate_price(const PoolReserves& reserves);

/**
 * @brief Calculate prices for a batch of pools using SIMD
 *
 * Processes up to SIMD_BATCH_SIZE pools in parallel using AVX2 instructions.
 *
 * @param batch Batch of pool reserves
 * @param results Output array for results (must have space for batch.count elements)
 */
void calculate_prices_batch(const PoolBatch& batch, PriceResult* results);

/**
 * @brief Calculate output amount for a swap (constant product AMM)
 *
 * Uses the formula: amountOut = (reserveOut * amountIn * 997) / (reserveIn * 1000 + amountIn * 997)
 * The 0.3% fee is accounted for in the calculation.
 *
 * @param reserve_in Input token reserve
 * @param reserve_out Output token reserve
 * @param amount_in Input amount
 * @return Output amount after swap
 */
U256 calculate_swap_output(const U256& reserve_in, const U256& reserve_out, const U256& amount_in);

/**
 * @brief Calculate swap output for batch of amounts
 *
 * @param reserve_in Input token reserve
 * @param reserve_out Output token reserve
 * @param amounts_in Array of input amounts
 * @param amounts_out Output array for results
 * @param count Number of amounts to process
 */
void calculate_swap_outputs_batch(
    const U256& reserve_in,
    const U256& reserve_out,
    const U256* amounts_in,
    U256* amounts_out,
    size_t count
);

/**
 * @brief Calculate slippage for a given trade size
 *
 * @param reserve_in Input token reserve
 * @param reserve_out Output token reserve
 * @param amount_in Trade size
 * @return Slippage in basis points
 */
int64_t calculate_slippage_bps(const U256& reserve_in, const U256& reserve_out, const U256& amount_in);

/**
 * @brief Calculate optimal trade size to capture arbitrage
 *
 * @param reserve0_buy Buy pool reserve0
 * @param reserve1_buy Buy pool reserve1
 * @param reserve0_sell Sell pool reserve0
 * @param reserve1_sell Sell pool reserve1
 * @return Optimal trade size
 */
U256 calculate_optimal_trade_size(
    const U256& reserve0_buy, const U256& reserve1_buy,
    const U256& reserve0_sell, const U256& reserve1_sell
);

/**
 * @brief Calculate profit from arbitrage opportunity
 *
 * @param buy_reserves Buy pool reserves
 * @param sell_reserves Sell pool reserves
 * @param trade_size Amount to trade
 * @return Estimated profit (may be negative)
 */
U256 calculate_arbitrage_profit(
    const PoolReserves& buy_reserves,
    const PoolReserves& sell_reserves,
    const U256& trade_size
);

// ============================================================================
// BATCH PRICE CALCULATION CLASS
// ============================================================================

/**
 * @brief High-performance batch price calculator
 *
 * Maintains internal buffers for efficient SIMD processing of large
 * numbers of price calculations.
 */
class BatchPriceCalculator {
public:
    BatchPriceCalculator();
    ~BatchPriceCalculator();

    // Non-copyable
    BatchPriceCalculator(const BatchPriceCalculator&) = delete;
    BatchPriceCalculator& operator=(const BatchPriceCalculator&) = delete;

    /**
     * @brief Add pool reserves to the batch
     * @param reserves Pool reserves to add
     * @return true if added, false if batch is full
     */
    bool add_pool(const PoolReserves& reserves);

    /**
     * @brief Process all accumulated pools and get results
     * @param results Output array (must have capacity for pool_count() elements)
     * @return Number of results written
     */
    size_t process(PriceResult* results);

    /**
     * @brief Clear the batch
     */
    void clear();

    /**
     * @brief Get current pool count
     */
    size_t pool_count() const { return pool_count_; }

    /**
     * @brief Get maximum batch capacity
     */
    static constexpr size_t max_capacity() { return MAX_POOLS; }

private:
    static constexpr size_t MAX_POOLS = 1024;

    // SIMD-aligned storage
    alignas(64) PoolReserves pools_[MAX_POOLS];
    size_t pool_count_;
};

// ============================================================================
// INLINE IMPLEMENTATIONS FOR HOT PATH
// ============================================================================

namespace detail {

/// Fast price calculation using double approximation (for sorting/filtering)
inline double fast_price_approx(uint64_t reserve0_low, uint64_t reserve1_low) {
    if (reserve0_low == 0) return 0.0;
    return static_cast<double>(reserve1_low) / static_cast<double>(reserve0_low);
}

/// SIMD batch price approximation (4 pools at once)
inline void fast_price_approx_x4(
    const uint64_t* reserve0_lows,
    const uint64_t* reserve1_lows,
    double* prices_out
) {
    f64x4 r0 = simd::cvt_u64x4_to_f64x4(simd::load_aligned(reserve0_lows));
    f64x4 r1 = simd::cvt_u64x4_to_f64x4(simd::load_aligned(reserve1_lows));
    f64x4 prices = simd::div_f64x4(r1, r0);
    simd::store_f64x4(prices_out, prices);
}

} // namespace detail

} // namespace matrix::hotpath
