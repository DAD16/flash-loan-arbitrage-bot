#include "memory/Arena.hpp"
#include <cstdlib>
#include <cstring>

namespace matrix::memory {

Arena::Arena(size_t size) : size_(size) {
    // Allocate aligned memory
    memory_ = static_cast<uint8_t*>(std::aligned_alloc(CACHE_LINE_SIZE, size));
    if (!memory_) {
        throw std::bad_alloc();
    }
    // Zero-initialize
    std::memset(memory_, 0, size);
}

Arena::~Arena() {
    std::free(memory_);
}

void* Arena::allocate(size_t size, size_t alignment) noexcept {
    size_t current = offset_.load(std::memory_order_relaxed);

    while (true) {
        size_t aligned = align_up(current, alignment);
        size_t new_offset = aligned + size;

        if (new_offset > size_) {
            return nullptr;  // Arena exhausted
        }

        if (offset_.compare_exchange_weak(
                current, new_offset,
                std::memory_order_release,
                std::memory_order_relaxed)) {
            return memory_ + aligned;
        }
        // CAS failed, retry with updated current
    }
}

void Arena::reset() noexcept {
    offset_.store(0, std::memory_order_release);
}

} // namespace matrix::memory
