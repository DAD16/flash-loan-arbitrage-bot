/**
 * @file test_main.cpp
 * @brief Unit tests for SIMD hot path operations
 */

#include "types.hpp"
#include "simd_math.hpp"
#include "price_calculator.hpp"
#include "opportunity_scanner.hpp"
#include "../bindings/ffi.hpp"
#include <iostream>
#include <cassert>
#include <cmath>

using namespace matrix::hotpath;

// ============================================================================
// TEST UTILITIES
// ============================================================================

#define TEST(name) \
    void test_##name(); \
    static bool registered_##name = (register_test(#name, test_##name), true); \
    void test_##name()

#define ASSERT_TRUE(expr) \
    if (!(expr)) { \
        std::cerr << "FAILED: " << #expr << " at line " << __LINE__ << "\n"; \
        throw std::runtime_error("Test assertion failed"); \
    }

#define ASSERT_EQ(a, b) \
    if ((a) != (b)) { \
        std::cerr << "FAILED: " << #a << " == " << #b << " at line " << __LINE__ << "\n"; \
        std::cerr << "  Got: " << (a) << " != " << (b) << "\n"; \
        throw std::runtime_error("Test assertion failed"); \
    }

#define ASSERT_NEAR(a, b, eps) \
    if (std::abs((a) - (b)) > (eps)) { \
        std::cerr << "FAILED: |" << #a << " - " << #b << "| <= " << eps << " at line " << __LINE__ << "\n"; \
        std::cerr << "  Got: |" << (a) << " - " << (b) << "| = " << std::abs((a)-(b)) << "\n"; \
        throw std::runtime_error("Test assertion failed"); \
    }

struct TestEntry {
    const char* name;
    void (*func)();
};

static TestEntry tests[100];
static int test_count = 0;

void register_test(const char* name, void (*func)()) {
    tests[test_count++] = {name, func};
}

// ============================================================================
// U256 TESTS
// ============================================================================

TEST(u256_creation) {
    U256 zero;
    ASSERT_TRUE(zero.is_zero());

    U256 one(1);
    ASSERT_EQ(one.limbs[0], 1ULL);
    ASSERT_EQ(one.limbs[1], 0ULL);

    U256 full(0xFFFFFFFFFFFFFFFFULL, 0xFFFFFFFFFFFFFFFFULL, 0, 0);
    ASSERT_EQ(full.limbs[0], 0xFFFFFFFFFFFFFFFFULL);
    ASSERT_EQ(full.limbs[1], 0xFFFFFFFFFFFFFFFFULL);
}

TEST(u256_add) {
    U256 a(100, 0, 0, 0);
    U256 b(200, 0, 0, 0);
    U256 result = simd::add_u256(a, b);
    ASSERT_EQ(result.limbs[0], 300ULL);

    // Test carry
    U256 max64(0xFFFFFFFFFFFFFFFFULL, 0, 0, 0);
    U256 one(1, 0, 0, 0);
    result = simd::add_u256(max64, one);
    ASSERT_EQ(result.limbs[0], 0ULL);
    ASSERT_EQ(result.limbs[1], 1ULL);
}

TEST(u256_sub) {
    U256 a(300, 0, 0, 0);
    U256 b(100, 0, 0, 0);
    U256 result = simd::sub_u256(a, b);
    ASSERT_EQ(result.limbs[0], 200ULL);

    // Test borrow
    U256 large(0, 1, 0, 0);
    U256 one(1, 0, 0, 0);
    result = simd::sub_u256(large, one);
    ASSERT_EQ(result.limbs[0], 0xFFFFFFFFFFFFFFFFULL);
    ASSERT_EQ(result.limbs[1], 0ULL);
}

TEST(u256_mul_u64) {
    U256 a(1000, 0, 0, 0);
    U256 result = simd::mul_u256_u64(a, 997);
    ASSERT_EQ(result.limbs[0], 997000ULL);

    // Test with carry
    U256 large(0xFFFFFFFFFFFFFFFFULL, 0, 0, 0);
    result = simd::mul_u256_u64(large, 2);
    ASSERT_EQ(result.limbs[0], 0xFFFFFFFFFFFFFFFEULL);
    ASSERT_EQ(result.limbs[1], 1ULL);
}

TEST(u256_div_u64) {
    U256 a(1000000, 0, 0, 0);
    U256 result = simd::div_u256_u64(a, 1000);
    ASSERT_EQ(result.limbs[0], 1000ULL);

    // Test larger value
    U256 large(0, 1, 0, 0); // 2^64
    result = simd::div_u256_u64(large, 2);
    ASSERT_EQ(result.limbs[0], 0x8000000000000000ULL);
    ASSERT_EQ(result.limbs[1], 0ULL);
}

