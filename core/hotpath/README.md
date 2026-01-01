# MATRIX Hot Path - SIMD Accelerated Core

High-performance C++ module with AVX2/AVX-512 SIMD instructions for critical path calculations.

## Features

- **SIMD Price Calculation**: AVX2-accelerated price computation from pool reserves
- **Batch Processing**: Process up to 8 pools in parallel per SIMD batch
- **Opportunity Scanner**: Real-time arbitrage opportunity detection
- **U256 Math**: 256-bit unsigned integer operations for DeFi calculations
- **FFI Bindings**: C-compatible interface for Rust integration

## Performance Targets

| Operation | Target Latency |
|-----------|---------------|
| Single price calculation | < 50ns |
| Batch price (8 pools) | < 200ns |
| Swap output calculation | < 100ns |
| Opportunity scan (100 pools) | < 50μs |

## Building

### Prerequisites

- CMake 3.16+
- C++20 compatible compiler (MSVC 2019+, GCC 10+, or Clang 11+)
- CPU with AVX2 support (most processors since 2013)

### Windows (Visual Studio)

```powershell
# Open Developer Command Prompt for VS 2019/2022
cd core\hotpath
mkdir build && cd build
cmake .. -G "Visual Studio 17 2022" -A x64
cmake --build . --config Release
```

### Windows (Ninja + MSVC)

```powershell
# From Developer PowerShell for VS
cd core\hotpath
mkdir build && cd build
cmake .. -G Ninja -DCMAKE_BUILD_TYPE=Release
ninja
```

### Linux/macOS

```bash
cd core/hotpath
mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j$(nproc)
```

## Running Tests

```bash
cd build
ctest -V
# Or run directly:
./hotpath_tests
```

## Running Benchmarks

```bash
cd build
./hotpath_bench
```

## Architecture

```
hotpath/
├── include/              # Header files
│   ├── types.hpp         # Core SIMD-aligned types
│   ├── simd_math.hpp     # SIMD math operations
│   ├── price_calculator.hpp
│   └── opportunity_scanner.hpp
├── src/                  # Implementation
│   ├── simd_math.cpp
│   ├── price_calculator.cpp
│   └── opportunity_scanner.cpp
├── bindings/             # FFI for Rust
│   ├── ffi.hpp
│   └── ffi.cpp
├── benchmark/            # Performance benchmarks
│   └── bench_main.cpp
└── tests/                # Unit tests
    └── test_main.cpp
```

## FFI Usage from Rust

Add to your Cargo.toml:

```toml
[build-dependencies]
cc = "1.0"

[dependencies]
# ... your deps
```

In build.rs:

```rust
fn main() {
    // Link to the hotpath library
    println!("cargo:rustc-link-search=native=../hotpath/build");
    println!("cargo:rustc-link-lib=static=matrix_hotpath_static");

    // Or for dynamic linking:
    // println!("cargo:rustc-link-lib=dylib=matrix_hotpath");
}
```

## SIMD Requirements

The library requires AVX2 support. At runtime, you can check:

```cpp
#include "bindings/ffi.hpp"

if (hotpath_has_avx2()) {
    // Full SIMD support
} else {
    // Fallback to scalar operations
}
```

## License

Part of the MATRIX Flash Loan Arbitrage Bot project.
