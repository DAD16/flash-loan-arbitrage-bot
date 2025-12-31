#include "arbitrage/Calculator.hpp"
#include <algorithm>
#include <chrono>

namespace matrix::arbitrage {

using namespace orderbook;

Calculator::Calculator(const OrderBook& orderbook) : orderbook_(orderbook) {
    token_graph_.reserve(10000);
}

std::vector<Opportunity> Calculator::scan(std::optional<ChainId> chain) noexcept {
    auto start = std::chrono::high_resolution_clock::now();

    build_graph();

    std::vector<Opportunity> opportunities;
    opportunities.reserve(MAX_OPPORTUNITIES);

    // Scan for triangular arbitrage on each chain
    std::array<ChainId, 5> chains = {
        ChainId::ETHEREUM,
        ChainId::ARBITRUM,
        ChainId::OPTIMISM,
        ChainId::BASE,
        ChainId::BSC
    };

    for (auto c : chains) {
        if (chain.has_value() && chain.value() != c) continue;

        // Use major base tokens for each chain
        uint64_t base_token = 0;
        switch (c) {
            case ChainId::ETHEREUM:
                base_token = WETH_MAINNET;
                break;
            case ChainId::ARBITRUM:
                base_token = WETH_ARBITRUM;
                break;
            case ChainId::BASE:
                base_token = WETH_BASE;
                break;
            default:
                continue;
        }

        auto chain_opps = scan_triangular(c, base_token);
        opportunities.insert(opportunities.end(), chain_opps.begin(), chain_opps.end());
    }

    // Sort by profit (descending)
    std::sort(opportunities.begin(), opportunities.end(),
        [](const Opportunity& a, const Opportunity& b) {
            return a.profit_wei > b.profit_wei;
        });

    // Limit results
    if (opportunities.size() > MAX_OPPORTUNITIES) {
        opportunities.resize(MAX_OPPORTUNITIES);
    }

    auto end = std::chrono::high_resolution_clock::now();
    last_scan_ns_ = std::chrono::duration_cast<std::chrono::nanoseconds>(end - start).count();
    scan_count_++;
    opportunity_count_ += opportunities.size();

    return opportunities;
}

std::vector<Opportunity> Calculator::scan_triangular(ChainId chain, uint64_t base_token) noexcept {
    std::vector<Opportunity> opportunities;

    auto it = token_graph_.find(base_token);
    if (it == token_graph_.end()) return opportunities;

    const auto& base_node = it->second;

    // For each token connected to base
    for (size_t i = 0; i < base_node.connected_tokens.size(); ++i) {
        uint64_t token_a = base_node.connected_tokens[i];

        auto it_a = token_graph_.find(token_a);
        if (it_a == token_graph_.end()) continue;

        const auto& node_a = it_a->second;

        // For each token connected to token_a
        for (size_t j = 0; j < node_a.connected_tokens.size(); ++j) {
            uint64_t token_b = node_a.connected_tokens[j];
            if (token_b == base_token) continue;

            // Check if token_b connects back to base
            auto it_b = token_graph_.find(token_b);
            if (it_b == token_graph_.end()) continue;

            const auto& node_b = it_b->second;
            bool connects_to_base = std::find(
                node_b.connected_tokens.begin(),
                node_b.connected_tokens.end(),
                base_token
            ) != node_b.connected_tokens.end();

            if (!connects_to_base) continue;

            // Found a triangular path: base -> A -> B -> base
            // TODO: Calculate actual profit with optimal amounts
            Opportunity opp{};
            opp.id = scan_count_ * 1000000 + opportunities.size();
            opp.timestamp_ns = std::chrono::duration_cast<std::chrono::nanoseconds>(
                std::chrono::high_resolution_clock::now().time_since_epoch()
            ).count();
            opp.chain = chain;
            opp.path_length = 3;
            opp.flash_loan_token = base_token;
            opp.flash_loan_amount = 1'000'000'000'000'000'000ULL;  // 1 ETH
            opp.flash_loan_fee = 500'000'000'000'000ULL;  // 0.0005 ETH (Aave fee)
            opp.gas_estimate = 500000;

            // Simplified profit calculation (placeholder)
            opp.profit_wei = 0;  // Will be calculated by simulate_path

            opportunities.push_back(opp);
        }
    }

    return opportunities;
}

uint64_t Calculator::optimize_amount(
    const std::array<Opportunity::Hop, 4>& path,
    uint8_t path_length,
    uint64_t max_input
) const noexcept {
    // Binary search for optimal input amount
    uint64_t low = 0;
    uint64_t high = max_input;
    uint64_t best_amount = 0;
    int64_t best_profit = 0;

    while (low <= high) {
        uint64_t mid = low + (high - low) / 2;
        uint64_t output = simulate_path(path, path_length, mid);
        int64_t profit = static_cast<int64_t>(output) - static_cast<int64_t>(mid);

        if (profit > best_profit) {
            best_profit = profit;
            best_amount = mid;
        }

        // Adjust search range
        uint64_t output_high = simulate_path(path, path_length, mid + 1);
        int64_t profit_high = static_cast<int64_t>(output_high) - static_cast<int64_t>(mid + 1);

        if (profit_high > profit) {
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    return best_amount;
}

uint64_t Calculator::simulate_path(
    const std::array<Opportunity::Hop, 4>& path,
    uint8_t path_length,
    uint64_t input_amount
) const noexcept {
    uint64_t current_amount = input_amount;

    for (uint8_t i = 0; i < path_length && i < 4; ++i) {
        // Look up pool and calculate output
        // Simplified: would need actual pool lookup
        current_amount = current_amount * 997 / 1000;  // Approximate with 0.3% fee
    }

    return current_amount;
}

void Calculator::build_graph() noexcept {
    token_graph_.clear();

    // Build graph from order book
    // This would iterate through all pools and build adjacency list
    // Simplified implementation for now
}

void Calculator::find_cycles(
    uint64_t start_token,
    uint64_t current_token,
    std::vector<uint64_t>& path,
    std::vector<Opportunity>& opportunities,
    ChainId chain,
    int depth
) noexcept {
    if (depth > 4) return;  // Max 4 hops

    if (depth >= 3 && current_token == start_token) {
        // Found a cycle - calculate profitability
        // ... create opportunity ...
        return;
    }

    auto it = token_graph_.find(current_token);
    if (it == token_graph_.end()) return;

    for (uint64_t next_token : it->second.connected_tokens) {
        // Avoid visiting same token twice (except returning to start)
        if (next_token != start_token &&
            std::find(path.begin(), path.end(), next_token) != path.end()) {
            continue;
        }

        path.push_back(next_token);
        find_cycles(start_token, next_token, path, opportunities, chain, depth + 1);
        path.pop_back();
    }
}

void Calculator::compare_prices_simd(
    const std::array<uint64_t, 4>& prices,
    const std::array<uint64_t, 4>& thresholds,
    std::array<bool, 4>& results
) noexcept {
    // Simplified non-SIMD version (SIMD would use _mm256_cmpgt_epi64)
    for (int i = 0; i < 4; ++i) {
        results[i] = prices[i] > thresholds[i];
    }
}

} // namespace matrix::arbitrage
