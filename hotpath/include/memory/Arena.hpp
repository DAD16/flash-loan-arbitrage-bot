#pragma once

#include <cstddef>
#include <cstdint>
#include <memory>
#include <atomic>
#include <cassert>

namespace matrix::memory {

/**
 * Arena Allocator - Zero-allocation memory management for hot path
 *
 * Pre-allocates a large memory block at startup and hands out chunks
 * without any system calls. Critical for microsecond-level latency.
 *
 * Research: Arena allocators eliminate malloc/free overhead which can
 * add 100-1000ns per allocation. For HFT, we need <10us total latency.
 */
class Arena {
public:
    static constexpr size_t DEFAULT_SIZE = 64 * 1024 * 1024;  // 64 MB
    static constexpr size_t CACHE_LINE_SIZE = 64;

    explicit Arena(size_t size = DEFAULT_SIZE);
    ~Arena();

    // Non-copyable, non-movable (owns raw memory)
    Arena(const Arena&) = delete;
    Arena& operator=(const Arena&) = delete;
    Arena(Arena&&) = delete;
    Arena& operator=(Arena&&) = delete;

    /**
     * Allocate memory from the arena (thread-safe via atomic)
     * @param size Bytes to allocate
     * @param alignment Alignment requirement (default: cache line)
     * @return Pointer to allocated memory, nullptr if arena exhausted
     */
    [[nodiscard]] void* allocate(size_t size, size_t alignment = CACHE_LINE_SIZE) noexcept;

    /**
     * Typed allocation helper
     */
    template<typename T, typename... Args>
    [[nodiscard]] T* create(Args&&... args) {
        void* ptr = allocate(sizeof(T), alignof(T));
        if (!ptr) return nullptr;
        return new(ptr) T(std::forward<Args>(args)...);
    }

    /**
     * Reset the arena (invalidates all allocations)
     * Call only when safe to do so (e.g., between trading cycles)
     */
    void reset() noexcept;

    /**
     * Get current usage statistics
     */
    [[nodiscard]] size_t used() const noexcept { return offset_.load(std::memory_order_relaxed); }
    [[nodiscard]] size_t capacity() const noexcept { return size_; }
    [[nodiscard]] size_t remaining() const noexcept { return size_ - used(); }

private:
    uint8_t* memory_;
    size_t size_;
    std::atomic<size_t> offset_{0};

    [[nodiscard]] static size_t align_up(size_t n, size_t alignment) noexcept {
        return (n + alignment - 1) & ~(alignment - 1);
    }
};

/**
 * Object Pool - Pre-allocated fixed-size object storage
 *
 * For frequently created/destroyed objects (orders, price updates),
 * maintains a free list to avoid any allocation overhead.
 */
template<typename T, size_t Capacity = 65536>
class ObjectPool {
public:
    ObjectPool() {
        // Pre-allocate all objects
        storage_ = std::make_unique<Storage[]>(Capacity);

        // Build free list
        for (size_t i = 0; i < Capacity - 1; ++i) {
            storage_[i].next = &storage_[i + 1];
        }
        storage_[Capacity - 1].next = nullptr;
        free_list_ = &storage_[0];
    }

    /**
     * Acquire an object from the pool
     */
    template<typename... Args>
    [[nodiscard]] T* acquire(Args&&... args) noexcept {
        if (!free_list_) return nullptr;

        Storage* slot = free_list_;
        free_list_ = slot->next;

        return new(&slot->data) T(std::forward<Args>(args)...);
    }

    /**
     * Release an object back to the pool
     */
    void release(T* obj) noexcept {
        if (!obj) return;

        obj->~T();

        Storage* slot = reinterpret_cast<Storage*>(obj);
        slot->next = free_list_;
        free_list_ = slot;
    }

    [[nodiscard]] size_t available() const noexcept {
        size_t count = 0;
        for (Storage* p = free_list_; p; p = p->next) ++count;
        return count;
    }

private:
    union Storage {
        alignas(T) uint8_t data[sizeof(T)];
        Storage* next;
    };

    std::unique_ptr<Storage[]> storage_;
    Storage* free_list_ = nullptr;
};

} // namespace matrix::memory
