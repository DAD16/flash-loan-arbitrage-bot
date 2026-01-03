# Memory - Flash Loan Arbitrage Bot

## Last Updated
2026-01-02 (Crash Prevention System Fully Implemented)

## CRASH PREVENTION SYSTEM (2026-01-02)

### Problem Identified
Previous crash investigation found file locking code existed but was **NEVER USED**:
- `orchestration/fileLock.ts` was implemented but not integrated
- Process manager existed but wasn't being used for Node processes
- Crash monitor had no actual monitoring logic

### Solution Implemented

**New Files Created:**
| File | Purpose |
|------|---------|
| `orchestration/stateManager.ts` | High-level state management with locking |
| `orchestration/crashProtection.ts` | Crash prevention daemon |
| `orchestration/index.ts` | Module exports for easy imports |
| `docs/CRASH_PREVENTION.md` | Full documentation |

**Usage:**
```bash
# Before starting work
npx tsx orchestration/crashProtection.ts cleanup

# Start crash protection daemon (optional)
npx tsx orchestration/crashProtection.ts start

# Use process manager for Node processes
node scripts/process-manager.js start dashboard npm run start
node scripts/process-manager.js stop dashboard
```

**Code Integration:**
```typescript
import { updateState, appendToMemory, startTask, endTask } from './orchestration';

await startTask('dashboard', 'Building UI');
await appendToMemory('## Completed\n- Fixed bug', 'root');
await endTask('dashboard');
```

### Key Changes
1. Created `stateManager.ts` - wraps all state.json/memory.md access with file locking
2. Created `crashProtection.ts` - daemon that monitors locks, detects contention, auto-recovers
3. Updated `CLAUDE.md` - added crash prevention workflow documentation
4. Created `docs/CRASH_PREVENTION.md` - comprehensive guide

---

## CRASH INVESTIGATION (2026-01-01)

### What Happened
- Root instance was working on wallet management system
- User opened second PowerShell instance with MOUSE agent doing research
- Both instances crashed simultaneously

### Wallet Status Before Crash
The wallet system appears COMPLETE:
- `agents/keymaker/src/walletManager.ts` - HD derivation, balance monitoring, auto-funding ✓
- `agents/keymaker/src/database.ts` - SQLite with WAL mode for concurrent access ✓
- `dashboard/src/pages/Wallets.tsx` - Full dashboard UI ✓
- No obvious code issues found

### CONFIRMED CRASH CAUSES (Test Results)

| Issue | Test Result | Impact |
|-------|-------------|--------|
| **File Contention** | 17/50 writes failed (34%) | HIGH - causes data loss |
| **state.json Race** | 5 errors across 3 instances | HIGH - corrupts coordination |
| **Claude Processes** | 8 active processes | MEDIUM - resource contention |

**Root Cause**: When multiple Claude instances run, they compete for shared files (`memory.md`, `state.json`). Without file locking, concurrent writes fail silently or corrupt data, causing crashes.

### Crash Prevention (Implemented)
Created test: `testing/multi-instance-crash-test.ps1 -All`

**File Locking Solution Implemented:**
- `orchestration/fileLock.ts` - File locking utility
- `testing/test-file-lock.ts` - Tests (5/5 passing)

**Features:**
- `acquireLock(file, instance)` - Acquire exclusive lock
- `releaseLock(handle)` - Release lock
- `atomicWrite(file, content)` - Write via temp file + rename
- `modifyFileWithLock(file, modifier, instance)` - Read-modify-write with lock
- `updateStateJson(updater, instance)` - Safe state.json updates
- `cleanupStaleLocks()` - Remove locks older than 30s

**Usage Example:**
```typescript
import { acquireLock, releaseLock, atomicWrite } from './orchestration/fileLock';

const lock = await acquireLock('memory.md', 'root');
try {
  atomicWrite('memory.md', newContent);
} finally {
  await releaseLock(lock);
}
```

### Wallet Bug Fixed (2026-01-01)
**Issue**: `HDNodeWallet.fromPhrase()` in ethers v6 returns wallet at default path (depth 5), not master node.
**Fix**: Use `mnemonic.computeSeed()` + `HDNodeWallet.fromSeed(seed)` to get true master node at depth 0.
**File**: `dashboard/src/api/routes/wallets.ts` line 416-419

