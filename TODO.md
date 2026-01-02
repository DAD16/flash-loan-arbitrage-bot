# Dashboard TODO Items

## Completed Tasks (2026-01-02)

### 1. Smart Contract Viewer
- [x] Add smart contract viewer to dashboard
- [x] Include transaction history
- [x] Allow viewing contract interactions and events
- Added `/contracts` page with full ABI viewer, event logs, and transaction history

### 2. Wallet Page Performance
- [x] Investigate slow loading on Wallet page
- [x] Optimize data fetching
- [x] Add loading states/skeleton UI
- Fixed: Backend now fetches balances in parallel instead of sequentially
- Added combined `/api/wallets/all` endpoint
- Added 30-second balance caching
- Frontend uses O(1) Map lookups instead of O(n) array searches

### 3. Live Prices Page Issues
- [x] Prices not showing changes from one blockchain to another
- [x] Prices not updating in real-time on the dashboard
- [x] Connect WebSocket feed to dashboard UI
- [x] Ensure multi-chain price updates are reflected
- Added WebSocket integration for real-time price updates
- Added WebSocket broadcast from PriceIngestionService
- Added chain-awareness with warning for unsupported chains
- Dashboard now shows Live/Polling status indicator

---
*Last updated: 2026-01-02*
