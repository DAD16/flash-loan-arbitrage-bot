# CLAUDE.md - TypeScript Agents

This file scopes Claude Code to the TypeScript agents only.

## Scope

**This instance owns:**
- `agents/keymaker/` - Secrets & authentication
- `agents/merovingian/` - Mempool monitoring
- `agents/link/` - Message routing (Kafka)
- `agents/infrastructure/architect/` - Node infrastructure (THE ARCHITECT)
- `agents/research/mouse/` - UI/UX research (MOUSE)
- `agents/security/lock/` - Security analysis (LOCK)
- `agents/security/roland/` - Security audits (ROLAND)
- `agents/shared/` - Shared utilities (OWNER)
- `agents/memory/` - Agent persistent memory JSON files
- `agents/package.json` - Dependencies
- `agents/tsconfig.json` - TypeScript config

## Off-Limits (DO NOT MODIFY)

- `../core/` - Rust agents (different instance)
- `../analysis/` - Python agents (different instance)
- `../contracts/` - Solidity contracts (different instance)
- `../dashboard/` - Dashboard UI (different instance)
- `../hotpath/` - C++ hot path (different instance)
- `../memory.md` - Root instance only
- `../CLAUDE.md` - Root instance only
- `../.env` - Root instance only

## Shared Resources

### `agents/memory/*.json`
Agent memory files can be updated by this instance:
- `architect.json` - THE ARCHITECT state
- `mouse.json` - MOUSE research findings
- `lock.json` - LOCK security findings
- `roland.json` - ROLAND audit results

### `agents/shared/`
This instance OWNS shared TypeScript utilities. Coordinate if dashboard needs them.

### Kafka Topics
TypeScript agents use these topics:
- `matrix.mempool` - Mempool events from MEROVINGIAN
- `matrix.routing` - Message routing via LINK
- `matrix.secrets` - Secret requests to KEYMAKER

## Build & Test Commands

```bash
# Install dependencies
pnpm install

# Build all
pnpm run build

# Build single agent
pnpm run build --filter=keymaker
pnpm run build --filter=merovingian

# Lint
pnpm run lint
pnpm run lint:fix

# Type check
pnpm run typecheck
```

## Agent Responsibilities

| Agent | Purpose | Location |
|-------|---------|----------|
| KEYMAKER | HashiCorp Vault, secrets | `keymaker/src/` |
| MEROVINGIAN | Mempool monitoring | `merovingian/src/` |
| LINK | Kafka message routing | `link/src/` |
| THE ARCHITECT | Node infrastructure | `infrastructure/architect/` |
| MOUSE | UI/UX research | `research/mouse/` |
| LOCK | Contract security | `security/lock/` |
| ROLAND | Security audits | `security/roland/` |

## Pending Project: Multi-Wallet Management (KEYMAKER)

This scope owns the KEYMAKER agent which needs:
1. HD wallet derivation from master seed
2. Wallet tracking in SQLite database
3. Auto-funding when balance < threshold
4. Dashboard API endpoints (coordinate with dashboard instance)

## Status Tracking

### STATUS.md (this scope's log)
Update `agents/STATUS.md` as you work:
- Log actions in "Session Log" section
- Move items between In Progress / Completed / Blocked
- Add cross-scope requests when you need other instances

### state.json (global coordination)
Update your instance status in `../state.json`:
```json
"agents": {
  "status": "working",           // idle | working | blocked | waiting_for_input
  "current_task": "Implementing KEYMAKER wallet management",
  "last_active": "2026-01-01T12:00:00Z"
}
```

### File Locking Protocol
Before modifying a shared file:
1. Check `../state.json` → `locked_files`
2. If not locked, add: `"agents/shared/src/types.ts": "agents"`
3. Make your changes
4. Remove the lock when done

## Communication Protocol

When you need changes in other scopes:
1. Complete your work in this scope
2. Add request to "Cross-Scope Requests" in `agents/STATUS.md`
3. The user will relay to the appropriate instance

### Common Cross-Scope Needs
- Need dashboard UI? → Request from dashboard instance
- Need Rust type changes? → Request from core instance
- Need Python analysis? → Request from analysis instance
