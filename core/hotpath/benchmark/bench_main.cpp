/**
 * @file bench_main.cpp
 * @brief Benchmarks for SIMD hot path operations
 */

#include "types.hpp"
#include "price_calculator.hpp"
#include "opportunity_scanner.hpp"
#include "simd_math.hpp"
#include <chrono>
#include <iostream>
#include <random>
#include <vector>
#include <iomanip>

using namespace matrix::hotpath;

// ============================================================================
// BENCHMARK UTILITIES
// ============================================================================

class Timer {
public:
    void start() {
        start_ = std::chrono::high_resolution_clock::now();
    }

    double elapsed_us() const {
        auto end = std::chrono::high_resolution_clock::now();
        return std::chrono::duration<double, std::micro>(end - start_).count();
    }

    double elapsed_ns() const {
        auto end = std::chrono::high_resolution_clock::now();
        return std::chrono::duration<double, std::nano>(end - start_).count();
    }

private:
    std::chrono::high_resolution_clock::time_point start_;
};

// Generate random pool reserves
PoolReserves generate_random_pool(std::mt19937_64& rng, uint32_t pool_id, uint32_t dex_id) {
    std::uniform_int_distribution<uint64_t> dist(1'000'000'000'000ULL, 1'000'000'000'000'000'000ULL);

    PoolReserves pool;
    pool.reserve0.limbs[0] = dist(rng);
    pool.reserve1.limbs[0] = dist(rng);
    pool.timestamp_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()
    ).count();
    pool.pool_id = pool_id;
    pool.dex_id = dex_id;
    pool.decimals0 = 18;
    pool.decimals1 = 18;
    return pool;
}

// ============================================================================
// BENCHMARKS
// ============================================================================

void bench_single_price_calculation() {
    std::cout << "\n=== Single Price Calculation ===\n";

    std::mt19937_64 rng(42);
    PoolReserves pool = generate_random_pool(rng, 1, 1);

    const int iterations = 1'000'000;
    Timer timer;

    timer.start();
    for (int i = 0; i < iterations; ++i) {
        volatile auto result = calculate_price(pool);
        (void)result;
    }
    double elapsed = timer.elapsed_us();

    std::cout << std::fixed << std::setprecision(2);
    std::cout << "  Iterations: " << iterations << "\n";
    std::cout << "  Total time: " << elapsed << " us\n";
    std::cout << "  Per operation: " << (elapsed * 1000.0 / iterations) << " ns\n";
    std::cout << "  Operations/sec: " << (iterations * 1'000'000.0 / elapsed) << "\n";
}

void bench_batch_price_calculation() {
    std::cout << "\n=== Batch Price Calculation (SIMD) ===\n";

    std::mt19937_64 rng(42);

    const size_t batch_size = 8;
    PoolBatch batch;
    batch.count = batch_size;
    for (size_t i = 0; i < batch_size; ++i) {
        batch.pools[i] = generate_random_pool(rng, static_cast<uint32_t>(i), 1);
    }

    PriceResult results[SIMD_BATCH_SIZE];
    const int iterations = 100'000;
    Timer timer;

    timer.start();
    for (int i = 0; i < iterations; ++i) {
        calculate_prices_batch(batch, results);
    }
    double elapsed = timer.elapsed_us();

    std::cout << std::fixed << std::setprecision(2);
    std::cout << "  Batch size: " << batch_size << "\n";
    std::cout << "  Iterations: " << iterations << "\n";
    std::cout << "  Total time: " << elapsed << " us\n";
    std::cout << "  Per batch: " << (elapsed * 1000.0 / iterations) << " ns\n";
    std::cout << "  Per pool: " << (elapsed * 1000.0 / (iterations * batch_size)) << " ns\n";
    std::cout << "  Pools/sec: " << (iterations * batch_size * 1'000'000.0 / elapsed) << "\n";
}