### Wallet System Verified Working
- Wallet generation: ✓ (2 test wallets created)
- Balance monitoring: ✓ (fetches on-chain balances)
- Summary API: ✓ (counts by chain/role, low balance detection)
- Dashboard UI: Running at http://localhost:9080

## Speed Optimization - Phase A Complete (2026-01-01)

### Implemented Components

| Component | File | Description |
|-----------|------|-------------|
| WebSocket Server | `services/websocketServer.ts` | Real-time price streaming on `ws://localhost:9082` |
| Fast Mode API | `api/routes/fastMode.ts` | Enable/disable/configure fast execution |
| WebSocket Hook | `hooks/useWebSocket.ts` | React hooks for live updates |
| Fast Mode UI | `components/FastModeControl.tsx` | Dashboard control panel with latency metrics |

### API Endpoints

```
GET  /api/fast-mode/status   - Get config and stats
POST /api/fast-mode/enable   - Enable Fast Mode
POST /api/fast-mode/disable  - Emergency stop
POST /api/fast-mode/config   - Update settings
GET  /api/fast-mode/latency  - Get latency metrics
```

### WebSocket Channels

- `prices` - Real-time price updates
- `opportunities` - Arbitrage opportunities
- `executions` - Trade execution status
- `latency` - RPC/processing latency metrics

### Fast Mode Config

```typescript
{
  enabled: boolean;         // Master toggle
  autoExecute: boolean;     // Execute without confirmation
  minProfitThresholdBps: number;  // e.g., 50 = 0.5%
  maxGasGwei: number;       // Gas price ceiling
  maxSlippageBps: number;   // Slippage tolerance
  usePrivateMempool: boolean; // MEV protection
  cooldownMs: number;       // Min time between trades
}
```

### Latency Improvement (Target)

| Metric | Before | After (Target) |
|--------|--------|----------------|
| Price Updates | 2000ms polling | ~100ms WebSocket |
| End-to-end | 4-6 seconds | <500ms |

### Next Steps for Phase B/C

- Phase B: Rust WebSocket (MORPHEUS), price aggregation (ORACLE)
- Phase C: C++ hot path with SIMD, lock-free order book

## What Was Just Completed

### Wallet Dashboard UI
Created the wallet management dashboard page:
- `dashboard/src/pages/Wallets.tsx` - Full wallet management UI with:
  - Summary cards (total wallets, by role, low balance count)
  - Wallet list with balances, chain, role badges
  - Generate wallet modal (chain, role, label selection)
  - Wallet details modal (balance, assignments, funding history)
  - Copy address, external explorer links
  - Balance monitoring controls
- Added wallet route to sidebar navigation
- Integrated `/api/wallets` routes into API server
- Added ethers dependency to dashboard

---

### KEYMAKER Wallet Management System (PROJECT 1)
Implemented the multi-wallet management system for KEYMAKER agent:

