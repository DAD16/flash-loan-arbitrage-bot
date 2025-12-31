#pragma once

#include <atomic>
#include <cstddef>
#include <cstdint>
#include <optional>
#include <array>

namespace matrix::orderbook {

/**
 * Lock-Free Single-Producer Single-Consumer (SPSC) Queue
 *
 * Ultra-low latency queue for passing data between threads without locks.
 * Uses cache-line padding to prevent false sharing between head/tail.
 *
 * Performance: <10ns per enqueue/dequeue operation
 *
 * Research: SPSC queues are the fastest inter-thread communication
 * mechanism. We use this for price feed → order book updates.
 */
template<typename T, size_t Capacity = 65536>
class SPSCQueue {
    static_assert((Capacity & (Capacity - 1)) == 0, "Capacity must be power of 2");
    static constexpr size_t CACHE_LINE_SIZE = 64;

public:
    SPSCQueue() : head_(0), tail_(0) {
        for (auto& slot : buffer_) {
            slot.sequence.store(0, std::memory_order_relaxed);
        }
    }

    /**
     * Push an item to the queue (producer only)
     * @return true if successful, false if queue is full
     */
    template<typename U>
    [[nodiscard]] bool push(U&& item) noexcept {
        const size_t pos = tail_.load(std::memory_order_relaxed);
        Slot& slot = buffer_[pos & (Capacity - 1)];

        const size_t seq = slot.sequence.load(std::memory_order_acquire);
        const intptr_t diff = static_cast<intptr_t>(seq) - static_cast<intptr_t>(pos);

        if (diff != 0) {
            return false;  // Queue full
        }

        slot.data = std::forward<U>(item);
        slot.sequence.store(pos + 1, std::memory_order_release);
        tail_.store(pos + 1, std::memory_order_relaxed);
        return true;
    }

    /**
     * Pop an item from the queue (consumer only)
     * @return The item if available, std::nullopt if queue is empty
     */
    [[nodiscard]] std::optional<T> pop() noexcept {
        const size_t pos = head_.load(std::memory_order_relaxed);
        Slot& slot = buffer_[pos & (Capacity - 1)];

        const size_t seq = slot.sequence.load(std::memory_order_acquire);
        const intptr_t diff = static_cast<intptr_t>(seq) - static_cast<intptr_t>(pos + 1);

        if (diff != 0) {
            return std::nullopt;  // Queue empty
        }

        T item = std::move(slot.data);
        slot.sequence.store(pos + Capacity, std::memory_order_release);
        head_.store(pos + 1, std::memory_order_relaxed);
        return item;
    }

    /**
     * Try to pop without blocking
     */
    [[nodiscard]] bool try_pop(T& item) noexcept {
        auto result = pop();
        if (result) {
            item = std::move(*result);
            return true;
        }
        return false;
    }

    /**
     * Check if queue is empty (approximate)
     */
    [[nodiscard]] bool empty() const noexcept {
        return head_.load(std::memory_order_relaxed) ==
               tail_.load(std::memory_order_relaxed);
    }

    /**
     * Get approximate size
     */
    [[nodiscard]] size_t size() const noexcept {
        const size_t h = head_.load(std::memory_order_relaxed);
        const size_t t = tail_.load(std::memory_order_relaxed);
        return t >= h ? t - h : 0;
    }

private:
    struct Slot {
        std::atomic<size_t> sequence;
        T data;
    };

    // Pad to prevent false sharing
    alignas(CACHE_LINE_SIZE) std::atomic<size_t> head_;
    char pad1_[CACHE_LINE_SIZE - sizeof(std::atomic<size_t>)];

    alignas(CACHE_LINE_SIZE) std::atomic<size_t> tail_;
    char pad2_[CACHE_LINE_SIZE - sizeof(std::atomic<size_t>)];

    std::array<Slot, Capacity> buffer_;
};

/**
 * Price Update structure for the queue
 */
struct PriceUpdate {
    uint64_t timestamp_ns;      // Nanosecond timestamp
    uint64_t pool_hash;         // Pool address hash (keccak256 truncated)
    uint32_t chain_id;          // Chain identifier (1=ETH, 42161=ARB, etc.)
    uint32_t dex_id;            // DEX identifier
    uint64_t token0;            // Token 0 address hash
    uint64_t token1;            // Token 1 address hash
    uint64_t reserve0;          // Reserve of token 0 (scaled)
    uint64_t reserve1;          // Reserve of token 1 (scaled)
    uint64_t price;             // Pre-calculated price (fixed-point)
};

// Type alias for price update queue
using PriceQueue = SPSCQueue<PriceUpdate, 65536>;

} // namespace matrix::orderbook
