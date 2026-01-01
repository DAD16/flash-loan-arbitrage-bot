#pragma once
/**
 * @file opportunity_scanner.hpp
 * @brief SIMD-accelerated arbitrage opportunity scanner
 *
 * High-performance scanner that finds cross-DEX arbitrage opportunities
 * using parallel SIMD comparisons.
 */

#include "types.hpp"
#include "price_calculator.hpp"
#include <vector>
#include <functional>

namespace matrix::hotpath {

// ============================================================================
// OPPORTUNITY SCANNER
// ============================================================================

/**
 * @brief High-performance arbitrage opportunity scanner
 *
 * Scans multiple pools in parallel to find profitable arbitrage opportunities.
 * Uses SIMD instructions for price comparison and profit calculation.
 */
class OpportunityScanner {
public:
    /// Callback type for opportunity notifications
    using OpportunityCallback = std::function<void(const ArbitrageOpportunity&)>;

    /**
     * @brief Create scanner with configuration
     * @param config Scanner configuration
     */
    explicit OpportunityScanner(const ScannerConfig& config = default_scanner_config());

    ~OpportunityScanner();

    // Non-copyable
    OpportunityScanner(const OpportunityScanner&) = delete;
    OpportunityScanner& operator=(const OpportunityScanner&) = delete;

    /**
     * @brief Update pool reserves
     *
     * Updates internal pool state. Should be called whenever new price data arrives.
     *
     * @param reserves New pool reserves
     */
    void update_pool(const PoolReserves& reserves);

    /**
     * @brief Scan for arbitrage opportunities
     *
     * Scans all pools for cross-DEX arbitrage opportunities.
     *
     * @param opportunities Output vector for found opportunities
     * @return Number of opportunities found
     */
    size_t scan(std::vector<ArbitrageOpportunity>& opportunities);

    /**
     * @brief Scan with callback (zero-allocation hot path)
     *
     * Calls the callback for each opportunity found. Useful for streaming
     * opportunities directly to execution without allocation.
     *
     * @param callback Function called for each opportunity
     * @return Number of opportunities found
     */
    size_t scan_with_callback(const OpportunityCallback& callback);

    /**
     * @brief Get best opportunity (if any)
     *
     * Returns the most profitable opportunity found in the current state.
     *
     * @param out_opportunity Output for best opportunity
     * @return true if an opportunity was found
     */
    bool get_best_opportunity(ArbitrageOpportunity& out_opportunity);

    /**
     * @brief Clear all pool data
     */
    void clear();

    /**
     * @brief Get number of tracked pools
     */
    size_t pool_count() const;

    /**
     * @brief Update configuration
     */
    void set_config(const ScannerConfig& config);

    /**
     * @brief Get current configuration
     */
    const ScannerConfig& config() const { return config_; }

private:
    struct PoolEntry {
        PoolReserves reserves;
        PriceResult price;
        bool valid;
    };

    // Token pair identifier for grouping pools
    struct TokenPair {
        uint64_t token0_hash; // Hash of token0 address
        uint64_t token1_hash; // Hash of token1 address

        bool operator==(const TokenPair& other) const {
            return token0_hash == other.token0_hash && token1_hash == other.token1_hash;
        }
    };

    struct TokenPairHash {
        size_t operator()(const TokenPair& p) const {
            return p.token0_hash ^ (p.token1_hash << 1);
        }
    };

    ScannerConfig config_;

    // Pool storage - grouped by token pair for efficient scanning
    static constexpr size_t MAX_POOLS = 4096;
    static constexpr size_t MAX_PAIRS = 512;

    // Flat array storage for cache efficiency
    alignas(64) PoolEntry pools_[MAX_POOLS];
    size_t pool_count_;

    // Pair grouping for efficient scanning
    struct PairGroup {
        TokenPair pair;
        uint32_t pool_indices[32]; // Indices into pools_ array
        uint8_t count;
    };
    PairGroup pair_groups_[MAX_PAIRS];
    size_t pair_count_;

    // Internal methods
    void recalculate_price(size_t pool_index);
    void scan_pair_group(const PairGroup& group, std::vector<ArbitrageOpportunity>& out);
    void scan_pair_group_simd(const PairGroup& group, const OpportunityCallback& callback);
    int64_t calculate_spread_bps(const PriceResult& buy, const PriceResult& sell);
    bool meets_criteria(const ArbitrageOpportunity& opp) const;
};

// ============================================================================
// FAST SPREAD CALCULATION (INLINE)
// ============================================================================

namespace detail {

/// Calculate spread in basis points between two prices
/// spread_bps = (sell_price - buy_price) / buy_price * 10000
inline int64_t spread_bps_fast(double buy_price, double sell_price) {
    if (buy_price <= 0) return 0;
    return static_cast<int64_t>((sell_price - buy_price) / buy_price * 10000.0);
}

/// SIMD spread calculation for 4 price pairs
inline void spread_bps_x4(
    const double* buy_prices,
    const double* sell_prices,
    int64_t* spreads_out
) {
    f64x4 buy = simd::load_f64x4(buy_prices);
    f64x4 sell = simd::load_f64x4(sell_prices);

    // (sell - buy) / buy * 10000
    f64x4 diff = simd::sub_f64x4(sell, buy);
    f64x4 ratio = simd::div_f64x4(diff, buy);
    f64x4 bps = simd::mul_f64x4(ratio, _mm256_set1_pd(10000.0));

    // Convert to int64 (scalar, as AVX2 doesn't have direct f64->i64)
    alignas(32) double bps_vals[4];
    simd::store_f64x4(bps_vals, bps);

    for (int i = 0; i < 4; ++i) {
        spreads_out[i] = static_cast<int64_t>(bps_vals[i]);
    }
}

} // namespace detail

} // namespace matrix::hotpath