void bench_swap_output_calculation() {
    std::cout << "\n=== Swap Output Calculation ===\n";

    U256 reserve_in(1'000'000'000'000'000'000ULL);  // 1e18
    U256 reserve_out(2'000'000'000'000'000'000ULL); // 2e18
    U256 amount_in(1'000'000'000'000'000ULL);       // 0.001e18

    const int iterations = 1'000'000;
    Timer timer;

    timer.start();
    for (int i = 0; i < iterations; ++i) {
        volatile auto result = calculate_swap_output(reserve_in, reserve_out, amount_in);
        (void)result;
    }
    double elapsed = timer.elapsed_us();

    std::cout << std::fixed << std::setprecision(2);
    std::cout << "  Iterations: " << iterations << "\n";
    std::cout << "  Total time: " << elapsed << " us\n";
    std::cout << "  Per operation: " << (elapsed * 1000.0 / iterations) << " ns\n";
    std::cout << "  Operations/sec: " << (iterations * 1'000'000.0 / elapsed) << "\n";
}

void bench_opportunity_scanning() {
    std::cout << "\n=== Opportunity Scanning ===\n";

    std::mt19937_64 rng(42);

    // Create scanner with many pools
    OpportunityScanner scanner;

    const size_t pool_count = 100;
    for (size_t i = 0; i < pool_count; ++i) {
        auto pool = generate_random_pool(rng, static_cast<uint32_t>(i), static_cast<uint32_t>(i % 4));
        scanner.update_pool(pool);
    }

    std::vector<ArbitrageOpportunity> opportunities;
    const int iterations = 10'000;
    Timer timer;

    timer.start();
    for (int i = 0; i < iterations; ++i) {
        opportunities.clear();
        scanner.scan(opportunities);
    }
    double elapsed = timer.elapsed_us();

    std::cout << std::fixed << std::setprecision(2);
    std::cout << "  Pool count: " << pool_count << "\n";
    std::cout << "  Iterations: " << iterations << "\n";
    std::cout << "  Total time: " << elapsed << " us\n";
    std::cout << "  Per scan: " << (elapsed / iterations) << " us\n";
    std::cout << "  Scans/sec: " << (iterations * 1'000'000.0 / elapsed) << "\n";
    std::cout << "  Opportunities found (last scan): " << opportunities.size() << "\n";
}

void bench_simd_operations() {
    std::cout << "\n=== Raw SIMD Operations ===\n";

    alignas(32) uint64_t a[4] = {1000, 2000, 3000, 4000};
    alignas(32) uint64_t b[4] = {100, 200, 300, 400};
    alignas(32) uint64_t c[4];

    const int iterations = 10'000'000;
    Timer timer;

    // Test u64x4 operations
    timer.start();
    for (int i = 0; i < iterations; ++i) {
        u64x4 va = simd::load_aligned(a);
        u64x4 vb = simd::load_aligned(b);
        u64x4 vc = simd::add_u64x4(va, vb);
        simd::store_aligned(c, vc);
    }
    double elapsed_add = timer.elapsed_ns();

    // Test f64x4 multiply
    alignas(32) double da[4] = {1.0, 2.0, 3.0, 4.0};
    alignas(32) double db[4] = {1.5, 2.5, 3.5, 4.5};
    alignas(32) double dc[4];

    timer.start();
    for (int i = 0; i < iterations; ++i) {
        f64x4 va = simd::load_f64x4(da);
        f64x4 vb = simd::load_f64x4(db);
        f64x4 vc = simd::mul_f64x4(va, vb);
        simd::store_f64x4(dc, vc);
    }
    double elapsed_mul = timer.elapsed_ns();

    // Test f64x4 divide
    timer.start();
    for (int i = 0; i < iterations; ++i) {
        f64x4 va = simd::load_f64x4(da);
        f64x4 vb = simd::load_f64x4(db);
        f64x4 vc = simd::div_f64x4(va, vb);
        simd::store_f64x4(dc, vc);
    }
    double elapsed_div = timer.elapsed_ns();

    std::cout << std::fixed << std::setprecision(2);
    std::cout << "  Iterations: " << iterations << "\n";
    std::cout << "  u64x4 add: " << (elapsed_add / iterations) << " ns/op\n";
    std::cout << "  f64x4 mul: " << (elapsed_mul / iterations) << " ns/op\n";
    std::cout << "  f64x4 div: " << (elapsed_div / iterations) << " ns/op\n";
}

void bench_u256_operations() {
    std::cout << "\n=== U256 Operations ===\n";

    U256 a(0xFFFFFFFFFFFFFFFFULL, 0xFFFFFFFFFFFFFFFFULL, 0, 0);
    U256 b(1000, 0, 0, 0);

    const int iterations = 1'000'000;
    Timer timer;

    // Add
    timer.start();
    for (int i = 0; i < iterations; ++i) {
        volatile auto result = simd::add_u256(a, b);
        (void)result;
    }
    double elapsed_add = timer.elapsed_ns();

    // Multiply by u64
    timer.start();
    for (int i = 0; i < iterations; ++i) {
        volatile auto result = simd::mul_u256_u64(a, 997);
        (void)result;
    }
    double elapsed_mul = timer.elapsed_ns();

    // Divide by u64
    timer.start();
    for (int i = 0; i < iterations; ++i) {
        volatile auto result = simd::div_u256_u64(a, 1000);
        (void)result;
    }
    double elapsed_div = timer.elapsed_ns();

    std::cout << std::fixed << std::setprecision(2);
    std::cout << "  Iterations: " << iterations << "\n";
    std::cout << "  U256 add: " << (elapsed_add / iterations) << " ns/op\n";
    std::cout << "  U256 mul_u64: " << (elapsed_mul / iterations) << " ns/op\n";
    std::cout << "  U256 div_u64: " << (elapsed_div / iterations) << " ns/op\n";
}

// ============================================================================
// MAIN
// ============================================================================

int main() {
    std::cout << "===========================================\n";
    std::cout << "   MATRIX Hot Path Benchmarks\n";
    std::cout << "===========================================\n";

    std::cout << "\nCPU Features:\n";
    std::cout << "  AVX2: " << (hotpath_has_avx2() ? "YES" : "NO") << "\n";
    std::cout << "  AVX-512: " << (hotpath_has_avx512() ? "YES" : "NO") << "\n";

    bench_simd_operations();
    bench_u256_operations();
    bench_single_price_calculation();
    bench_batch_price_calculation();
    bench_swap_output_calculation();
    bench_opportunity_scanning();

    std::cout << "\n===========================================\n";
    std::cout << "   Benchmarks Complete\n";
    std::cout << "===========================================\n";

    return 0;
}
