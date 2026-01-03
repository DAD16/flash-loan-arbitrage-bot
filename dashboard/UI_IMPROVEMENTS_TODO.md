# UI Improvements TODO - Matrix Command Center

**Created by**: Agent MOUSE
**Date**: January 2025
**Status**: Pending Implementation

---

## Overview

This document outlines UI improvements needed to reflect new features in the Flash Loan Arbitrage Bot system. The improvements focus on four key areas: direct pool calls, multi-chain monitoring, execution configuration, and real-time price feeds.

---

## 1. Direct Pool Calls Display

### Current State
- Opportunities page shows routes via DEX names (e.g., "PancakeV3", "BiSwap")
- No visibility into whether calls are routed through DEX routers or direct to pools
- Gas cost estimates don't differentiate between router vs direct calls

### Required Changes

#### 1.1 Opportunities Page (`src/pages/Opportunities.tsx`)
- [ ] Add "Call Type" column to opportunities table
  - Values: "Router" | "Direct Pool" | "Hybrid"
  - Color coding: Direct = green (lower gas), Router = yellow
- [ ] Show gas savings indicator for direct pool opportunities
  - Display estimated gas savings in BNB/ETH
- [ ] Add filter for call type

#### 1.2 New Component: `DirectPoolIndicator`
- [ ] Create `src/components/ui/DirectPoolIndicator.tsx`
  - Show pool address with copy button
  - Indicate pool type (UniV3, UniV2, Curve, etc.)
  - Display expected gas vs router gas

#### 1.3 Execution Details Modal
- [ ] Create `src/components/ExecutionDetailsModal.tsx`
  - Show full call path for each swap step
  - Display calldata preview (truncated)
  - Show pool addresses used
  - Gas breakdown per step

#### 1.4 Strategy Page Updates (`src/pages/Strategy.tsx`)
- [ ] Add "Direct Calls Configuration" section
  - Toggle: Enable direct pool calls (default: enabled)
  - Pool whitelist management
  - Max gas savings threshold to prefer direct calls

### API Requirements
- Need endpoints to return `call_type` field on opportunities
- Need `pool_addresses` array in opportunity data
- Need `gas_estimate_direct` vs `gas_estimate_router` fields

---

## 2. Multi-Chain Opportunity Monitoring

### Current State
- Chain selector in header allows switching between chains
- Each chain view is isolated
- No cross-chain opportunity comparison
- Chain support indicator exists but no unified view

### Required Changes

#### 2.1 New Page: Multi-Chain Overview (`src/pages/MultiChainOverview.tsx`)
- [ ] Create new page accessible from sidebar
- [ ] Components needed:
  - Chain comparison table showing:
    - Total opportunities per chain
    - Best current spread per chain
    - 24h profit per chain
    - System status per chain
  - Cross-chain opportunity scanner results
  - Chain health indicators (RPC latency, block times)

#### 2.2 Sidebar Updates (`src/components/layout/Sidebar.tsx`)
- [ ] Add "Multi-Chain" navigation item with Network icon
- [ ] Add chain status indicators next to navigation (colored dots)

#### 2.3 Header Updates (`src/components/layout/Header.tsx`)
- [x] Add "All Chains" option to chain selector
- [x] When "All Chains" selected, show aggregated stats
- [x] Add multi-chain opportunity count badge

#### 2.4 New Component: `ChainStatusCard`
- [ ] Create `src/components/ui/ChainStatusCard.tsx`
  - Show chain logo/icon
  - Display RPC connection status
  - Show current gas price
  - Display number of active pairs
  - Indicate if monitoring is active

#### 2.5 Overview Page Updates (`src/pages/Overview.tsx`)
- [ ] Add "Cross-Chain Opportunities" section
- [ ] Show opportunities where same token pair has spread across chains
- [ ] Indicate bridge availability for cross-chain arb

#### 2.6 Real-time Updates
- [ ] Update `src/hooks/useWebSocket.ts` to handle multi-chain subscriptions
- [ ] Create `useMultiChainPrices` hook for aggregated price data
- [ ] Add chain-specific WebSocket channels

### API Requirements
- Need `/api/multi-chain/overview` endpoint
- Need `/api/multi-chain/opportunities` endpoint
- WebSocket channels for each supported chain

