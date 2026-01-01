/**
 * @file ffi.cpp
 * @brief FFI implementation for Rust integration
 */

#include "ffi.hpp"
#include "types.hpp"
#include "price_calculator.hpp"
#include "opportunity_scanner.hpp"
#include <cstring>
#include <vector>

#ifdef _WIN32
#include <intrin.h>
#else
#include <cpuid.h>
#endif

namespace {

// ============================================================================
// TYPE CONVERSION HELPERS
// ============================================================================

matrix::hotpath::U256 from_ffi(const ffi_u256_t& v) {
    matrix::hotpath::U256 result;
    std::memcpy(result.limbs, v.limbs, sizeof(v.limbs));
    return result;
}

ffi_u256_t to_ffi(const matrix::hotpath::U256& v) {
    ffi_u256_t result;
    std::memcpy(result.limbs, v.limbs, sizeof(v.limbs));
    return result;
}

matrix::hotpath::PoolReserves from_ffi(const ffi_pool_reserves_t& v) {
    matrix::hotpath::PoolReserves result;
    result.reserve0 = from_ffi(v.reserve0);
    result.reserve1 = from_ffi(v.reserve1);
    result.timestamp_ms = v.timestamp_ms;
    result.pool_id = v.pool_id;
    result.dex_id = v.dex_id;
    result.decimals0 = v.decimals0;
    result.decimals1 = v.decimals1;
    return result;
}

ffi_price_result_t to_ffi(const matrix::hotpath::PriceResult& v) {
    ffi_price_result_t result;
    result.price = to_ffi(v.price);
    result.timestamp_ms = v.timestamp_ms;
    result.pool_id = v.pool_id;
    result.dex_id = v.dex_id;
    result.confidence = v.confidence;
    return result;
}

ffi_arbitrage_opportunity_t to_ffi(const matrix::hotpath::ArbitrageOpportunity& v) {
    ffi_arbitrage_opportunity_t result;
    result.buy_pool_id = v.buy_pool_id;
    result.buy_dex_id = v.buy_dex_id;
    result.sell_pool_id = v.sell_pool_id;
    result.sell_dex_id = v.sell_dex_id;
    result.buy_price = to_ffi(v.buy_price);
    result.sell_price = to_ffi(v.sell_price);
    result.spread_bps = v.spread_bps;
    result.max_amount = to_ffi(v.max_amount);
    result.estimated_profit = to_ffi(v.estimated_profit);
    result.timestamp_ms = v.timestamp_ms;
    return result;
}

matrix::hotpath::ScannerConfig from_ffi(const ffi_scanner_config_t& v) {
    matrix::hotpath::ScannerConfig result;
    result.min_spread_bps = v.min_spread_bps;
    result.max_slippage_bps = v.max_slippage_bps;
    result.min_liquidity = from_ffi(v.min_liquidity);
    result.max_position_size = from_ffi(v.max_position_size);
    result.include_same_dex = v.include_same_dex != 0;
    return result;
}

// ============================================================================
// CPU FEATURE DETECTION
// ============================================================================

bool detect_avx2() {
#ifdef _WIN32
    int cpuInfo[4];
    __cpuidex(cpuInfo, 7, 0);
    return (cpuInfo[1] & (1 << 5)) != 0; // AVX2 is bit 5 of EBX
#else
    unsigned int eax, ebx, ecx, edx;
    if (__get_cpuid_count(7, 0, &eax, &ebx, &ecx, &edx)) {
        return (ebx & (1 << 5)) != 0;
    }
    return false;
#endif
}

bool detect_avx512() {
#ifdef _WIN32
    int cpuInfo[4];
    __cpuidex(cpuInfo, 7, 0);
    return (cpuInfo[1] & (1 << 16)) != 0; // AVX-512F is bit 16 of EBX
#else
    unsigned int eax, ebx, ecx, edx;
    if (__get_cpuid_count(7, 0, &eax, &ebx, &ecx, &edx)) {
        return (ebx & (1 << 16)) != 0;
    }
    return false;
#endif
}

} // anonymous namespace

