# CLAUDE.md - Root Orchestrator

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Multi-Instance Mode

This project supports running multiple Claude Code instances in parallel. Each component has its own CLAUDE.md:

| Directory | Scope | CLAUDE.md |
|-----------|-------|-----------|
| `core/` | Rust agents | `core/CLAUDE.md` |
| `agents/` | TypeScript agents | `agents/CLAUDE.md` |
| `analysis/` | Python agents | `analysis/CLAUDE.md` |
| `contracts/` | Solidity contracts | `contracts/CLAUDE.md` |
| `dashboard/` | Dashboard UI | `dashboard/CLAUDE.md` |
| `hotpath/` | C++ hot path | `hotpath/CLAUDE.md` |

### Running Parallel Instances

```powershell
# Terminal 1 - Root orchestrator
cd "C:\Claude Projects\Flash Loan Arbitrage Bot"

# Terminal 2 - Rust agents
cd "C:\Claude Projects\Flash Loan Arbitrage Bot\core"

# Terminal 3 - TypeScript agents
cd "C:\Claude Projects\Flash Loan Arbitrage Bot\agents"

# Terminal 4 - Python agents
cd "C:\Claude Projects\Flash Loan Arbitrage Bot\analysis"

# Terminal 5 - Dashboard
cd "C:\Claude Projects\Flash Loan Arbitrage Bot\dashboard"
```

### Root Instance Responsibilities

This (root) instance is the ONLY one that can modify:
- `memory.md` - Session notes and status
- `CLAUDE.md` - This file
- `.env` - Environment configuration
- `Makefile` - Build orchestration
- `docker-compose.yml` - Infrastructure
- `README.md` - Project documentation
- `.github/` - CI/CD workflows

### Cross-Scope Coordination

When sub-instances need cross-scope changes:
1. Sub-instance adds request to their `STATUS.md` under "Cross-Scope Requests"
2. User relays to root or appropriate instance
3. Root instance coordinates shared resource updates

### Global State Management

**state.json** - Central coordination file:
- `instances` - Status of each running instance
- `locked_files` - Currently locked files (to prevent conflicts)
- `shared_decisions` - Major decisions affecting multiple scopes
- `pending_cross_scope_requests` - Requests waiting for action

**Root instance responsibilities:**
1. Periodically check all `*/STATUS.md` files
2. Consolidate updates into `memory.md`
3. Process `pending_cross_scope_requests` in state.json
4. Arbitrate file locking conflicts

### STATUS.md Files

Each scope has its own status file:
```
core/STATUS.md       ← Rust instance logs here
agents/STATUS.md     ← TypeScript instance logs here
analysis/STATUS.md   ← Python instance logs here
contracts/STATUS.md  ← Solidity instance logs here
dashboard/STATUS.md  ← Dashboard instance logs here
hotpath/STATUS.md    ← C++ instance logs here
```

## CRITICAL RULE

After completing ANY task, update `memory.md` with:
- What was just completed
- Current status
- Next steps

**Do this BEFORE responding to the user.**

## Context Management

Every 10-15 messages, remind the user to run `/compact`.
If context is getting long, proactively suggest compacting.

## Current Project Status (December 2024)

### What's Working

| Component | Status | Tests | Notes |
|-----------|--------|-------|-------|
| **Rust Core** | Working | 18 passing | All 6 agents functional |
| **Solidity Contracts** | Deployed | 7 passing | Sepolia, verified on Etherscan |
| **TypeScript Agents** | Working | Build passing | Mempool monitoring enhanced |
| **Python Analysis** | Working | 82 passing (87% cov) | All 4 agents functional |
| **C++ Hot Path** | Scaffolded | N/A | Headers only, needs implementation |
| **CI/CD** | Configured | N/A | GitHub Actions ready |
| **Docker Compose** | Ready | N/A | Full stack defined |
| **Monitoring** | Configured | N/A | Prometheus/Grafana dashboards |

### Deployed Contracts (Sepolia Testnet)

```
FlashLoanReceiver: 0x5c5b7CC9518206E91071F9C1B04Ebe32Ec31d5c7
MultiDexRouter:    0x78700C3B41D73167125Ee52DCB6346Bba97Eb7Ac
Owner:             0xADD694d04A52DfB212e965F1A3A61F30d2F7B694
Aave Pool:         0x012bAC54348C0E635dCAc9D5FB99f06F24136C9A

Configuration:
- MultiDexRouter is whitelisted in FlashLoanReceiver
- Owner is authorized executor
- minProfitBps: 10 (0.1%)
```

