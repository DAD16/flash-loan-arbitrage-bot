# CLAUDE.md - C++ Hot Path

This file scopes Claude Code to the C++ ultra-low latency hot path only.

## Scope

**This instance owns:**
- `hotpath/include/` - Header files
  - `memory/Arena.hpp` - Arena allocator
  - `queue/SPSCQueue.hpp` - Lock-free SPSC queue
  - `orderbook/OrderBook.hpp` - Order book structure
  - `arbitrage/Calculator.hpp` - Arbitrage calculator
  - `network/WebSocket.hpp` - WebSocket client
  - `tx/Composer.hpp` - Transaction composer
- `hotpath/src/` - Implementation files
- `hotpath/test/` - Test files
- `hotpath/bench/` - Benchmarks
- `hotpath/CMakeLists.txt` - CMake config

## Off-Limits (DO NOT MODIFY)

- `../core/` - Rust agents (different instance)
- `../agents/` - TypeScript agents (different instance)
- `../analysis/` - Python agents (different instance)
- `../contracts/` - Solidity contracts (different instance)
- `../dashboard/` - Dashboard UI (different instance)
- `../memory.md` - Root instance only
- `../CLAUDE.md` - Root instance only
- `../.env` - Root instance only

## Current Status: SCAFFOLDED ONLY

**Headers exist but implementations are empty stubs.**

This is the highest priority implementation task for speed optimization.

### Existing Headers (need implementation)
- `Arena.hpp` - Pre-allocated memory pools
- `SPSCQueue.hpp` - Lock-free single-producer single-consumer queue
- `OrderBook.hpp` - Price level tracking
- `Calculator.hpp` - SIMD-optimized arbitrage detection
- `WebSocket.hpp` - Direct socket I/O
- `Composer.hpp` - Transaction building

## Build Commands

```bash
# Configure
cmake -B build -DCMAKE_BUILD_TYPE=Release

# Build
cmake --build build

# Run tests
cd build && ctest

# Run benchmarks
./build/bench/hotpath_bench
```

## Performance Targets

| Component | Target Latency |
|-----------|----------------|
| Price update processing | <1 microsecond |
| Arbitrage calculation | <10 microseconds |
| Order book update | <100 nanoseconds |
| Transaction composition | <50 microseconds |
| End-to-end hot path | <100 microseconds |

## Architecture Goals

```
WebSocket Feed → SPSCQueue → OrderBook → Calculator → TxComposer
     ↓              ↓           ↓           ↓            ↓
  io_uring     lock-free    SIMD ops    graph algo   RLP encode
```

### Key Design Principles
1. **Zero allocation** in hot path (Arena pre-allocation)
2. **Lock-free** data structures (SPSC queues)
3. **SIMD** for parallel price comparisons
4. **Direct I/O** with io_uring (Linux) or IOCP (Windows)
5. **Cache-friendly** memory layout

## Integration with Rust Core

The C++ hot path will integrate with Rust via:
1. **Chronicle Queue** - Shared memory ring buffer
2. **FFI** - Direct function calls for critical paths
3. **Unix sockets** - IPC for less critical data

## Implementation Priority

1. `Arena.cpp` - Memory foundation
2. `SPSCQueue.cpp` - Communication backbone
3. `OrderBook.cpp` - Price tracking
4. `Calculator.cpp` - Core arbitrage logic
5. `WebSocket.cpp` - Data ingestion
6. `Composer.cpp` - Output generation

## Status Tracking

### STATUS.md (this scope's log)
Update `hotpath/STATUS.md` as you work:
- Log actions in "Session Log" section
- Move items between In Progress / Completed / Blocked
- Add cross-scope requests when you need other instances

### state.json (global coordination)
Update your instance status in `../state.json`:
```json
"hotpath": {
  "status": "working",           // idle | working | blocked | waiting_for_input
  "current_task": "Implementing Arena allocator",
  "last_active": "2026-01-01T12:00:00Z"
}
```

### File Locking Protocol
Before modifying shared headers:
1. Check `../state.json` → `locked_files`
2. If not locked, add: `"hotpath/include/shared/types.hpp": "hotpath"`
3. Make your changes
4. Remove the lock when done

## Communication Protocol

When you need changes in other scopes:
1. Complete your work in this scope
2. Add request to "Cross-Scope Requests" in `hotpath/STATUS.md`
3. The user will relay to the appropriate instance

### Common Cross-Scope Needs
- Need Rust FFI bindings? → Coordinate with core instance
- Need price feed format? → Check with core instance (MORPHEUS)
- Need transaction format? → Check with core instance (TRINITY)
