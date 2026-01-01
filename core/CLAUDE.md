# CLAUDE.md - Rust Core Agents

This file scopes Claude Code to the Rust core agents only.

## Scope

**This instance owns:**
- `core/neo/` - Master orchestrator
- `core/morpheus/` - Market data feeds
- `core/dozer/` - Data pipeline
- `core/trinity/` - Execution + Flashbots
- `core/seraph/` - Validation/simulation
- `core/cypher/` - Risk management
- `core/shared/` - Shared types (OWNER - coordinate with others)
- `core/Cargo.toml` - Workspace config
- `core/Cargo.lock` - Dependencies

## Off-Limits (DO NOT MODIFY)

- `../agents/` - TypeScript agents (different instance)
- `../analysis/` - Python agents (different instance)
- `../contracts/` - Solidity contracts (different instance)
- `../dashboard/` - Dashboard UI (different instance)
- `../hotpath/` - C++ hot path (different instance)
- `../memory.md` - Root instance only
- `../CLAUDE.md` - Root instance only
- `../.env` - Root instance only

## Shared Resources

### `core/shared/types/`
This instance OWNS the shared types. If you add/modify types that other languages need:
1. Document the change clearly in commit message
2. Note in `../memory.md` under "Cross-Language Type Changes" (ask root instance)

### Kafka Topics
Rust agents use these topics - coordinate schema changes:
- `matrix.prices` - Price data from MORPHEUS
- `matrix.opportunities` - Opportunities from ORACLE
- `matrix.executions` - Execution results from TRINITY
- `matrix.risk` - Risk events from CYPHER

## Build & Test Commands

```bash
# Build
cargo build --release

# Test all
cargo test

# Test single crate
cargo test -p neo
cargo test -p morpheus
cargo test -p trinity

# Lint
cargo clippy --all-targets --all-features -- -D warnings

# Format
cargo fmt
```

## Agent Responsibilities

| Agent | Purpose | Key Files |
|-------|---------|-----------|
| NEO | Orchestration, supervision | `neo/src/lib.rs` |
| MORPHEUS | WebSocket price feeds | `morpheus/src/lib.rs` |
| DOZER | Chronicle Queue pipeline | `dozer/src/lib.rs` |
| TRINITY | Flashbots bundles, execution | `trinity/src/lib.rs`, `trinity/src/flashbots.rs` |
| SERAPH | EVM simulation (revm) | `seraph/src/lib.rs` |
| CYPHER | Risk limits, circuit breaker | `cypher/src/lib.rs` |

## Current TODOs in This Scope

1. `cypher/src/lib.rs:304` - Calculate hourly PnL from history
2. `dozer/src/lib.rs:188` - Implement spread calculation

## Status Tracking

### STATUS.md (this scope's log)
Update `core/STATUS.md` as you work:
- Log actions in "Session Log" section
- Move items between In Progress / Completed / Blocked
- Add cross-scope requests when you need other instances

### state.json (global coordination)
Update your instance status in `../state.json`:
```json
"core": {
  "status": "working",           // idle | working | blocked | waiting_for_input
  "current_task": "Implementing MORPHEUS WebSocket feeds",
  "last_active": "2026-01-01T12:00:00Z"
}
```

### File Locking Protocol
Before modifying a shared file (e.g., shared types):
1. Check `../state.json` → `locked_files`
2. If not locked, add: `"core/shared/types/src/lib.rs": "core"`
3. Make your changes
4. Remove the lock when done

## Communication Protocol

When you need changes in other scopes:
1. Complete your work in this scope
2. Add request to "Cross-Scope Requests" in `core/STATUS.md`
3. The user will relay to the appropriate instance
