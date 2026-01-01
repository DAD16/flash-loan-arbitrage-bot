# CLAUDE.md - Solidity Smart Contracts

This file scopes Claude Code to the Solidity smart contracts only.

## Scope

**This instance owns:**
- `contracts/src/` - Contract source files
  - `FlashLoanReceiver.sol` - Aave V3 flash loan handler
  - `MultiDexRouter.sol` - DEX routing logic
  - `interfaces/` - Contract interfaces
- `contracts/script/` - Deployment scripts
  - `Deploy.s.sol` - Ethereum/Sepolia deployment
  - `DeployBSC.s.sol` - BSC deployment
- `contracts/test/` - Contract tests
- `contracts/foundry.toml` - Foundry config
- `../deployments/` - Deployment configs (OWNER)
  - `sepolia.json`
  - `bsc.json`

## Off-Limits (DO NOT MODIFY)

- `../core/` - Rust agents (different instance)
- `../agents/` - TypeScript agents (different instance)
- `../analysis/` - Python agents (different instance)
- `../dashboard/` - Dashboard UI (different instance)
- `../hotpath/` - C++ hot path (different instance)
- `../memory.md` - Root instance only
- `../CLAUDE.md` - Root instance only
- `../.env` - Root instance only (but read for PRIVATE_KEY)

## Deployed Contracts

### BSC Mainnet (LIVE)
| Contract | Address |
|----------|---------|
| FlashLoanReceiver | `0xD94aeF4a31315398b8603041a60a607Dea0f598D` |
| MultiDexRouter | `0x407dB4F63367B719b00d232023088C4C07334ac2` |
| Owner | `0x5901DCe2aE9B4f4267B0A8880567eD6c997B5fF0` |

### Sepolia Testnet
| Contract | Address |
|----------|---------|
| FlashLoanReceiver | `0xD94aeF4a31315398b8603041a60a607Dea0f598D` |
| MultiDexRouter | `0x407dB4F63367B719b00d232023088C4C07334ac2` |
| Owner | `0x5901DCe2aE9B4f4267B0A8880567eD6c997B5fF0` |

## Build & Test Commands

```bash
# Build
forge build

# Test (7 tests)
forge test -vvv

# Test with mainnet fork
ETH_RPC_URL="https://eth-mainnet.g.alchemy.com/v2/KEY" forge test --fork-url $ETH_RPC_URL

# Fuzz tests only
forge test --match-test testFuzz

# Gas report
forge test --gas-report

# Format
forge fmt

# Check format
forge fmt --check
```

## Deploy Commands

```bash
# Deploy to Sepolia
PRIVATE_KEY="0x..." forge script script/Deploy.s.sol:DeployScript \
    --rpc-url "https://eth-sepolia.g.alchemy.com/v2/KEY" \
    --broadcast

# Deploy to BSC
PRIVATE_KEY="0x..." forge script script/DeployBSC.s.sol:DeployBSCScript \
    --rpc-url "https://bsc-dataseed.binance.org" \
    --broadcast

# Verify on Etherscan
forge verify-contract <ADDRESS> src/FlashLoanReceiver.sol:FlashLoanReceiver \
    --chain sepolia \
    --etherscan-api-key "KEY"

# Read contract state
cast call <ADDRESS> "owner()(address)" --rpc-url <RPC_URL>
```

## Contract Architecture

```
FlashLoanReceiver (Aave V3 IFlashLoanSimpleReceiver)
├── executeOperation() - Called by Aave pool
├── executeArbitrage() - External entry point
├── authorizedExecutors - Whitelist of allowed callers
├── whitelistedRouters - Approved DEX routers
└── minProfitBps - Minimum profit threshold

MultiDexRouter
├── executeSwaps() - Multi-hop swap execution
├── getOptimalRoute() - Route calculation
└── Supports: Uniswap V2/V3, PancakeSwap, SushiSwap, etc.
```

## Security Considerations

- Executor whitelist prevents unauthorized calls
- Router whitelist prevents malicious routing
- Reentrancy guards on all external calls
- Flash loan fee accounting (0.09% Aave V3)
- Profit validation before execution

## Status Tracking

### STATUS.md (this scope's log)
Update `contracts/STATUS.md` as you work:
- Log actions in "Session Log" section
- Move items between In Progress / Completed / Blocked
- Add cross-scope requests when you need other instances

### state.json (global coordination)
Update your instance status in `../state.json`:
```json
"contracts": {
  "status": "working",           // idle | working | blocked | waiting_for_input
  "current_task": "Deploying to Arbitrum",
  "last_active": "2026-01-01T12:00:00Z"
}
```

### File Locking Protocol
Before modifying deployment configs:
1. Check `../state.json` → `locked_files`
2. If not locked, add: `"deployments/arbitrum.json": "contracts"`
3. Make your changes
4. Remove the lock when done

## Communication Protocol

When you need changes in other scopes:
1. Complete your work in this scope
2. Add request to "Cross-Scope Requests" in `contracts/STATUS.md`
3. The user will relay to the appropriate instance

### Common Cross-Scope Needs
- Need execution from Rust? → Coordinate with core instance (TRINITY)
- Need dashboard display? → Request from dashboard instance
- Need new chain support? → Update deployment configs, notify all instances
