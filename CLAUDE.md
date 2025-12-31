# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
# Build all components
make build

# Build individual components
cd core && cargo build --release          # Rust agents
cd hotpath && cmake -B build && cmake --build build  # C++ hot path
cd agents && npm run build                # TypeScript agents
cd contracts && forge build               # Solidity contracts
```

## Test Commands

```bash
# Test all
make test

# Test individual components
cd core && cargo test                                    # Rust
cd core && cargo test -p neo                             # Single Rust crate
cd core && cargo test -p neo -- test_neo_creation        # Single test
cd contracts && forge test -vvv                          # Solidity
cd contracts && forge test --match-test testFuzz        # Fuzz tests only
cd agents && npm test                                    # TypeScript
cd agents && npm test -- --grep "Merovingian"           # Single test file
cd analysis && pytest                                    # Python
cd analysis && pytest oracle/tests/test_aggregator.py   # Single test file
```

## Lint and Format

```bash
# Lint all
make lint

# Format all
make fmt

# Per-language
cd core && cargo clippy --all-targets --all-features -- -D warnings
cd core && cargo fmt
cd agents && npm run lint && npm run lint:fix
cd analysis && ruff check . && mypy . && black .
cd contracts && forge fmt --check && forge fmt
```

## Running Locally

```bash
docker-compose up -d                    # Start infrastructure (Postgres, Redis, Kafka)
docker-compose --profile dev up -d      # Include dev tools (Kafka UI, Redis Commander, Anvil)
docker-compose --profile agents up -d   # Include Python/TypeScript agent containers
```

## Architecture Overview

This is a multi-language flash loan arbitrage system with agents named after Matrix characters.

### Data Flow

```
Market Data → MORPHEUS (Rust) → DOZER (Rust) → ORACLE (Python) → Opportunity
                                                     ↓
Execution ← TRINITY (Rust) ← SERAPH (Rust) ← CYPHER (Rust) ← Approval
```

### Agent Responsibilities

| Agent | Language | Purpose |
|-------|----------|---------|
| NEO | Rust | Orchestrates all agents, OTP-style supervision |
| MORPHEUS | Rust | WebSocket connections to DEX price feeds |
| DOZER | Rust | Price normalization, Chronicle Queue pipeline |
| ORACLE | Python | Arbitrage detection via graph cycle finding |
| SATI | Python | ML models for opportunity success prediction |
| TRINITY | Rust | Flashbots bundle creation and submission |
| SERAPH | Rust | EVM simulation via revm before execution |
| CYPHER | Rust | Risk limits, circuit breaker, position tracking |
| MEROVINGIAN | TypeScript | Mempool monitoring for backrun opportunities |
| KEYMAKER | TypeScript | HashiCorp Vault integration for secrets |
| LINK | TypeScript | Kafka message routing between agents |

### Key Integration Points

**Rust Core** (`/core/`): All agents implement the `Agent` trait from `neo/src/lib.rs`. Shared types in `shared/types/src/lib.rs` define `ChainId`, `DexId`, `Opportunity`, `ExecutionResult`.

**Smart Contracts** (`/contracts/`): `FlashLoanReceiver.sol` handles Aave V3 flash loan callbacks. `MultiDexRouter.sol` routes swaps across DEXs. Deployment via `script/Deploy.s.sol`.

**C++ Hot Path** (`/hotpath/`): Lock-free SPSC queue in `include/orderbook/SPSCQueue.hpp`. Arena allocator in `include/memory/Arena.hpp`. SIMD-optimized arbitrage in `include/arbitrage/Calculator.hpp`.

### Cross-Language Communication

- Rust ↔ Python: Via Kafka topics (`matrix.prices`, `matrix.opportunities`, `matrix.executions`)
- Rust ↔ TypeScript: Via Kafka through LINK agent
- C++ ↔ Rust: Chronicle Queue shared memory (planned) or FFI

### Chain Configuration

Chain-specific settings in `core/shared/types/src/lib.rs` (`ChainId` enum) and `agents/shared/src/chains.ts` (`CHAIN_CONFIGS`). Each chain has different:
- Flash loan provider (Aave V3 for ETH/ARB/OP/Base, PancakeSwap for BSC)
- Block time affecting latency targets
- DEX router addresses

### Risk Management

Circuit breaker in `core/cypher/src/lib.rs` triggers on:
- Hourly loss > `max_hourly_loss` (default 5 ETH)
- Daily loss > `max_daily_loss` (default 20 ETH)
- Position size > `max_position_size` (default 50 ETH)

Manual reset required via `Cypher::reset_circuit_breaker()`.