---

## 3. Execution Configuration Panel

### Current State
- Basic strategy configuration exists in Strategy page
- Limited execution controls (profit thresholds, gas settings)
- No fine-grained execution mode controls
- No MEV protection options visible

### Required Changes

#### 3.1 Strategy Page Expansion (`src/pages/Strategy.tsx`)
- [ ] Add "Execution Mode" card with options:
  - Auto-execute: Fully automated (current)
  - Semi-auto: Auto-detect, manual approve
  - Manual: Manual trigger only
  - Simulation: Dry-run mode (no real txs)

#### 3.2 New Component: `ExecutionConfigPanel`
- [x] Create `src/components/ExecutionConfigPanel.tsx`
  - [x] Execution mode selector (radio buttons)
  - [x] MEV protection settings:
    - [x] Flashbots bundle toggle (Ethereum)
    - [x] Private mempool toggle (BSC)
    - [x] Max slippage override
  - [x] Transaction settings:
    - [x] Nonce management mode (auto/manual)
    - [x] Gas estimation multiplier
    - [x] Max pending transactions
  - [x] Timing controls:
    - [x] Execution delay (ms)
    - [x] Opportunity validity window
    - [x] Retry settings (count, backoff)

#### 3.3 New Component: `SimulationResultsPanel`
- [ ] Create `src/components/SimulationResultsPanel.tsx`
  - Show last N simulation results
  - Display expected vs simulated outcome
  - Trace viewer for failed simulations
  - "Execute for Real" button

#### 3.4 Execution Queue Display
- [ ] Create `src/components/ExecutionQueue.tsx`
  - Show pending executions in queue
  - Allow reordering (drag & drop)
  - Cancel button per execution
  - Pause/resume queue button
  - Queue status indicator in header

#### 3.5 Quick Execution Controls (Header)
- [ ] Add execution mode indicator to header
- [ ] Add emergency stop button (visible when executing)
- [ ] Add queue depth indicator

### API Requirements
- Need `/api/config/execution` endpoint (GET/PUT)
- Need `/api/execution/queue` endpoint
- Need `/api/execution/simulate` endpoint
- Need WebSocket events for queue updates

---

## 4. Real-Time Price Feeds Display

### Current State
- Prices page exists with basic price monitoring
- WebSocket integration for live prices
- Cross-DEX price comparison grid
- Limited historical price data

### Required Changes

#### 4.1 Prices Page Enhancement (`src/pages/Prices.tsx`)
- [ ] Add price chart component (mini sparklines)
- [ ] Add price alert configuration
- [ ] Show price deviation from oracle (Chainlink, etc.)
- [ ] Add liquidity depth indicator per DEX

#### 4.2 New Component: `PriceSparkline`
- [x] Create `src/components/charts/PriceSparkline.tsx`
  - [x] Show last 60 price points (30 seconds @ 500ms intervals)
  - [x] Indicate price direction (green/red)
  - [ ] Show volatility band (deferred to future iteration)
  - [ ] Click to expand full chart (deferred to future iteration)

#### 4.3 New Component: `PriceAlertConfig`
- [ ] Create `src/components/PriceAlertConfig.tsx`
  - Set alert thresholds per pair
  - Alert types: Spread %, Price change %, Volume spike
  - Notification preferences (toast, sound, webhook)

#### 4.4 New Component: `LiquidityDepthChart`
- [ ] Create `src/components/charts/LiquidityDepthChart.tsx`
  - Show bid/ask depth visualization
  - Indicate optimal trade sizes
  - Show historical depth changes

#### 4.5 New Component: `OraclePriceCompare`
- [ ] Create `src/components/OraclePriceCompare.tsx`
  - Show DEX price vs Chainlink oracle
  - Calculate deviation percentage
  - Flag arbitrage opportunities vs oracle
  - Historical deviation chart

#### 4.6 Overview Page Price Widget
- [ ] Add "Price Alerts" mini-widget to Overview
- [ ] Show top 3 pairs with largest spreads
- [ ] Quick link to Prices page

#### 4.7 WebSocket Enhancements
- [ ] Update `src/hooks/useWebSocket.ts`:
  - Add `useLiquidityDepth` hook
  - Add `useOraclePrices` hook
  - Add price history buffer (last 60 points)
  - Add alert trigger events

