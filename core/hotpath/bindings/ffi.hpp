#pragma once
/**
 * @file ffi.hpp
 * @brief C FFI bindings for Rust integration
 *
 * Provides a C-compatible interface for calling the C++ SIMD hot path
 * from Rust via FFI.
 */

#include <cstdint>
#include <cstddef>

// Windows DLL export macros
#ifdef _WIN32
    #ifdef HOTPATH_EXPORTS
        #define HOTPATH_API __declspec(dllexport)
    #else
        #define HOTPATH_API __declspec(dllimport)
    #endif
#else
    #define HOTPATH_API __attribute__((visibility("default")))
#endif

extern "C" {

// ============================================================================
// FFI TYPES (C-compatible versions of C++ types)
// ============================================================================

/// 256-bit unsigned integer (C-compatible)
typedef struct {
    uint64_t limbs[4];
} ffi_u256_t;

/// Pool reserves (C-compatible)
typedef struct {
    ffi_u256_t reserve0;
    ffi_u256_t reserve1;
    uint64_t timestamp_ms;
    uint32_t pool_id;
    uint32_t dex_id;
    uint8_t decimals0;
    uint8_t decimals1;
    uint8_t _padding[6];
} ffi_pool_reserves_t;

/// Price result (C-compatible)
typedef struct {
    ffi_u256_t price;
    uint64_t timestamp_ms;
    uint32_t pool_id;
    uint32_t dex_id;
    int64_t confidence;
    uint8_t _padding[4];
} ffi_price_result_t;

/// Arbitrage opportunity (C-compatible)
typedef struct {
    uint32_t buy_pool_id;
    uint32_t buy_dex_id;
    uint32_t sell_pool_id;
    uint32_t sell_dex_id;
    ffi_u256_t buy_price;
    ffi_u256_t sell_price;
    int64_t spread_bps;
    ffi_u256_t max_amount;
    ffi_u256_t estimated_profit;
    uint64_t timestamp_ms;
} ffi_arbitrage_opportunity_t;

/// Scanner configuration (C-compatible)
typedef struct {
    int64_t min_spread_bps;
    int64_t max_slippage_bps;
    ffi_u256_t min_liquidity;
    ffi_u256_t max_position_size;
    uint8_t include_same_dex;
} ffi_scanner_config_t;

/// Opaque scanner handle
typedef void* ffi_scanner_handle_t;

/// Opaque batch calculator handle
typedef void* ffi_batch_calculator_handle_t;

// ============================================================================
// PRICE CALCULATION FUNCTIONS
// ============================================================================

/**
 * @brief Calculate price from pool reserves
 * @param reserves Pool reserves
 * @param result Output price result
 * @return 0 on success, non-zero on error
 */
HOTPATH_API int32_t hotpath_calculate_price(
    const ffi_pool_reserves_t* reserves,
    ffi_price_result_t* result
);

/**
 * @brief Calculate prices for a batch of pools
 * @param reserves Array of pool reserves
 * @param count Number of pools
 * @param results Output array for results
 * @return Number of prices calculated
 */
HOTPATH_API size_t hotpath_calculate_prices_batch(
    const ffi_pool_reserves_t* reserves,
    size_t count,
    ffi_price_result_t* results
);

/**
 * @brief Calculate swap output amount
 * @param reserve_in Input reserve
 * @param reserve_out Output reserve
 * @param amount_in Input amount
 * @param amount_out Output amount result
 * @return 0 on success, non-zero on error
 */
HOTPATH_API int32_t hotpath_calculate_swap_output(
    const ffi_u256_t* reserve_in,
    const ffi_u256_t* reserve_out,
    const ffi_u256_t* amount_in,
    ffi_u256_t* amount_out
);

/**
 * @brief Calculate slippage in basis points
 * @param reserve_in Input reserve
 * @param reserve_out Output reserve
 * @param amount_in Trade amount
 * @return Slippage in basis points
 */
HOTPATH_API int64_t hotpath_calculate_slippage_bps(
    const ffi_u256_t* reserve_in,
    const ffi_u256_t* reserve_out,
    const ffi_u256_t* amount_in
);

// ============================================================================
// BATCH CALCULATOR
// ============================================================================

/**
 * @brief Create a new batch calculator
 * @return Calculator handle, or NULL on failure
 */
HOTPATH_API ffi_batch_calculator_handle_t hotpath_batch_calculator_create();

/**
 * @brief Destroy a batch calculator
 * @param handle Calculator handle
 */
HOTPATH_API void hotpath_batch_calculator_destroy(ffi_batch_calculator_handle_t handle);

/**
 * @brief Add pool to batch calculator
 * @param handle Calculator handle
 * @param reserves Pool reserves
 * @return 1 if added, 0 if batch is full
 */
HOTPATH_API int32_t hotpath_batch_calculator_add_pool(
    ffi_batch_calculator_handle_t handle,
    const ffi_pool_reserves_t* reserves
);

/**
 * @brief Process all pools in batch calculator
 * @param handle Calculator handle
 * @param results Output array for results
 * @param max_results Maximum results to write
 * @return Number of results written
 */
HOTPATH_API size_t hotpath_batch_calculator_process(
    ffi_batch_calculator_handle_t handle,
    ffi_price_result_t* results,
    size_t max_results
);

/**
 * @brief Clear batch calculator
 * @param handle Calculator handle
 */
HOTPATH_API void hotpath_batch_calculator_clear(ffi_batch_calculator_handle_t handle);

/**
 * @brief Get pool count in batch calculator
 * @param handle Calculator handle
 * @return Number of pools
 */
HOTPATH_API size_t hotpath_batch_calculator_pool_count(ffi_batch_calculator_handle_t handle);

// ============================================================================
// OPPORTUNITY SCANNER
// ============================================================================

/**
 * @brief Create a new opportunity scanner
 * @param config Scanner configuration (NULL for defaults)
 * @return Scanner handle, or NULL on failure
 */
HOTPATH_API ffi_scanner_handle_t hotpath_scanner_create(const ffi_scanner_config_t* config);

/**
 * @brief Destroy an opportunity scanner
 * @param handle Scanner handle
 */
HOTPATH_API void hotpath_scanner_destroy(ffi_scanner_handle_t handle);

/**
 * @brief Update pool in scanner
 * @param handle Scanner handle
 * @param reserves Pool reserves
 */
HOTPATH_API void hotpath_scanner_update_pool(
    ffi_scanner_handle_t handle,
    const ffi_pool_reserves_t* reserves
);

/**
 * @brief Scan for opportunities
 * @param handle Scanner handle
 * @param opportunities Output array
 * @param max_opportunities Maximum opportunities to return
 * @return Number of opportunities found
 */
HOTPATH_API size_t hotpath_scanner_scan(
    ffi_scanner_handle_t handle,
    ffi_arbitrage_opportunity_t* opportunities,
    size_t max_opportunities
);

/**
 * @brief Get best opportunity
 * @param handle Scanner handle
 * @param opportunity Output for best opportunity
 * @return 1 if found, 0 if no opportunity
 */
HOTPATH_API int32_t hotpath_scanner_get_best(
    ffi_scanner_handle_t handle,
    ffi_arbitrage_opportunity_t* opportunity
);

/**
 * @brief Clear all pools from scanner
 * @param handle Scanner handle
 */
HOTPATH_API void hotpath_scanner_clear(ffi_scanner_handle_t handle);

/**
 * @brief Get pool count in scanner
 * @param handle Scanner handle
 * @return Number of pools
 */
HOTPATH_API size_t hotpath_scanner_pool_count(ffi_scanner_handle_t handle);

/**
 * @brief Update scanner configuration
 * @param handle Scanner handle
 * @param config New configuration
 */
HOTPATH_API void hotpath_scanner_set_config(
    ffi_scanner_handle_t handle,
    const ffi_scanner_config_t* config
);

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * @brief Get library version
 * @return Version string
 */
HOTPATH_API const char* hotpath_version();

/**
 * @brief Check if AVX2 is supported
 * @return 1 if supported, 0 if not
 */
HOTPATH_API int32_t hotpath_has_avx2();

/**
 * @brief Check if AVX-512 is supported
 * @return 1 if supported, 0 if not
 */
HOTPATH_API int32_t hotpath_has_avx512();

} // extern "C"
