#pragma once

#include <cstdint>
#include <vector>
#include <array>
#include <optional>

#include "../orderbook/OrderBook.hpp"

namespace matrix::arbitrage {

/**
 * Arbitrage Opportunity
 */
struct Opportunity {
    uint64_t id;                          // Unique opportunity ID
    uint64_t timestamp_ns;                // Detection timestamp
    uint64_t profit_wei;                  // Expected profit in wei
    uint32_t gas_estimate;                // Estimated gas cost
    ChainId chain;                        // Target chain

    // Swap path (max 4 hops)
    static constexpr size_t MAX_HOPS = 4;
    struct Hop {
        uint64_t pool_hash;               // Pool to use
        uint64_t token_in;                // Input token
        uint64_t token_out;               // Output token
        uint64_t amount_in;               // Input amount
        uint64_t amount_out;              // Expected output
    };
    std::array<Hop, MAX_HOPS> path;
    uint8_t path_length = 0;

    // Flash loan details
    uint64_t flash_loan_token;            // Token to borrow
    uint64_t flash_loan_amount;           // Amount to borrow
    uint64_t flash_loan_fee;              // Fee in wei

    /**
     * Calculate net profit after gas and fees
     */
    [[nodiscard]] int64_t net_profit(uint64_t gas_price_gwei) const noexcept {
        const uint64_t gas_cost = static_cast<uint64_t>(gas_estimate) * gas_price_gwei * 1'000'000'000ULL;
        return static_cast<int64_t>(profit_wei) - static_cast<int64_t>(gas_cost + flash_loan_fee);
    }

    /**
     * Check if opportunity is profitable at given gas price
     */
    [[nodiscard]] bool is_profitable(uint64_t gas_price_gwei, uint64_t min_profit_wei = 0) const noexcept {
        return net_profit(gas_price_gwei) > static_cast<int64_t>(min_profit_wei);
    }
};

/**
 * Token Graph Node - represents a token and its connected pools
 */
struct TokenNode {
    uint64_t token_hash;
    std::vector<uint64_t> connected_pools;
    std::vector<uint64_t> connected_tokens;
};

/**
 * Arbitrage Calculator - SIMD-optimized cycle detection
 *
 * Uses Bellman-Ford variant for negative cycle detection in the price graph.
 * Optimized with SIMD (AVX2) for parallel price comparisons.
 *
 * Performance target: <50us per full scan
 *
 * Research: Triangular arbitrage is most common (3-hop cycles).
 * We also check 4-hop cycles for less competitive opportunities.
 */
class Calculator {
public:
    static constexpr size_t MAX_OPPORTUNITIES = 1000;
    static constexpr uint64_t MIN_PROFIT_WEI = 10'000'000'000'000'000ULL;  // 0.01 ETH

    explicit Calculator(const OrderBook& orderbook);

    /**
     * Scan for arbitrage opportunities
     * @param chain Target chain (or all chains if nullopt)
     * @return Vector of profitable opportunities, sorted by profit
     */
    [[nodiscard]] std::vector<Opportunity> scan(
        std::optional<ChainId> chain = std::nullopt
    ) noexcept;

    /**
     * Scan for triangular arbitrage (3 hops)
     * Most common and fastest to detect
     */
    [[nodiscard]] std::vector<Opportunity> scan_triangular(
        ChainId chain,
        uint64_t base_token
    ) noexcept;

    /**
     * Calculate optimal input amount for a path
     * Uses binary search to find profit-maximizing input
     */
    [[nodiscard]] uint64_t optimize_amount(
        const std::array<Opportunity::Hop, 4>& path,
        uint8_t path_length,
        uint64_t max_input
    ) const noexcept;

    /**
     * Simulate a swap path and return final output
     */
    [[nodiscard]] uint64_t simulate_path(
        const std::array<Opportunity::Hop, 4>& path,
        uint8_t path_length,
        uint64_t input_amount
    ) const noexcept;

    /**
     * Statistics
     */
    [[nodiscard]] uint64_t scan_count() const noexcept { return scan_count_; }
    [[nodiscard]] uint64_t opportunity_count() const noexcept { return opportunity_count_; }
    [[nodiscard]] uint64_t last_scan_duration_ns() const noexcept { return last_scan_ns_; }

private:
    const OrderBook& orderbook_;

    // Token graph for cycle detection
    std::unordered_map<uint64_t, TokenNode> token_graph_;

    // Statistics
    uint64_t scan_count_ = 0;
    uint64_t opportunity_count_ = 0;
    uint64_t last_scan_ns_ = 0;

    /**
     * Build token graph from order book
     */
    void build_graph() noexcept;

    /**
     * Find cycles starting from a token using DFS
     */
    void find_cycles(
        uint64_t start_token,
        uint64_t current_token,
        std::vector<uint64_t>& path,
        std::vector<Opportunity>& opportunities,
        ChainId chain,
        int depth
    ) noexcept;

    /**
     * SIMD-optimized price comparison for multiple pools
     * Compares 4 pools at once using AVX2
     */
    void compare_prices_simd(
        const std::array<uint64_t, 4>& prices,
        const std::array<uint64_t, 4>& thresholds,
        std::array<bool, 4>& results
    ) noexcept;
};

} // namespace matrix::arbitrage

// Chain-specific convenience functions
namespace matrix::arbitrage {

using orderbook::ChainId;

inline constexpr uint64_t WETH_MAINNET = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2ULL;
inline constexpr uint64_t USDC_MAINNET = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48ULL;
inline constexpr uint64_t USDT_MAINNET = 0xdAC17F958D2ee523a2206206994597C13D831ec7ULL;

inline constexpr uint64_t WETH_ARBITRUM = 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1ULL;
inline constexpr uint64_t USDC_ARBITRUM = 0xaf88d065e77c8cC2239327C5EDb3A432268e5831ULL;

inline constexpr uint64_t WETH_BASE = 0x4200000000000000000000000000000000000006ULL;
inline constexpr uint64_t USDC_BASE = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913ULL;

} // namespace matrix::arbitrage
