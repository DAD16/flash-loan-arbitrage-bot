#pragma once

#include <cstdint>
#include <unordered_map>
#include <unordered_set>
#include <vector>
#include <array>
#include <string_view>

#include "SPSCQueue.hpp"
#include "../memory/Arena.hpp"

namespace matrix::orderbook {

/**
 * Chain identifiers (EIP-155)
 */
enum class ChainId : uint32_t {
    ETHEREUM = 1,
    BSC = 56,
    OPTIMISM = 10,
    ARBITRUM = 42161,
    BASE = 8453
};

/**
 * DEX identifiers
 */
enum class DexId : uint32_t {
    UNISWAP_V3 = 1,
    SUSHISWAP = 2,
    CURVE = 3,
    BALANCER = 4,
    PANCAKESWAP = 5,
    CAMELOT = 6,
    VELODROME = 7,
    AERODROME = 8
};

/**
 * Pool state - represents a DEX liquidity pool
 */
struct PoolState {
    uint64_t pool_address_hash;     // Keccak hash of pool address
    ChainId chain;
    DexId dex;
    uint64_t token0_hash;           // Token 0 address hash
    uint64_t token1_hash;           // Token 1 address hash
    uint64_t reserve0;              // Reserve of token 0 (raw units)
    uint64_t reserve1;              // Reserve of token 1 (raw units)
    uint32_t fee_bps;               // Fee in basis points (30 = 0.3%)
    uint64_t last_update_ns;        // Last update timestamp
    uint8_t decimals0;              // Token 0 decimals
    uint8_t decimals1;              // Token 1 decimals

    /**
     * Calculate spot price of token0 in terms of token1
     * Uses fixed-point arithmetic (18 decimals)
     */
    [[nodiscard]] uint64_t spot_price() const noexcept {
        if (reserve0 == 0) return 0;
        // Price = reserve1 / reserve0, scaled to 1e18
        return (reserve1 * 1'000'000'000'000'000'000ULL) / reserve0;
    }

    /**
     * Calculate output amount for a given input (constant product AMM)
     * @param amount_in Input amount
     * @param is_token0_in True if swapping token0 for token1
     * @return Output amount after fees
     */
    [[nodiscard]] uint64_t get_amount_out(uint64_t amount_in, bool is_token0_in) const noexcept {
        if (amount_in == 0) return 0;

        const uint64_t reserve_in = is_token0_in ? reserve0 : reserve1;
        const uint64_t reserve_out = is_token0_in ? reserve1 : reserve0;

        // Apply fee: amount_in_with_fee = amount_in * (10000 - fee_bps)
        const uint64_t amount_in_with_fee = amount_in * (10000 - fee_bps);

        // Constant product formula: dy = (dx * y) / (x + dx)
        const uint64_t numerator = amount_in_with_fee * reserve_out;
        const uint64_t denominator = reserve_in * 10000 + amount_in_with_fee;

        return numerator / denominator;
    }
};

/**
 * Token pair key for hash map
 */
struct PairKey {
    uint64_t token0;
    uint64_t token1;

    bool operator==(const PairKey& other) const noexcept {
        return token0 == other.token0 && token1 == other.token1;
    }
};

struct PairKeyHash {
    size_t operator()(const PairKey& key) const noexcept {
        return key.token0 ^ (key.token1 << 1);
    }
};

/**
 * Order Book - Aggregated view of all pools across all chains/DEXs
 *
 * Maintains a hash map from token pairs to all available pools.
 * Updated by consuming from the price queue.
 *
 * Performance target: <10us per update
 */
class OrderBook {
public:
    static constexpr size_t MAX_POOLS = 100000;
    static constexpr size_t MAX_TOKENS = 10000;

    explicit OrderBook(memory::Arena& arena);

    /**
     * Process price updates from the queue
     * @param queue Source of price updates
     * @return Number of updates processed
     */
    size_t process_updates(PriceQueue& queue) noexcept;

    /**
     * Update a single pool's state
     */
    void update_pool(const PriceUpdate& update) noexcept;

    /**
     * Get all pools for a token pair
     * @param token0 First token hash
     * @param token1 Second token hash
     * @return Vector of pool pointers (may be empty)
     */
    [[nodiscard]] const std::vector<PoolState*>& get_pools(uint64_t token0, uint64_t token1) const noexcept;

    /**
     * Get best price for a swap
     * @return Best pool for the swap, nullptr if none available
     */
    [[nodiscard]] const PoolState* get_best_price(uint64_t token0, uint64_t token1) const noexcept;

    /**
     * Get all pools on a specific chain
     */
    [[nodiscard]] std::vector<const PoolState*> get_pools_by_chain(ChainId chain) const noexcept;

    /**
     * Statistics
     */
    [[nodiscard]] size_t pool_count() const noexcept { return pool_count_; }
    [[nodiscard]] size_t token_count() const noexcept { return token_set_.size(); }
    [[nodiscard]] uint64_t last_update_ns() const noexcept { return last_update_ns_; }

private:
    memory::Arena& arena_;

    // Pool storage (pre-allocated)
    std::array<PoolState, MAX_POOLS> pools_;
    size_t pool_count_ = 0;

    // Token pair -> pools mapping
    std::unordered_map<PairKey, std::vector<PoolState*>, PairKeyHash> pair_pools_;

    // Pool address -> pool index mapping
    std::unordered_map<uint64_t, size_t> pool_index_;

    // Set of known tokens
    std::unordered_set<uint64_t> token_set_;

    // Empty vector for returning when no pools exist
    static const std::vector<PoolState*> empty_pools_;

    uint64_t last_update_ns_ = 0;

    /**
     * Get or create pool by address hash
     */
    PoolState* get_or_create_pool(uint64_t pool_hash) noexcept;
};

} // namespace matrix::orderbook
