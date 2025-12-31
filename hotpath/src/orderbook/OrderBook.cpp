#include "orderbook/OrderBook.hpp"

namespace matrix::orderbook {

const std::vector<PoolState*> OrderBook::empty_pools_;

OrderBook::OrderBook(memory::Arena& arena) : arena_(arena) {
    // Reserve space in hash maps
    pair_pools_.reserve(10000);
    pool_index_.reserve(MAX_POOLS);
    token_set_.reserve(MAX_TOKENS);
}

size_t OrderBook::process_updates(PriceQueue& queue) noexcept {
    size_t count = 0;
    PriceUpdate update;

    while (queue.try_pop(update)) {
        update_pool(update);
        count++;
    }

    return count;
}

void OrderBook::update_pool(const PriceUpdate& update) noexcept {
    // Get or create pool
    PoolState* pool = get_or_create_pool(update.pool_address_hash);
    if (!pool) return;

    // Update pool state
    pool->chain = static_cast<ChainId>(update.chain_id);
    pool->dex = static_cast<DexId>(update.dex_id);
    pool->token0_hash = update.token0;
    pool->token1_hash = update.token1;
    pool->reserve0 = update.reserve0;
    pool->reserve1 = update.reserve1;
    pool->last_update_ns = update.timestamp_ns;

    // Update token set
    token_set_.insert(update.token0);
    token_set_.insert(update.token1);

    // Update pair mapping
    PairKey key{update.token0, update.token1};
    auto& pools = pair_pools_[key];
    if (std::find(pools.begin(), pools.end(), pool) == pools.end()) {
        pools.push_back(pool);
    }

    // Also add reverse pair
    PairKey reverse_key{update.token1, update.token0};
    auto& reverse_pools = pair_pools_[reverse_key];
    if (std::find(reverse_pools.begin(), reverse_pools.end(), pool) == reverse_pools.end()) {
        reverse_pools.push_back(pool);
    }

    last_update_ns_ = update.timestamp_ns;
}

const std::vector<PoolState*>& OrderBook::get_pools(uint64_t token0, uint64_t token1) const noexcept {
    PairKey key{token0, token1};
    auto it = pair_pools_.find(key);
    if (it != pair_pools_.end()) {
        return it->second;
    }
    return empty_pools_;
}

const PoolState* OrderBook::get_best_price(uint64_t token0, uint64_t token1) const noexcept {
    const auto& pools = get_pools(token0, token1);
    if (pools.empty()) return nullptr;

    const PoolState* best = nullptr;
    uint64_t best_price = 0;

    for (const auto* pool : pools) {
        uint64_t price = pool->spot_price();
        if (price > best_price) {
            best_price = price;
            best = pool;
        }
    }

    return best;
}

std::vector<const PoolState*> OrderBook::get_pools_by_chain(ChainId chain) const noexcept {
    std::vector<const PoolState*> result;
    result.reserve(1000);

    for (size_t i = 0; i < pool_count_; ++i) {
        if (pools_[i].chain == chain) {
            result.push_back(&pools_[i]);
        }
    }

    return result;
}

PoolState* OrderBook::get_or_create_pool(uint64_t pool_hash) noexcept {
    auto it = pool_index_.find(pool_hash);
    if (it != pool_index_.end()) {
        return &pools_[it->second];
    }

    if (pool_count_ >= MAX_POOLS) {
        return nullptr;  // Pool storage exhausted
    }

    size_t index = pool_count_++;
    pools_[index].pool_address_hash = pool_hash;
    pool_index_[pool_hash] = index;

    return &pools_[index];
}

} // namespace matrix::orderbook
