# Contracts (Solidity) Status

> **Instance**: contracts
> **Scope**: Solidity smart contracts (FlashLoanReceiver, MultiDexRouter)
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

### Deployed Contracts

**BSC Mainnet (LIVE)**
| Contract | Address |
|----------|---------|
| FlashLoanReceiver | `0xD94aeF4a31315398b8603041a60a607Dea0f598D` |
| MultiDexRouter | `0x407dB4F63367B719b00d232023088C4C07334ac2` |

**Sepolia Testnet**
| Contract | Address |
|----------|---------|
| FlashLoanReceiver | `0xD94aeF4a31315398b8603041a60a607Dea0f598D` |
| MultiDexRouter | `0x407dB4F63367B719b00d232023088C4C07334ac2` |

### Pending Chains
- [ ] Arbitrum
- [ ] Optimism
- [ ] Base

---

## Quick Reference

### My Files (can modify)
- `contracts/**/*`
- `contracts/STATUS.md` (this file)
- `../deployments/*.json` (deployment configs)

### Read Only
- `../state.json` (read, update my instance status only)
- `../memory.md` (read only)
- Other scope directories

### Commands
```bash
forge build
forge test -vvv
forge fmt
forge script script/Deploy.s.sol --broadcast
```