### API Requirements
- Need `/api/prices/history/{pair}` endpoint
- Need `/api/prices/oracle` endpoint
- Need `/api/alerts` CRUD endpoints
- WebSocket channels for alerts and oracle prices

---

## 5. Additional UI Polish

### 5.1 Logo Integration (COMPLETED)
- [x] Animated Matrix logo in sidebar
- [x] Video format: WebM/MP4
- [x] Watermark removed
- [x] Loop on sidebar expanded

### 5.2 Loading States
- [ ] Add skeleton loaders for all data tables
- [ ] Add loading indicators for WebSocket reconnection
- [ ] Add retry buttons for failed API calls

### 5.3 Error Handling
- [ ] Create global error boundary with retry
- [ ] Add connection lost banner
- [ ] Add offline mode indicator

### 5.4 Mobile Responsiveness
- [ ] Test and fix mobile layout issues
- [ ] Add mobile navigation drawer
- [ ] Optimize tables for mobile (horizontal scroll or card view)

### 5.5 Accessibility
- [ ] Add keyboard navigation support
- [ ] Add ARIA labels to interactive elements
- [ ] Ensure color contrast meets WCAG standards

---

## Implementation Priority

### Phase 1 (High Priority) - COMPLETED
1. [x] Execution Configuration Panel - Critical for operational control
   - Created `src/components/ExecutionConfigPanel.tsx`
   - Integrated into Strategy page
2. [x] Multi-chain header updates - Foundation for multi-chain support
   - Updated `src/components/layout/Header.tsx` with "All Chains" option
   - Added aggregated stats view and multi-chain opportunity badge
3. [x] Real-time price sparklines - Improve price visibility
   - Created `src/components/charts/PriceSparkline.tsx`
   - Integrated into Prices page Cross-DEX Price Comparison grid

### Phase 2 (Medium Priority) - COMPLETED
4. [x] Direct Pool Calls indicators - Improve opportunity understanding
   - Created `src/components/ui/DirectPoolIndicator.tsx` with CallTypeBadge and GasSavingsIndicator
   - Added "Call Type" column to Opportunities table
   - Added Call Type filter dropdown
   - Color coding: Direct = green (lower gas), Router = yellow
5. [x] Multi-Chain Overview page - Full multi-chain visibility
   - Created `src/pages/MultiChainOverview.tsx` with chain comparison table
   - Created `src/components/ui/ChainStatusCard.tsx` with health indicators
   - Added to sidebar navigation with Network icon
   - Shows RPC latency, block times, gas prices, and opportunity stats per chain
6. [x] Execution Queue display - Better execution management
   - Created `src/components/ExecutionQueue.tsx`
   - Shows pending executions with status indicators
   - Cancel button per execution
   - Pause/resume queue button
   - Queue status indicator with capacity bar
   - Integrated into Strategy page

### Phase 3 (Lower Priority)
7. Price alerts configuration - Nice to have
8. Liquidity depth charts - Advanced feature
9. Oracle price comparison - Advanced feature

---

## File Structure for New Components

```
src/
  components/
    charts/
      PriceSparkline.tsx      [DONE]
      LiquidityDepthChart.tsx [TODO]
    ui/
      DirectPoolIndicator.tsx [DONE]
      ChainStatusCard.tsx     [DONE]
    ExecutionConfigPanel.tsx   [DONE]
    ExecutionDetailsModal.tsx  [TODO]
    ExecutionQueue.tsx        [DONE]
    SimulationResultsPanel.tsx [TODO]
    PriceAlertConfig.tsx      [TODO]
    OraclePriceCompare.tsx    [TODO]
  pages/
    MultiChainOverview.tsx    [DONE]
  hooks/
    useMultiChainPrices.ts    [TODO]
    useLiquidityDepth.ts      [TODO]
    useOraclePrices.ts        [TODO]
    useExecutionQueue.ts      [TODO]
```

---

## Notes

- All new components should follow existing Matrix theme styling
- Use existing Tailwind classes from `index.css`
- Follow existing patterns for API hooks in `useApi.ts`
- WebSocket hooks should follow pattern in `useWebSocket.ts`
- Consider performance - use React.memo() for chart components
- Test with mock data before API integration