// ============================================================================
// PRICE CALCULATION FUNCTIONS
// ============================================================================

extern "C" {

int32_t hotpath_calculate_price(
    const ffi_pool_reserves_t* reserves,
    ffi_price_result_t* result
) {
    if (!reserves || !result) return -1;

    try {
        auto cpp_reserves = from_ffi(*reserves);
        auto cpp_result = matrix::hotpath::calculate_price(cpp_reserves);
        *result = to_ffi(cpp_result);
        return 0;
    } catch (...) {
        return -1;
    }
}

size_t hotpath_calculate_prices_batch(
    const ffi_pool_reserves_t* reserves,
    size_t count,
    ffi_price_result_t* results
) {
    if (!reserves || !results || count == 0) return 0;

    try {
        // Convert to C++ types
        matrix::hotpath::PoolBatch batch;
        size_t processed = 0;

        while (processed < count) {
            batch.count = std::min(matrix::hotpath::SIMD_BATCH_SIZE, count - processed);

            for (size_t i = 0; i < batch.count; ++i) {
                batch.pools[i] = from_ffi(reserves[processed + i]);
            }

            // Temporary storage for results
            matrix::hotpath::PriceResult cpp_results[matrix::hotpath::SIMD_BATCH_SIZE];
            matrix::hotpath::calculate_prices_batch(batch, cpp_results);

            // Convert back to FFI types
            for (size_t i = 0; i < batch.count; ++i) {
                results[processed + i] = to_ffi(cpp_results[i]);
            }

            processed += batch.count;
        }

        return processed;
    } catch (...) {
        return 0;
    }
}

int32_t hotpath_calculate_swap_output(
    const ffi_u256_t* reserve_in,
    const ffi_u256_t* reserve_out,
    const ffi_u256_t* amount_in,
    ffi_u256_t* amount_out
) {
    if (!reserve_in || !reserve_out || !amount_in || !amount_out) return -1;

    try {
        auto result = matrix::hotpath::calculate_swap_output(
            from_ffi(*reserve_in),
            from_ffi(*reserve_out),
            from_ffi(*amount_in)
        );
        *amount_out = to_ffi(result);
        return 0;
    } catch (...) {
        return -1;
    }
}

int64_t hotpath_calculate_slippage_bps(
    const ffi_u256_t* reserve_in,
    const ffi_u256_t* reserve_out,
    const ffi_u256_t* amount_in
) {
    if (!reserve_in || !reserve_out || !amount_in) return 0;

    try {
        return matrix::hotpath::calculate_slippage_bps(
            from_ffi(*reserve_in),
            from_ffi(*reserve_out),
            from_ffi(*amount_in)
        );
    } catch (...) {
        return 0;
    }
}

// ============================================================================
// BATCH CALCULATOR
// ============================================================================

ffi_batch_calculator_handle_t hotpath_batch_calculator_create() {
    try {
        return new matrix::hotpath::BatchPriceCalculator();
    } catch (...) {
        return nullptr;
    }
}

void hotpath_batch_calculator_destroy(ffi_batch_calculator_handle_t handle) {
    delete static_cast<matrix::hotpath::BatchPriceCalculator*>(handle);
}

int32_t hotpath_batch_calculator_add_pool(
    ffi_batch_calculator_handle_t handle,
    const ffi_pool_reserves_t* reserves
) {
    if (!handle || !reserves) return 0;

    auto* calc = static_cast<matrix::hotpath::BatchPriceCalculator*>(handle);
    return calc->add_pool(from_ffi(*reserves)) ? 1 : 0;
}

size_t hotpath_batch_calculator_process(
    ffi_batch_calculator_handle_t handle,
    ffi_price_result_t* results,
    size_t max_results
) {
    if (!handle || !results) return 0;

    auto* calc = static_cast<matrix::hotpath::BatchPriceCalculator*>(handle);
    size_t count = std::min(calc->pool_count(), max_results);

    // Allocate temporary C++ results
    std::vector<matrix::hotpath::PriceResult> cpp_results(count);
    size_t processed = calc->process(cpp_results.data());

    // Convert to FFI
    for (size_t i = 0; i < processed && i < max_results; ++i) {
        results[i] = to_ffi(cpp_results[i]);
    }

    return std::min(processed, max_results);
}

void hotpath_batch_calculator_clear(ffi_batch_calculator_handle_t handle) {
    if (!handle) return;
    static_cast<matrix::hotpath::BatchPriceCalculator*>(handle)->clear();
}

size_t hotpath_batch_calculator_pool_count(ffi_batch_calculator_handle_t handle) {
    if (!handle) return 0;
    return static_cast<matrix::hotpath::BatchPriceCalculator*>(handle)->pool_count();
}

// ============================================================================
// OPPORTUNITY SCANNER
// ============================================================================

ffi_scanner_handle_t hotpath_scanner_create(const ffi_scanner_config_t* config) {
    try {
        if (config) {
            return new matrix::hotpath::OpportunityScanner(from_ffi(*config));
        } else {
            return new matrix::hotpath::OpportunityScanner();
        }
    } catch (...) {
        return nullptr;
    }
}

void hotpath_scanner_destroy(ffi_scanner_handle_t handle) {
    delete static_cast<matrix::hotpath::OpportunityScanner*>(handle);
}

void hotpath_scanner_update_pool(
    ffi_scanner_handle_t handle,
    const ffi_pool_reserves_t* reserves
) {
    if (!handle || !reserves) return;

    auto* scanner = static_cast<matrix::hotpath::OpportunityScanner*>(handle);
    scanner->update_pool(from_ffi(*reserves));
}

size_t hotpath_scanner_scan(
    ffi_scanner_handle_t handle,
    ffi_arbitrage_opportunity_t* opportunities,
    size_t max_opportunities
) {
    if (!handle || !opportunities) return 0;

    auto* scanner = static_cast<matrix::hotpath::OpportunityScanner*>(handle);
    std::vector<matrix::hotpath::ArbitrageOpportunity> cpp_opps;
    scanner->scan(cpp_opps);

    size_t count = std::min(cpp_opps.size(), max_opportunities);
    for (size_t i = 0; i < count; ++i) {
        opportunities[i] = to_ffi(cpp_opps[i]);
    }

    return count;
}

int32_t hotpath_scanner_get_best(
    ffi_scanner_handle_t handle,
    ffi_arbitrage_opportunity_t* opportunity
) {
    if (!handle || !opportunity) return 0;

    auto* scanner = static_cast<matrix::hotpath::OpportunityScanner*>(handle);
    matrix::hotpath::ArbitrageOpportunity cpp_opp;

    if (scanner->get_best_opportunity(cpp_opp)) {
        *opportunity = to_ffi(cpp_opp);
        return 1;
    }

    return 0;
}

void hotpath_scanner_clear(ffi_scanner_handle_t handle) {
    if (!handle) return;
    static_cast<matrix::hotpath::OpportunityScanner*>(handle)->clear();
}

size_t hotpath_scanner_pool_count(ffi_scanner_handle_t handle) {
    if (!handle) return 0;
    return static_cast<matrix::hotpath::OpportunityScanner*>(handle)->pool_count();
}

void hotpath_scanner_set_config(
    ffi_scanner_handle_t handle,
    const ffi_scanner_config_t* config
) {
    if (!handle || !config) return;

    auto* scanner = static_cast<matrix::hotpath::OpportunityScanner*>(handle);
    scanner->set_config(from_ffi(*config));
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const char* hotpath_version() {
    return "0.1.0";
}

int32_t hotpath_has_avx2() {
    return detect_avx2() ? 1 : 0;
}

int32_t hotpath_has_avx512() {
    return detect_avx512() ? 1 : 0;
}

} // extern "C"