Etherscan Links:
- [FlashLoanReceiver](https://sepolia.etherscan.io/address/0x5c5b7CC9518206E91071F9C1B04Ebe32Ec31d5c7#code)
- [MultiDexRouter](https://sepolia.etherscan.io/address/0x78700C3B41D73167125Ee52DCB6346Bba97Eb7Ac#code)

### What Needs Work

1. **C++ Hot Path** - Only headers scaffolded, needs full implementation
2. **Docker Testing** - Docker not installed on dev machine
3. **Flash Loan Testing** - Need AAVE testnet tokens to test execution
4. **Additional Chains** - Only Sepolia deployed, need Arbitrum Sepolia, etc.
5. **Production Hardening** - Audits, mainnet deployment

## Build Commands

```bash
# Build all components
make build

# Build individual components
cd core && cargo build --release          # Rust agents
cd hotpath && cmake -B build && cmake --build build  # C++ hot path
cd agents && pnpm run build               # TypeScript agents
cd contracts && forge build               # Solidity contracts
```

## Test Commands

```bash
# Test all
make test

# Rust (18 tests)
cd core && cargo test
cd core && cargo test -p neo                             # Single crate
cd core && cargo test -p neo -- test_neo_creation        # Single test

# Solidity (7 tests)
cd contracts && forge test -vvv
cd contracts && forge test --match-test testFuzz        # Fuzz tests only
cd contracts && ETH_RPC_URL="..." forge test            # With mainnet fork

# TypeScript
cd agents && pnpm run build
cd agents && pnpm test

# Python (82 tests, 87% coverage)
cd analysis && python -m pytest -v
cd analysis && python -m pytest -v --cov                # With coverage
cd analysis && python -m pytest oracle/tests/           # Single module
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
cd agents && pnpm run lint && pnpm run lint:fix
cd analysis && ruff check . && mypy . && black .
cd contracts && forge fmt --check && forge fmt
```

## Deploy Commands

```bash
# Deploy to Sepolia (already done)
cd contracts
PRIVATE_KEY="0x..." forge script script/Deploy.s.sol:DeployScript \
    --rpc-url "https://eth-sepolia.g.alchemy.com/v2/KEY" \
    --broadcast

# Verify on Etherscan
forge verify-contract 0x5c5b7CC9518206E91071F9C1B04Ebe32Ec31d5c7 \
    src/FlashLoanReceiver.sol:FlashLoanReceiver \
    --chain sepolia \
    --etherscan-api-key "KEY"

# Read contract state
cast call 0x5c5b7CC9518206E91071F9C1B04Ebe32Ec31d5c7 "owner()(address)" \
    --rpc-url "https://eth-sepolia.g.alchemy.com/v2/KEY"
```

## Running Locally

```bash
# Without Docker (current setup)
cd core && cargo run --bin neo      # Run Rust orchestrator
cd agents && pnpm start             # Run TypeScript agents
cd analysis && python -m oracle     # Run Python analysis

# With Docker (requires Docker Desktop)
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

### Key Files

**Rust Core** (`/core/`):
- `neo/src/lib.rs` - Agent trait, orchestration
- `trinity/src/flashbots.rs` - Flashbots bundle creation
- `shared/types/src/lib.rs` - ChainId, DexId, Opportunity types

**Smart Contracts** (`/contracts/`):
- `src/FlashLoanReceiver.sol` - Aave V3 flash loan handler
- `src/MultiDexRouter.sol` - DEX routing logic
- `script/Deploy.s.sol` - Deployment script

**TypeScript Agents** (`/agents/`):
- `merovingian/src/monitor.ts` - Mempool monitoring with RPC
- `keymaker/src/vault.ts` - HashiCorp Vault integration
- `link/src/router.ts` - Kafka message routing

**Python Analysis** (`/analysis/`):
- `oracle/src/aggregator.py` - Price aggregation
- `oracle/src/detector.py` - Arbitrage detection
- `sati/src/models/` - ML models

**Configuration**:
- `deployments/sepolia.json` - Deployed contract addresses
- `config/chains/*.yaml` - Per-chain configuration
- `.github/workflows/` - CI/CD pipelines

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

## Agent System (21 Agents)

The system consists of 21 specialized agents, each with persistent memory. Full documentation in `docs/agents/AGENTS.md`.

### Agent Roster

```
TIER 1: Command & Control
└── NEO ─────────────────── Master Orchestrator (Rust)

TIER 2: Data Ingestion
├── MORPHEUS ────────────── Market Data (Rust)
├── DOZER ───────────────── Data Pipeline (Rust)
└── MEROVINGIAN ─────────── Mempool Monitor (TypeScript)

TIER 3: Analysis & Intelligence
├── ORACLE ──────────────── Price Prediction (Python)
├── SATI ────────────────── ML Models (Python)
├── PERSEPHONE ──────────── Sentiment (Python)
└── RAMA-KANDRA ─────────── Fundamentals (Python)

TIER 4: Execution
├── TRINITY ─────────────── Execution + Flashbots (Rust)
├── SERAPH ──────────────── Validation (Rust)
└── KEYMAKER ────────────── Secrets (TypeScript)

TIER 5: Risk & Security
├── CYPHER ──────────────── Risk Manager (Rust)
├── LOCK ────────────────── Contract Security (TypeScript) [NEW]
└── ROLAND ──────────────── Security Auditor (TypeScript) [NEW]

TIER 6: Quality Assurance
├── AGENT SMITH ─────────── Test Generator (Python)
├── NIOBE ───────────────── Test Coordinator (Python)
└── GHOST ───────────────── Bug Hunter (Python)

TIER 7: Operations
├── TANK ────────────────── System Monitor (Config)
└── LINK ────────────────── Communication Hub (TypeScript)

TIER 8: User Interface
└── MOUSE ───────────────── UI/UX Research (TypeScript) [NEW]

TIER 9: Infrastructure
└── THE ARCHITECT ───────── Node Infrastructure (TypeScript) [NEW]
```

### Invoking Agents

To use an agent, reference it by name:
- "Ask MOUSE to research dashboard designs based on EigenPhi.io"
- "Have LOCK analyze the smart contract for vulnerabilities"
- "Request ROLAND to perform a security audit"
- "Ask THE ARCHITECT to optimize BSC node infrastructure"

### Agent Memory

Each agent has persistent memory in `agents/memory/<agent>.json`:
- **context**: Current focus, recent analyses, suggestions
- **knowledge**: Domain-specific information
- **history**: Past actions and results

Key memory files:
- `agents/memory/mouse.json` - UI research, EigenPhi inspiration
- `agents/memory/lock.json` - Security findings, attack vectors
- `agents/memory/roland.json` - Audit results, findings summary
- `agents/memory/architect.json` - BSC infrastructure, DEX registry, latency optimization

### New Agents (December 2024)

**MOUSE** - UI/UX Research Agent
- Primary inspiration: EigenPhi.io
- Researches token icons, dashboard designs
- Location: `agents/research/mouse/`

**LOCK** - Smart Contract Security Agent
- Analyzes attack vectors (reentrancy, flash loans, oracle manipulation)
- Suggests obfuscation and security patterns
- Location: `agents/security/lock/`

**ROLAND** - Security Audit Agent
- Comprehensive security audits
- Generates audit reports
- Location: `agents/security/roland/`

**THE ARCHITECT** - Node Infrastructure Agent
- BSC blockchain focus (primary chain)
- DEX registry with router addresses
- RPC endpoint latency optimization
- bloXroute BDN integration for MEV
- Cost analysis ($400-$3,500/month tiers)
- Works with MOUSE for competitor visualization
- Location: `agents/infrastructure/architect/`

## Resuming Development

If starting a new session, here's what's already done:

1. **All code is written and compiling**
2. **Tests are passing** (Rust: 18, Solidity: 7, Python: 82)
3. **Contracts deployed to Sepolia** and verified
4. **CI/CD configured** with GitHub Actions
5. **Docker Compose ready** but Docker not installed
6. **21 agents defined** with persistent memory

Next steps to continue:
1. Install Docker Desktop to test full stack
2. Get AAVE Sepolia testnet tokens to test flash loans
3. Deploy to Arbitrum Sepolia for multi-chain testing
4. Implement C++ hot path for ultra-low latency
5. Build dashboard UI (ask MOUSE for guidance)
6. Implement security recommendations (ask LOCK/ROLAND)
7. Production hardening and mainnet deployment