TEST(u256_cmp) {
    U256 a(100, 0, 0, 0);
    U256 b(200, 0, 0, 0);
    U256 c(100, 0, 0, 0);

    ASSERT_EQ(simd::cmp_u256(a, b), -1);
    ASSERT_EQ(simd::cmp_u256(b, a), 1);
    ASSERT_EQ(simd::cmp_u256(a, c), 0);

    // Test higher limbs
    U256 high(0, 1, 0, 0);
    ASSERT_EQ(simd::cmp_u256(high, a), 1);
}

// ============================================================================
// PRICE CALCULATION TESTS
// ============================================================================

TEST(price_calculation_basic) {
    PoolReserves pool;
    pool.reserve0 = U256(1'000'000'000'000'000'000ULL); // 1e18
    pool.reserve1 = U256(2'000'000'000'000'000'000ULL); // 2e18
    pool.pool_id = 1;
    pool.dex_id = 1;
    pool.timestamp_ms = 12345;

    PriceResult result = calculate_price(pool);

    // Price should be ~2e18 (reserve1/reserve0 * 1e18)
    ASSERT_EQ(result.pool_id, 1U);
    ASSERT_EQ(result.dex_id, 1U);
    ASSERT_TRUE(result.price.limbs[0] > 1'900'000'000'000'000'000ULL);
    ASSERT_TRUE(result.price.limbs[0] < 2'100'000'000'000'000'000ULL);
}

TEST(price_calculation_zero_reserve) {
    PoolReserves pool;
    pool.reserve0 = U256(0);
    pool.reserve1 = U256(1'000'000'000'000'000'000ULL);

    PriceResult result = calculate_price(pool);
    ASSERT_TRUE(result.price.is_zero());
}

TEST(batch_price_calculation) {
    PoolBatch batch;
    batch.count = 4;

    for (size_t i = 0; i < 4; ++i) {
        batch.pools[i].reserve0 = U256((i + 1) * 1'000'000'000'000'000'000ULL);
        batch.pools[i].reserve1 = U256((i + 2) * 1'000'000'000'000'000'000ULL);
        batch.pools[i].pool_id = static_cast<uint32_t>(i);
        batch.pools[i].dex_id = 1;
    }

    PriceResult results[SIMD_BATCH_SIZE];
    calculate_prices_batch(batch, results);

    for (size_t i = 0; i < 4; ++i) {
        ASSERT_EQ(results[i].pool_id, static_cast<uint32_t>(i));
        ASSERT_TRUE(!results[i].price.is_zero());
    }
}

// ============================================================================
// SWAP CALCULATION TESTS
// ============================================================================

