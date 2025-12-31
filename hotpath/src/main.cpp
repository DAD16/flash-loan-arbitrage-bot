/**
 * Flash Loan Arbitrage Bot - Hot Path Entry Point
 *
 * This is the ultra-low latency execution core written in C++.
 * It handles price feed ingestion, arbitrage calculation, and
 * transaction composition with microsecond-level latency.
 *
 * Agent: Matrix Hot Path Core
 * Target latency: <100us per cycle
 */

#include <iostream>
#include <chrono>
#include <thread>
#include <csignal>
#include <atomic>

#include "memory/Arena.hpp"
#include "orderbook/OrderBook.hpp"
#include "orderbook/SPSCQueue.hpp"
#include "arbitrage/Calculator.hpp"

using namespace matrix;

// Global shutdown flag
std::atomic<bool> g_shutdown{false};

void signal_handler(int signal) {
    std::cout << "\nReceived signal " << signal << ", shutting down...\n";
    g_shutdown.store(true, std::memory_order_release);
}

int main(int argc, char* argv[]) {
    std::cout << "==============================================\n";
    std::cout << "  FLASH LOAN ARBITRAGE BOT - HOT PATH CORE\n";
    std::cout << "  Codename: THE MATRIX\n";
    std::cout << "==============================================\n\n";

    // Set up signal handlers
    std::signal(SIGINT, signal_handler);
    std::signal(SIGTERM, signal_handler);

    // Initialize memory arena (64 MB pre-allocated)
    memory::Arena arena(64 * 1024 * 1024);
    std::cout << "[MEMORY] Arena initialized: " << arena.capacity() / (1024 * 1024) << " MB\n";

    // Initialize price queue
    orderbook::PriceQueue price_queue;
    std::cout << "[QUEUE] Price queue initialized\n";

    // Initialize order book
    orderbook::OrderBook orderbook(arena);
    std::cout << "[ORDERBOOK] Order book initialized\n";

    // Initialize arbitrage calculator
    arbitrage::Calculator calculator(orderbook);
    std::cout << "[CALCULATOR] Arbitrage calculator initialized\n";

    std::cout << "\n[STATUS] Hot path core ready. Waiting for price feeds...\n\n";

    // Main loop
    uint64_t cycle_count = 0;
    auto last_stats = std::chrono::steady_clock::now();

    while (!g_shutdown.load(std::memory_order_acquire)) {
        auto cycle_start = std::chrono::high_resolution_clock::now();

        // Process price updates
        size_t updates = orderbook.process_updates(price_queue);

        // Scan for opportunities if we have updates
        if (updates > 0) {
            auto opportunities = calculator.scan();

            // Log profitable opportunities
            for (const auto& opp : opportunities) {
                if (opp.is_profitable(50)) {  // 50 gwei gas price
                    std::cout << "[OPPORTUNITY] Chain=" << static_cast<int>(opp.chain)
                              << " Profit=" << opp.profit_wei / 1'000'000'000'000'000ULL << " finney"
                              << " Path=" << static_cast<int>(opp.path_length) << " hops\n";
                }
            }
        }

        auto cycle_end = std::chrono::high_resolution_clock::now();
        auto cycle_duration = std::chrono::duration_cast<std::chrono::microseconds>(
            cycle_end - cycle_start
        ).count();

        cycle_count++;

        // Print stats every 10 seconds
        auto now = std::chrono::steady_clock::now();
        if (std::chrono::duration_cast<std::chrono::seconds>(now - last_stats).count() >= 10) {
            std::cout << "[STATS] Cycles=" << cycle_count
                      << " Pools=" << orderbook.pool_count()
                      << " LastCycle=" << cycle_duration << "us"
                      << " Arena=" << arena.used() / 1024 << "KB\n";
            last_stats = now;
        }

        // Small sleep to prevent busy-waiting when no data
        if (updates == 0) {
            std::this_thread::sleep_for(std::chrono::microseconds(100));
        }
    }

    std::cout << "\n[SHUTDOWN] Hot path core stopped. Total cycles: " << cycle_count << "\n";
    return 0;
}
