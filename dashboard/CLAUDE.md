# CLAUDE.md - Dashboard UI

This file scopes Claude Code to the dashboard/UI only.

## Scope

**This instance owns:**
- `dashboard/src/` - React application source
  - `pages/` - React pages (Matrix.tsx, Prices.tsx, etc.)
  - `components/` - UI components
  - `services/` - Business logic
  - `store/` - Zustand state management
  - `api/` - Backend API server
    - `routes/` - API route handlers
    - `server.ts` - Express server
- `dashboard/scripts/` - Execution scripts
  - `execute-arbitrage.ts`
  - `test-flash-loan.ts`
- `dashboard/package.json` - Dependencies
- `dashboard/vite.config.ts` - Vite config
- `dashboard/tailwind.config.js` - Tailwind CSS

## Off-Limits (DO NOT MODIFY)

- `../core/` - Rust agents (different instance)
- `../agents/` - TypeScript agents (different instance)
- `../analysis/` - Python agents (different instance)
- `../contracts/` - Solidity contracts (different instance)
- `../hotpath/` - C++ hot path (different instance)
- `../memory.md` - Root instance only
- `../CLAUDE.md` - Root instance only
- `../.env` - Root instance only (but read for config)

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/status` | GET | System health and RPC status |
| `/api/execute/status` | GET | Execution readiness |
| `/api/execute/test` | POST | Send test transaction |
| `/api/prices/status` | GET | Price monitoring status |
| `/api/prices/live` | GET | Current prices across DEXs |
| `/api/prices/spreads` | GET | Arbitrage opportunities |
| `/api/prices/pair/:pair` | GET | Specific pair prices |
| `/api/prices/start` | POST | Start price monitoring |
| `/api/prices/stop` | POST | Stop price monitoring |

## Build & Run Commands

```bash
# Install dependencies
npm install

# Start dev server (Vite + API)
npm run start

# Start just frontend
npm run dev

# Start just API
npm run api

# Build for production
npm run build

# Type check
npm run typecheck

# Lint
npm run lint
```

## Architecture

```
dashboard/
├── src/
│   ├── api/           # Express backend (port 9081)
│   │   ├── server.ts
│   │   └── routes/
│   │       ├── status.ts
│   │       ├── execute.ts
│   │       └── prices.ts
│   ├── pages/         # React pages
│   │   ├── Matrix.tsx      # Main dashboard
│   │   ├── Prices.tsx      # Live price monitoring
│   │   └── ...
│   ├── components/    # Reusable UI components
│   ├── services/      # Business logic
│   │   ├── priceMonitor.ts
│   │   ├── executionService.ts
│   │   └── competitorIngestion.ts
│   └── store/         # Zustand state
└── scripts/           # CLI execution scripts
    ├── execute-arbitrage.ts
    └── test-flash-loan.ts
```

## Current Features

- Live price monitoring across 5 DEXs
- Real-time arbitrage opportunity detection
- Execute button for test transactions
- Toast notifications
- One-button startup system
- Matrix-themed UI

## Pending Features

### Wallet Management View (for KEYMAKER project)
When agents/keymaker implements wallet management, this scope needs:
- Wallet list component showing all managed wallets
- Balance display with low-balance warnings
- Funding history table
- Authorization status per contract

### Fast Mode Controls (for Speed Optimization project)
- Fast Mode ON/OFF toggle (prominent, red when active)
- Real-time latency metrics display
- Execution log with timestamps
- Kill switch for emergency stop

## Current TODO in This Scope

1. `src/services/competitorIngestion.ts:240` - Calculate USD value for profit

## Status Tracking

### STATUS.md (this scope's log)
Update `dashboard/STATUS.md` as you work:
- Log actions in "Session Log" section
- Move items between In Progress / Completed / Blocked
- Add cross-scope requests when you need other instances

### state.json (global coordination)
Update your instance status in `../state.json`:
```json
"dashboard": {
  "status": "working",           // idle | working | blocked | waiting_for_input
  "current_task": "Building wallet management UI",
  "last_active": "2026-01-01T12:00:00Z"
}
```

### File Locking Protocol
Before modifying shared API types:
1. Check `../state.json` → `locked_files`
2. If not locked, add: `"dashboard/src/api/types.ts": "dashboard"`
3. Make your changes
4. Remove the lock when done

## Communication Protocol

When you need changes in other scopes:
1. Complete your work in this scope
2. Add request to "Cross-Scope Requests" in `dashboard/STATUS.md`
3. The user will relay to the appropriate instance

### Common Cross-Scope Needs
- Need new API data? → May need core (Rust) or analysis (Python) changes
- Need wallet features? → Coordinate with agents instance (KEYMAKER)
- Need contract interaction? → Coordinate with contracts instance