TEST(swap_output_basic) {
    U256 reserve_in(1'000'000'000'000'000'000ULL);  // 1 token
    U256 reserve_out(2'000'000'000'000'000'000ULL); // 2 tokens
    U256 amount_in(100'000'000'000'000'000ULL);     // 0.1 tokens

    U256 amount_out = calculate_swap_output(reserve_in, reserve_out, amount_in);

    // Output should be approximately 0.18 tokens (accounting for 0.3% fee and slippage)
    double out = simd::u256_to_double(amount_out) / 1e18;
    ASSERT_TRUE(out > 0.15);
    ASSERT_TRUE(out < 0.20);
}

TEST(swap_output_zero_input) {
    U256 reserve_in(1'000'000'000'000'000'000ULL);
    U256 reserve_out(2'000'000'000'000'000'000ULL);
    U256 amount_in(0);

    U256 amount_out = calculate_swap_output(reserve_in, reserve_out, amount_in);
    ASSERT_TRUE(amount_out.is_zero());
}

TEST(slippage_calculation) {
    U256 reserve_in(1'000'000'000'000'000'000ULL);
    U256 reserve_out(1'000'000'000'000'000'000ULL);

    // Small trade - low slippage
    U256 small_amount(1'000'000'000'000'000ULL); // 0.001 tokens
    int64_t slippage_small = calculate_slippage_bps(reserve_in, reserve_out, small_amount);
    ASSERT_TRUE(slippage_small < 100); // Less than 1%

    // Large trade - higher slippage
    U256 large_amount(100'000'000'000'000'000ULL); // 0.1 tokens
    int64_t slippage_large = calculate_slippage_bps(reserve_in, reserve_out, large_amount);
    ASSERT_TRUE(slippage_large > slippage_small);
}

// ============================================================================
// OPPORTUNITY SCANNER TESTS
// ============================================================================

TEST(scanner_creation) {
    OpportunityScanner scanner;
    ASSERT_EQ(scanner.pool_count(), 0UL);
}

TEST(scanner_update_pool) {
    OpportunityScanner scanner;

    PoolReserves pool;
    pool.reserve0 = U256(1'000'000'000'000'000'000ULL);
    pool.reserve1 = U256(2'000'000'000'000'000'000ULL);
    pool.pool_id = 1;
    pool.dex_id = 1;

    scanner.update_pool(pool);
    ASSERT_EQ(scanner.pool_count(), 1UL);

    // Update same pool
    pool.reserve1 = U256(2'500'000'000'000'000'000ULL);
    scanner.update_pool(pool);
    ASSERT_EQ(scanner.pool_count(), 1UL);

    // Add different pool
    pool.pool_id = 2;
    scanner.update_pool(pool);
    ASSERT_EQ(scanner.pool_count(), 2UL);
}

TEST(scanner_clear) {
    OpportunityScanner scanner;

    PoolReserves pool;
    pool.reserve0 = U256(1'000'000'000'000'000'000ULL);
    pool.reserve1 = U256(2'000'000'000'000'000'000ULL);
    pool.pool_id = 1;
    pool.dex_id = 1;

    scanner.update_pool(pool);
    ASSERT_EQ(scanner.pool_count(), 1UL);

    scanner.clear();
    ASSERT_EQ(scanner.pool_count(), 0UL);
}

// ============================================================================
// FFI TESTS
// ============================================================================

TEST(ffi_version) {
    const char* version = hotpath_version();
    ASSERT_TRUE(version != nullptr);
    ASSERT_EQ(std::string(version), "0.1.0");
}

TEST(ffi_cpu_features) {
    // These should not crash, actual values depend on CPU
    int32_t avx2 = hotpath_has_avx2();
    int32_t avx512 = hotpath_has_avx512();
    (void)avx2;
    (void)avx512;
}

TEST(ffi_batch_calculator) {
    ffi_batch_calculator_handle_t calc = hotpath_batch_calculator_create();
    ASSERT_TRUE(calc != nullptr);

    ffi_pool_reserves_t pool;
    pool.reserve0.limbs[0] = 1'000'000'000'000'000'000ULL;
    pool.reserve0.limbs[1] = 0;
    pool.reserve0.limbs[2] = 0;
    pool.reserve0.limbs[3] = 0;
    pool.reserve1.limbs[0] = 2'000'000'000'000'000'000ULL;
    pool.reserve1.limbs[1] = 0;
    pool.reserve1.limbs[2] = 0;
    pool.reserve1.limbs[3] = 0;
    pool.pool_id = 1;
    pool.dex_id = 1;

    int32_t added = hotpath_batch_calculator_add_pool(calc, &pool);
    ASSERT_EQ(added, 1);
    ASSERT_EQ(hotpath_batch_calculator_pool_count(calc), 1UL);

    ffi_price_result_t result;
    size_t processed = hotpath_batch_calculator_process(calc, &result, 1);
    ASSERT_EQ(processed, 1UL);
    ASSERT_TRUE(result.price.limbs[0] > 0);

    hotpath_batch_calculator_clear(calc);
    ASSERT_EQ(hotpath_batch_calculator_pool_count(calc), 0UL);

    hotpath_batch_calculator_destroy(calc);
}

TEST(ffi_scanner) {
    ffi_scanner_handle_t scanner = hotpath_scanner_create(nullptr);
    ASSERT_TRUE(scanner != nullptr);

    ffi_pool_reserves_t pool;
    pool.reserve0.limbs[0] = 1'000'000'000'000'000'000ULL;
    pool.reserve0.limbs[1] = 0;
    pool.reserve0.limbs[2] = 0;
    pool.reserve0.limbs[3] = 0;
    pool.reserve1.limbs[0] = 2'000'000'000'000'000'000ULL;
    pool.reserve1.limbs[1] = 0;
    pool.reserve1.limbs[2] = 0;
    pool.reserve1.limbs[3] = 0;
    pool.pool_id = 1;
    pool.dex_id = 1;

    hotpath_scanner_update_pool(scanner, &pool);
    ASSERT_EQ(hotpath_scanner_pool_count(scanner), 1UL);

    hotpath_scanner_clear(scanner);
    ASSERT_EQ(hotpath_scanner_pool_count(scanner), 0UL);

    hotpath_scanner_destroy(scanner);
}

// ============================================================================
// MAIN
// ============================================================================

int main() {
    std::cout << "===========================================\n";
    std::cout << "   MATRIX Hot Path Tests\n";
    std::cout << "===========================================\n\n";

    int passed = 0;
    int failed = 0;

    for (int i = 0; i < test_count; ++i) {
        std::cout << "Running: " << tests[i].name << "... ";
        try {
            tests[i].func();
            std::cout << "PASSED\n";
            ++passed;
        } catch (const std::exception& e) {
            std::cout << "FAILED: " << e.what() << "\n";
            ++failed;
        }
    }

    std::cout << "\n===========================================\n";
    std::cout << "Results: " << passed << " passed, " << failed << " failed\n";
    std::cout << "===========================================\n";

    return failed > 0 ? 1 : 0;
}