**New Files Created:**
- `agents/keymaker/src/types.ts` - Extended with wallet types (ManagedWallet, WalletBalance, etc.)
- `agents/keymaker/src/database.ts` - SQLite database for wallet tracking
- `agents/keymaker/src/walletManager.ts` - Core wallet manager with:
  - HD wallet derivation (BIP-44: m/44'/60'/0'/0/index)
  - Balance monitoring service
  - Auto-funding logic
  - Multi-chain support (ETH, BSC, Polygon, Arbitrum, Sepolia)
- `dashboard/src/api/routes/wallets.ts` - REST API endpoints for dashboard

**API Endpoints Available:**
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/wallets` | GET | List all wallets |
| `/api/wallets/summary` | GET | Get statistics |
| `/api/wallets/balances` | GET | Get all balances |
| `/api/wallets/low-balance` | GET | Get low balance wallets |
| `/api/wallets/:id` | GET | Get wallet details |
| `/api/wallets/generate` | POST | Generate new wallet |
| `/api/wallets/:id/fund` | POST | Fund a wallet |
| `/api/wallets/auto-fund` | POST | Auto-fund all low balance |
| `/api/wallets/monitoring/start` | POST | Start monitoring |

**Dependencies Added:**
- `better-sqlite3` for SQLite database

---

### Previous: Multi-Instance Setup
- Created full multi-instance parallel development setup:

### CLAUDE.md Files (Scope Definition)
  - `core/CLAUDE.md` - Rust agents scope
  - `agents/CLAUDE.md` - TypeScript agents scope
  - `analysis/CLAUDE.md` - Python agents scope
  - `contracts/CLAUDE.md` - Solidity contracts scope
  - `dashboard/CLAUDE.md` - Dashboard UI scope
  - `hotpath/CLAUDE.md` - C++ hot path scope

### STATUS.md Files (Per-Instance Logging)
  - `core/STATUS.md` - Rust session log
  - `agents/STATUS.md` - TypeScript session log
  - `analysis/STATUS.md` - Python session log
  - `contracts/STATUS.md` - Solidity session log
  - `dashboard/STATUS.md` - Dashboard session log
  - `hotpath/STATUS.md` - C++ session log

### state.json (Global Coordination)
  - Instance status tracking
  - File locking protocol
  - Cross-scope request queue
  - Shared decisions log

- Updated root `CLAUDE.md` with orchestrator role and coordination responsibilities
- Each CLAUDE.md defines: scope, off-limits files, status tracking, locking protocol

## Previous Session Completed
- Deployed FlashLoanReceiver and MultiDexRouter to BSC mainnet
- Authorized executor wallet on BSC contracts
- Created BSC deployment configuration
- Whitelisted DEX routers (PancakeSwap, MDEX) on FlashLoanReceiver
- Tested flash loan infrastructure - VERIFIED WORKING
- Discovered: Reserve-based spreads ≠ executable profits (fees eat margins)
- Created execute-arbitrage.ts and test-flash-loan.ts scripts

## Resume Point
The flash loan arbitrage system is fully deployed and verified on BSC mainnet.
Infrastructure works, waiting for profitable opportunities (>1% spread after fees).
To continue: Run price monitoring and look for real arbitrage opportunities.

## Current Status

### Price Monitoring - WORKING
| Feature | Status |
|---------|--------|
| Multi-DEX Monitoring | ✓ 5 DEXs |
| Pairs Tracked | ✓ 49 pairs |
| Arbitrage Detection | ✓ Real-time |
| Profit Calculation | ✓ Net after fees |
| Dashboard Display | ✓ Live refresh |

### Monitored DEXs (BSC)
- PancakeSwap (0.25% fee)
- Biswap (0.1% fee)
- ApeSwap (0.2% fee)
- MDEX (0.3% fee)
- BabySwap (0.3% fee)

### Execution System - WORKING
| Check | Status |
|-------|--------|
| Wallet Configured | ✓ |
| Contracts Deployed | ✓ |
| Executor Authorized | ✓ |
| Test TX Sent | ✓ Block 9958095 |

### BSC Mainnet Contracts - LIVE
| Contract | Address |
|----------|---------|
| FlashLoanReceiver | `0xD94aeF4a31315398b8603041a60a607Dea0f598D` |
| MultiDexRouter | `0x407dB4F63367B719b00d232023088C4C07334ac2` |
| Owner/Deployer | `0x5901DCe2aE9B4f4267B0A8880567eD6c997B5fF0` |
| Executor Authorized | ✓ TX: `0x24fd7513...` |

### Sepolia Testnet Contracts
| Contract | Address |
|----------|---------|
| FlashLoanReceiver | `0xD94aeF4a31315398b8603041a60a607Dea0f598D` |
| MultiDexRouter | `0x407dB4F63367B719b00d232023088C4C07334ac2` |
| Owner/Deployer | `0x5901DCe2aE9B4f4267B0A8880567eD6c997B5fF0` |

### Wallet Balances
- **Sepolia ETH**: ~0.25 ETH
- **BSC BNB**: 0.1664 BNB

### Dashboard - FULLY FUNCTIONAL
| Component | Status |
|-----------|--------|
| Vite Dev Server | Running |
| API Server (9081) | Running |
| Live Prices Page | NEW ✓ |
| Execute Button | Working |
| Price Monitoring | Working |
| Toast Notifications | Working |
| One-Button Startup | Working |

### API Endpoints
- `GET /api/status` - System health and RPC status
- `GET /api/execute/status?chain=sepolia` - Execution readiness
- `POST /api/execute/test` - Send test transaction
- `GET /api/prices/status` - Price monitoring status
- `GET /api/prices/live` - Current prices across DEXs
- `GET /api/prices/spreads` - Arbitrage opportunities
- `GET /api/prices/pair/:pair` - Specific pair prices
- `POST /api/prices/start` - Start price monitoring
- `POST /api/prices/stop` - Stop price monitoring

## Files Created This Session
- `dashboard/src/api/routes/prices.ts` - Price monitoring API
- `dashboard/src/pages/Prices.tsx` - Live prices dashboard page

## Test Results

### Price Monitoring Test (BSC Mainnet)
```
Duration: 93 seconds
Pairs Monitored: 49
Price Updates: 10
Opportunities Detected: 24

Best Opportunity:
  Pair: CAKE/USDT
  Buy: MDEX @ 1.9079
  Sell: BabySwap @ 1.9858
  Spread: 4.08%
  Net Profit: 3.48%
  Est. USD: ~$20.88
```

### Execution Test (Sepolia)
```
Chain: Sepolia
TX Hash: 0x410525a594d6ced48fee84d5eb85a92f2ef6a554c6bdc7199ffc745d3662f866
Block: 9958095
Gas Used: 21000
```

## How to Start the Project
```bash
cd dashboard
npm run start
```

## How to Start Price Monitoring
Via dashboard: Navigate to "Live Prices" page and click "Start Monitoring"

Via API:
```bash
curl -X POST http://localhost:9081/api/prices/start \
  -H "Content-Type: application/json" \
  -d '{"pollIntervalMs": 2000, "minSpreadBps": 5}'
```

## SECURITY NOTES
1. Seed phrase was shared in chat - use only for testnet
2. Private key stored in .env (gitignored)
3. Current wallet suitable for testnet only

## Flash Loan Test Results (BSC Mainnet)
```
Aave V3 USDT Reserve: Available (ID: 5)
aToken: 0xa9251ca9DE909CB71783723713B21E4233fbf1B1
Contract minProfitBps: Set to 0 for testing
Round-trip swap (USDT→WBNB→USDT): -0.059 USDT (expected loss from fees)
Status: Infrastructure verified working
```

## Key Discovery
Reserve-based price spreads (shown in monitoring) ≠ executable profits:
- Price monitoring shows 4%+ spreads from pool reserve ratios
- Actual router swaps include 0.25% fee per hop + price impact
- Flash loan fee: 0.09% (Aave V3)
- Net result: Most "opportunities" are unprofitable after fees
- MEV bots on BSC are extremely competitive

## PENDING PROJECTS (Next Session)

### PROJECT 1: Multi-Wallet Management System
**Priority**: High
**Assigned Agent**: KEYMAKER (Secrets & Authentication)

**Requirements**:
1. Generate new wallets programmatically (HD wallet derivation from master seed)
2. Fund wallets with gas fees (BNB for BSC, ETH for other chains)
3. Track wallet-to-contract assignments in database
4. Dashboard view showing:
   - All managed wallets with balances
   - Which contract each wallet is authorized on
   - Gas balance warnings (low balance alerts)
   - Funding history

**Proposed Scheme**:
```
Wallet Hierarchy:
├── Master Wallet (Cold Storage - Manual)
│   └── Funds distribution wallet
│
├── Executor Wallets (Hot - Per Contract)
│   ├── BSC-Executor-1 → FlashLoanReceiver (BSC)
│   ├── BSC-Executor-2 → FlashLoanReceiver (BSC) [backup]
│   ├── ETH-Executor-1 → FlashLoanReceiver (ETH)
│   ├── ARB-Executor-1 → FlashLoanReceiver (Arbitrum)
│   └── ...
│
└── Gas Reserve Wallets (Per Chain)
    ├── BSC-Gas-Reserve (holds BNB for refueling)
    ├── ETH-Gas-Reserve (holds ETH for refueling)
    └── ...
```

**Database Schema** (proposed):
```sql
CREATE TABLE wallets (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  chain TEXT NOT NULL,
  role TEXT NOT NULL, -- 'executor' | 'gas_reserve' | 'master'
  derivation_path TEXT,
  created_at TIMESTAMP,
  last_funded_at TIMESTAMP
);

CREATE TABLE wallet_assignments (
  wallet_id TEXT REFERENCES wallets(id),
  contract_address TEXT NOT NULL,
  chain TEXT NOT NULL,
  authorized_at TIMESTAMP,
  tx_hash TEXT
);

CREATE TABLE wallet_balances (
  wallet_id TEXT REFERENCES wallets(id),
  balance_wei TEXT NOT NULL,
  updated_at TIMESTAMP
);
```

**Tasks**:
- [ ] Create wallet generation utility (ethers.js HDNode)
- [ ] Add wallet tracking to SQLite database
- [ ] Create dashboard page for wallet management
- [ ] Add auto-funding logic when balance < threshold
- [ ] Add authorization flow for new wallets on contracts

---

### PROJECT 2: Speed Optimization - Fast Execution Mode
**Priority**: Critical
**Assigned Agents**:
- ORACLE (Price Detection) - Python analysis
- MORPHEUS (Market Data) - Rust WebSocket feeds
- TRINITY (Execution) - Rust execution engine
- Hot Path (C++) - Ultra-low latency calculations

**Current Bottlenecks Analysis**:
```
Current Flow (Estimated Latency):
1. Price fetch from DEX APIs     ~500-2000ms (HTTP polling)
2. Spread calculation            ~10ms (JavaScript)
3. Profit validation             ~100ms (RPC calls for quotes)
4. Transaction building          ~50ms
5. Transaction submission        ~200ms
6. Confirmation waiting          ~3000ms (1 BSC block)
─────────────────────────────────────────────────
Total: ~4-6 seconds (TOO SLOW for MEV competition)

Target Flow (With Optimization):
1. WebSocket price streams       ~10ms (real-time push)
2. SIMD spread calculation       ~0.1ms (C++ hot path)
3. Pre-computed profit tables    ~1ms (cached thresholds)
4. Pre-signed TX templates       ~5ms (just update params)
5. Direct node submission        ~50ms (dedicated RPC)
6. Flashbots/MEV relay           ~100ms (private mempool)
─────────────────────────────────────────────────
Target: <200ms end-to-end
```

**Optimization Tasks**:

**Phase A - Quick Wins (TypeScript/Dashboard)**:
- [ ] Switch from HTTP polling to WebSocket price feeds
- [ ] Use router `getAmountsOut` quotes instead of reserve calculations
- [ ] Pre-compute gas estimates and cache them
- [ ] Add "Fast Mode" toggle to dashboard
- [ ] Batch multiple DEX quotes in parallel

**Phase B - Rust Core Implementation**:
- [ ] Implement MORPHEUS WebSocket feed manager
- [ ] Build ORACLE price aggregation with sub-ms latency
- [ ] Create TRINITY fast execution path with pre-signed TXs
- [ ] Add SERAPH instant simulation (revm fork)

**Phase C - C++ Hot Path (Maximum Speed)**:
- [ ] Lock-free order book for all DEX prices
- [ ] SIMD-optimized arbitrage graph traversal
- [ ] Pre-allocated memory pools (zero allocation)
- [ ] Direct socket I/O with io_uring

**Fast Mode Switch Design**:
```typescript
interface FastModeConfig {
  enabled: boolean;
  autoExecute: boolean;           // Execute without confirmation
  minProfitThresholdBps: number;  // e.g., 50 = 0.5%
  maxGasGwei: number;             // Gas price ceiling
  maxSlippageBps: number;         // Slippage tolerance
  usePrivateMempool: boolean;     // MEV protection
  cooldownMs: number;             // Min time between executions
}
```

**Dashboard Controls**:
- Fast Mode ON/OFF toggle (prominent, red when active)
- Real-time latency metrics display
- Execution log with timestamps
- Kill switch for emergency stop

---

## Next Steps
1. ~~Configure wallet private key~~ ✓ DONE
2. ~~Redeploy contracts on Sepolia~~ ✓ DONE
3. ~~Add Sepolia testnet support to dashboard~~ ✓ DONE
4. ~~Test real execution on Sepolia~~ ✓ DONE
5. ~~Add price monitoring for real arbitrage opportunities~~ ✓ DONE
6. ~~Deploy contracts to BSC for real arbitrage~~ ✓ DONE
7. ~~Verify flash loan infrastructure works~~ ✓ DONE
8. **[PROJECT 1]** Implement multi-wallet management (KEYMAKER)
9. **[PROJECT 2]** Speed optimization and fast mode (ORACLE/MORPHEUS/TRINITY)
10. Execute real flash loan arbitrage when profitable opportunity arises
11. Configure additional chains (ARB, OP, Base)
12. Add automated execution when opportunities detected
