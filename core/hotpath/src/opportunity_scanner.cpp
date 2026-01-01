/**
 * @file opportunity_scanner.cpp
 * @brief SIMD-accelerated opportunity scanner implementation
 */

#include "opportunity_scanner.hpp"
#include <algorithm>
#include <cstring>

namespace matrix::hotpath {

// ============================================================================
// CONSTRUCTOR / DESTRUCTOR
// ============================================================================

OpportunityScanner::OpportunityScanner(const ScannerConfig& config)
    : config_(config)
    , pool_count_(0)
    , pair_count_(0)
{
    std::memset(pools_, 0, sizeof(pools_));
    std::memset(pair_groups_, 0, sizeof(pair_groups_));
}

OpportunityScanner::~OpportunityScanner() = default;

// ============================================================================
// POOL MANAGEMENT
// ============================================================================

void OpportunityScanner::update_pool(const PoolReserves& reserves) {
    // Find existing pool or add new one
    size_t pool_idx = MAX_POOLS;

    for (size_t i = 0; i < pool_count_; ++i) {
        if (pools_[i].reserves.pool_id == reserves.pool_id &&
            pools_[i].reserves.dex_id == reserves.dex_id) {
            pool_idx = i;
            break;
        }
    }

    if (pool_idx == MAX_POOLS) {
        // New pool
        if (pool_count_ >= MAX_POOLS) {
            return; // At capacity
        }
        pool_idx = pool_count_++;
    }

    // Update pool data
    pools_[pool_idx].reserves = reserves;
    pools_[pool_idx].valid = true;

    // Recalculate price
    recalculate_price(pool_idx);

    // Update pair grouping if new pool
    // (Simplified - in production would use hash map)
    // For now, linear search through pairs
    TokenPair pair;
    // Simple hash of addresses (would use actual address hash in production)
    pair.token0_hash = reserves.pool_id; // Placeholder
    pair.token1_hash = reserves.dex_id;  // Placeholder

    bool found_pair = false;
    for (size_t i = 0; i < pair_count_; ++i) {
        if (pair_groups_[i].pair == pair) {
            // Add to existing group if not already present
            auto& group = pair_groups_[i];
            bool already_in = false;
            for (uint8_t j = 0; j < group.count; ++j) {
                if (group.pool_indices[j] == static_cast<uint32_t>(pool_idx)) {
                    already_in = true;
                    break;
                }
            }
            if (!already_in && group.count < 32) {
                group.pool_indices[group.count++] = static_cast<uint32_t>(pool_idx);
            }
            found_pair = true;
            break;
        }
    }

    if (!found_pair && pair_count_ < MAX_PAIRS) {
        // Create new pair group
        auto& group = pair_groups_[pair_count_++];
        group.pair = pair;
        group.count = 1;
        group.pool_indices[0] = static_cast<uint32_t>(pool_idx);
    }
}

void OpportunityScanner::recalculate_price(size_t pool_index) {
    pools_[pool_index].price = calculate_price(pools_[pool_index].reserves);
}

void OpportunityScanner::clear() {
    pool_count_ = 0;
    pair_count_ = 0;
    std::memset(pools_, 0, sizeof(pools_));
    std::memset(pair_groups_, 0, sizeof(pair_groups_));
}

size_t OpportunityScanner::pool_count() const {
    return pool_count_;
}

void OpportunityScanner::set_config(const ScannerConfig& config) {
    config_ = config;
}

// ============================================================================
// SCANNING
// ============================================================================

size_t OpportunityScanner::scan(std::vector<ArbitrageOpportunity>& opportunities) {
    opportunities.clear();

    // Scan each pair group for opportunities
    for (size_t i = 0; i < pair_count_; ++i) {
        if (pair_groups_[i].count >= 2) {
            scan_pair_group(pair_groups_[i], opportunities);
        }
    }

    // Sort by profit (descending)
    std::sort(opportunities.begin(), opportunities.end(),
        [](const ArbitrageOpportunity& a, const ArbitrageOpportunity& b) {
            return simd::cmp_u256(a.estimated_profit, b.estimated_profit) > 0;
        });

    return opportunities.size();
}

size_t OpportunityScanner::scan_with_callback(const OpportunityCallback& callback) {
    size_t count = 0;

    for (size_t i = 0; i < pair_count_; ++i) {
        if (pair_groups_[i].count >= 2) {
            // Use SIMD-optimized scanning
            scan_pair_group_simd(pair_groups_[i], [&](const ArbitrageOpportunity& opp) {
                callback(opp);
                ++count;
            });
        }
    }

    return count;
}

bool OpportunityScanner::get_best_opportunity(ArbitrageOpportunity& out_opportunity) {
    ArbitrageOpportunity best;
    bool found = false;

    for (size_t i = 0; i < pair_count_; ++i) {
        if (pair_groups_[i].count < 2) continue;

        const auto& group = pair_groups_[i];

        // Compare all pairs of pools
        for (uint8_t a = 0; a < group.count; ++a) {
            for (uint8_t b = a + 1; b < group.count; ++b) {
                const auto& pool_a = pools_[group.pool_indices[a]];
                const auto& pool_b = pools_[group.pool_indices[b]];

                if (!pool_a.valid || !pool_b.valid) continue;

                // Check both directions
                int64_t spread_ab = calculate_spread_bps(pool_a.price, pool_b.price);
                int64_t spread_ba = calculate_spread_bps(pool_b.price, pool_a.price);

                ArbitrageOpportunity opp;

                if (spread_ab >= config_.min_spread_bps) {
                    opp.buy_pool_id = pool_a.reserves.pool_id;
                    opp.buy_dex_id = pool_a.reserves.dex_id;
                    opp.sell_pool_id = pool_b.reserves.pool_id;
                    opp.sell_dex_id = pool_b.reserves.dex_id;
                    opp.buy_price = pool_a.price.price;
                    opp.sell_price = pool_b.price.price;
                    opp.spread_bps = spread_ab;
                    opp.timestamp_ms = std::max(pool_a.reserves.timestamp_ms,
                                                pool_b.reserves.timestamp_ms);

                    // Calculate optimal size and profit
                    opp.max_amount = calculate_optimal_trade_size(
                        pool_a.reserves.reserve0, pool_a.reserves.reserve1,
                        pool_b.reserves.reserve0, pool_b.reserves.reserve1
                    );
                    opp.estimated_profit = calculate_arbitrage_profit(
                        pool_a.reserves, pool_b.reserves, opp.max_amount
                    );

                    if (meets_criteria(opp)) {
                        if (!found || simd::cmp_u256(opp.estimated_profit, best.estimated_profit) > 0) {
                            best = opp;
                            found = true;
                        }
                    }
                }

                if (spread_ba >= config_.min_spread_bps) {
                    opp.buy_pool_id = pool_b.reserves.pool_id;
                    opp.buy_dex_id = pool_b.reserves.dex_id;
                    opp.sell_pool_id = pool_a.reserves.pool_id;
                    opp.sell_dex_id = pool_a.reserves.dex_id;
                    opp.buy_price = pool_b.price.price;
                    opp.sell_price = pool_a.price.price;
                    opp.spread_bps = spread_ba;
                    opp.timestamp_ms = std::max(pool_a.reserves.timestamp_ms,
                                                pool_b.reserves.timestamp_ms);

                    opp.max_amount = calculate_optimal_trade_size(
                        pool_b.reserves.reserve0, pool_b.reserves.reserve1,
                        pool_a.reserves.reserve0, pool_a.reserves.reserve1
                    );
                    opp.estimated_profit = calculate_arbitrage_profit(
                        pool_b.reserves, pool_a.reserves, opp.max_amount
                    );

                    if (meets_criteria(opp)) {
                        if (!found || simd::cmp_u256(opp.estimated_profit, best.estimated_profit) > 0) {
                            best = opp;
                            found = true;
                        }
                    }
                }
            }
        }
    }

    if (found) {
        out_opportunity = best;
    }
    return found;
}

// ============================================================================
// INTERNAL METHODS
// ============================================================================

void OpportunityScanner::scan_pair_group(
    const PairGroup& group,
    std::vector<ArbitrageOpportunity>& out
) {
    // Compare all pairs of pools in the group
    for (uint8_t a = 0; a < group.count; ++a) {
        for (uint8_t b = a + 1; b < group.count; ++b) {
            const auto& pool_a = pools_[group.pool_indices[a]];
            const auto& pool_b = pools_[group.pool_indices[b]];

            if (!pool_a.valid || !pool_b.valid) continue;

            // Skip same-DEX if configured
            if (!config_.include_same_dex &&
                pool_a.reserves.dex_id == pool_b.reserves.dex_id) {
                continue;
            }

            // Check both directions
            int64_t spread_ab = calculate_spread_bps(pool_a.price, pool_b.price);
            int64_t spread_ba = calculate_spread_bps(pool_b.price, pool_a.price);

            if (spread_ab >= config_.min_spread_bps) {
                ArbitrageOpportunity opp;
                opp.buy_pool_id = pool_a.reserves.pool_id;
                opp.buy_dex_id = pool_a.reserves.dex_id;
                opp.sell_pool_id = pool_b.reserves.pool_id;
                opp.sell_dex_id = pool_b.reserves.dex_id;
                opp.buy_price = pool_a.price.price;
                opp.sell_price = pool_b.price.price;
                opp.spread_bps = spread_ab;
                opp.timestamp_ms = std::max(pool_a.reserves.timestamp_ms,
                                            pool_b.reserves.timestamp_ms);

                opp.max_amount = calculate_optimal_trade_size(
                    pool_a.reserves.reserve0, pool_a.reserves.reserve1,
                    pool_b.reserves.reserve0, pool_b.reserves.reserve1
                );
                opp.estimated_profit = calculate_arbitrage_profit(
                    pool_a.reserves, pool_b.reserves, opp.max_amount
                );

                if (meets_criteria(opp)) {
                    out.push_back(opp);
                }
            }

            if (spread_ba >= config_.min_spread_bps) {
                ArbitrageOpportunity opp;
                opp.buy_pool_id = pool_b.reserves.pool_id;
                opp.buy_dex_id = pool_b.reserves.dex_id;
                opp.sell_pool_id = pool_a.reserves.pool_id;
                opp.sell_dex_id = pool_a.reserves.dex_id;
                opp.buy_price = pool_b.price.price;
                opp.sell_price = pool_a.price.price;
                opp.spread_bps = spread_ba;
                opp.timestamp_ms = std::max(pool_a.reserves.timestamp_ms,
                                            pool_b.reserves.timestamp_ms);

                opp.max_amount = calculate_optimal_trade_size(
                    pool_b.reserves.reserve0, pool_b.reserves.reserve1,
                    pool_a.reserves.reserve0, pool_a.reserves.reserve1
                );
                opp.estimated_profit = calculate_arbitrage_profit(
                    pool_b.reserves, pool_a.reserves, opp.max_amount
                );

                if (meets_criteria(opp)) {
                    out.push_back(opp);
                }
            }
        }
    }
}

void OpportunityScanner::scan_pair_group_simd(
    const PairGroup& group,
    const OpportunityCallback& callback
) {
    // SIMD-optimized scanning for groups with many pools
    // Process 4 price comparisons at once

    if (group.count < 4) {
        // Fall back to scalar for small groups
        std::vector<ArbitrageOpportunity> opps;
        scan_pair_group(group, opps);
        for (const auto& opp : opps) {
            callback(opp);
        }
        return;
    }

    // Extract prices into aligned arrays
    alignas(32) double prices[32];
    for (uint8_t i = 0; i < group.count && i < 32; ++i) {
        prices[i] = simd::u256_to_double(pools_[group.pool_indices[i]].price.price);
    }

    // Compare prices using SIMD
    for (uint8_t a = 0; a < group.count; ++a) {
        // Load price_a into all lanes
        f64x4 price_a = _mm256_set1_pd(prices[a]);

        // Process 4 pools at a time
        for (uint8_t b = 0; b + 4 <= group.count; b += 4) {
            if (b == a || b + 1 == a || b + 2 == a || b + 3 == a) {
                // Skip if a is in this batch (handle individually)
                continue;
            }

            f64x4 price_b = simd::load_f64x4(&prices[b]);

            // Calculate spreads: (price_b - price_a) / price_a * 10000
            f64x4 diff = simd::sub_f64x4(price_b, price_a);
            f64x4 ratio = simd::div_f64x4(diff, price_a);
            f64x4 bps = simd::mul_f64x4(ratio, _mm256_set1_pd(10000.0));

            // Extract and check spreads
            alignas(32) double spreads[4];
            simd::store_f64x4(spreads, bps);

            for (int i = 0; i < 4; ++i) {
                int64_t spread = static_cast<int64_t>(spreads[i]);
                if (spread >= config_.min_spread_bps) {
                    const auto& pool_a = pools_[group.pool_indices[a]];
                    const auto& pool_b = pools_[group.pool_indices[b + i]];

                    if (!config_.include_same_dex &&
                        pool_a.reserves.dex_id == pool_b.reserves.dex_id) {
                        continue;
                    }

                    ArbitrageOpportunity opp;
                    opp.buy_pool_id = pool_a.reserves.pool_id;
                    opp.buy_dex_id = pool_a.reserves.dex_id;
                    opp.sell_pool_id = pool_b.reserves.pool_id;
                    opp.sell_dex_id = pool_b.reserves.dex_id;
                    opp.buy_price = pool_a.price.price;
                    opp.sell_price = pool_b.price.price;
                    opp.spread_bps = spread;
                    opp.timestamp_ms = std::max(pool_a.reserves.timestamp_ms,
                                                pool_b.reserves.timestamp_ms);

                    opp.max_amount = calculate_optimal_trade_size(
                        pool_a.reserves.reserve0, pool_a.reserves.reserve1,
                        pool_b.reserves.reserve0, pool_b.reserves.reserve1
                    );
                    opp.estimated_profit = calculate_arbitrage_profit(
                        pool_a.reserves, pool_b.reserves, opp.max_amount
                    );

                    if (meets_criteria(opp)) {
                        callback(opp);
                    }
                }
            }
        }
    }
}

int64_t OpportunityScanner::calculate_spread_bps(const PriceResult& buy, const PriceResult& sell) {
    double buy_price = simd::u256_to_double(buy.price);
    double sell_price = simd::u256_to_double(sell.price);
    return detail::spread_bps_fast(buy_price, sell_price);
}

bool OpportunityScanner::meets_criteria(const ArbitrageOpportunity& opp) const {
    // Check minimum spread
    if (opp.spread_bps < config_.min_spread_bps) {
        return false;
    }

    // Check minimum profit (must be positive)
    if (opp.estimated_profit.is_zero()) {
        return false;
    }

    // Check maximum position size
    if (simd::cmp_u256(opp.max_amount, config_.max_position_size) > 0) {
        return false;
    }

    return true;
}

} // namespace matrix::hotpath
