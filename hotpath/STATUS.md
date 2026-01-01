# Hot Path (C++) Status

> **Instance**: hotpath
> **Scope**: C++ ultra-low latency components
> **Last Updated**: Not yet active

## Current Status

```
Status: idle
Current Task: None
Blocked: No
```

## Session Log

<!-- Add entries as you work -->
<!-- Format: [YYYY-MM-DD HH:MM] Action taken -->

## In Progress

- None

## Completed This Session

- None

## Blocked / Waiting

- None

## Cross-Scope Requests

<!-- Requests for other instances to handle -->
<!-- Format: [TO: instance] Description of what's needed -->

## Notes

### CRITICAL: This Component is Scaffolded Only

**Current State**: Headers exist, implementations are empty stubs.

### Implementation Priority
1. [ ] `Arena.cpp` - Memory foundation
2. [ ] `SPSCQueue.cpp` - Communication backbone
3. [ ] `OrderBook.cpp` - Price tracking
4. [ ] `Calculator.cpp` - Core arbitrage logic
5. [ ] `WebSocket.cpp` - Data ingestion
6. [ ] `Composer.cpp` - Output generation

### Performance Targets
| Component | Target |
|-----------|--------|
| Price update | <1 μs |
| Arbitrage calc | <10 μs |
| Order book update | <100 ns |
| TX composition | <50 μs |
| End-to-end | <100 μs |

---

## Quick Reference

### My Files (can modify)
- `hotpath/**/*`
- `hotpath/STATUS.md` (this file)

### Read Only
- `../state.json` (read, update my instance status only)
- `../memory.md` (read only)
- Other scope directories

### Commands
```bash
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build
cd build && ctest
./build/bench/hotpath_bench
```
