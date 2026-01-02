# MEV Protection, Private RPCs, and Block Builder Infrastructure
## Comprehensive Technical Report

**Document Version**: 1.0
**Date**: January 2, 2026
**Classification**: Internal Technical Documentation
**Author**: Agent Mouse

---

# Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Understanding the MEV Landscape](#2-understanding-the-mev-landscape)
3. [Block Builder Market Analysis](#3-block-builder-market-analysis)
4. [Titan Builder Deep Dive](#4-titan-builder-deep-dive)
5. [Private RPC Integration Guide](#5-private-rpc-integration-guide)
6. [Submitting to Titan Builder](#6-submitting-to-titan-builder)
7. [Infrastructure Cost Analysis](#7-infrastructure-cost-analysis)
8. [Implementation Guide: Arbitrage Protection](#8-implementation-guide-arbitrage-protection)
9. [Code Examples](#9-code-examples)
10. [Recommendations](#10-recommendations)
11. [Appendices](#11-appendices)

---

# 1. Executive Summary

## The Problem

When executing arbitrage transactions on Ethereum, your transactions are visible in the public mempool for approximately 12 seconds before block inclusion. During this window:

- **Front-runners** can see your profitable trade and execute it before you
- **Sandwich attackers** can wrap your trade with buy/sell orders, extracting value
- **Competitors** can clone your strategy by analyzing your contract bytecode

## The Solution

This report details a multi-layered protection strategy:

1. **Private RPCs**: Route transactions through private mempools (Flashbots, MEV Blocker)
2. **Block Builder Submission**: Send bundles directly to builders like Titan
3. **Contract Obfuscation**: Protect strategy logic from reverse engineering
4. **Encrypted Execution**: Future-proof with FHE and threshold encryption

## Key Statistics

| Metric | Value |
|--------|-------|
| Public mempool DeFi usage | ~20% (down from 100% pre-2023) |
| Private RPC adoption | ~80% of DeFi transactions |
| Titan Builder market share | 51% of Ethereum blocks |
| Front-running protection rate | 96-98% with private RPCs |

---

# 2. Understanding the MEV Landscape

## 2.1 What is MEV?

**Maximal Extractable Value (MEV)** is the profit that can be extracted by reordering, inserting, or censoring transactions within a block. For arbitrage bots, MEV represents both:

- **Opportunity**: The profit from price discrepancies across DEXs
- **Risk**: Other actors extracting value from YOUR transactions

## 2.2 Types of MEV Attacks

### Front-Running
An attacker sees your pending transaction and submits the same trade with higher gas, executing before you.

```
Your Transaction: Buy 100 ETH at $2000 on Uniswap
Attacker: Sees this, buys at $2000 first
Result: You buy at $2005, attacker profits $500
```

### Sandwich Attacks
Attacker wraps your transaction with two orders:

```
1. Attacker buys (pushes price up)
2. Your transaction executes (at worse price)
3. Attacker sells (profits from price movement)
```

### Back-Running
Less harmful - attacker executes after your trade to capture secondary effects (liquidations, arbitrage spillover).

## 2.3 The Transaction Supply Chain

```
User Transaction
        |
        v
[Public Mempool] ----> [MEV Searchers] ----> Attack!
        |                    |
        v                    v
    OR: Private RPC ---> [Block Builder] ---> [Validator]
                              |
                              v
                         Block Included
```

**Key Insight**: By using private RPCs, your transaction skips the public mempool entirely.

---

# 3. Block Builder Market Analysis

## 3.1 Current Market Structure (December 2025)

| Builder | Market Share | Blocks (24h) | Strategy |
|---------|--------------|--------------|----------|
| Titan Builder | 51.01% | 3,368 | Private order flow deals |
| BuilderNet | 27.68% | 1,828 | Decentralized coalition |
| Quasar | 13.83% | 913 | Independent |
| Beaverbuild | 3.45% | 228 | Merged into BuilderNet |
| rsync-builder | 2.24% | 148 | Independent |

**Source**: [Rated Network Explorer](https://explorer.rated.network/builders)

## 3.2 Market Concentration

The Herfindahl-Hirschman Index (HHI) for the block builder market is approximately **3,892**, significantly exceeding the 1,800 threshold that defines a "highly concentrated market" under U.S. Department of Justice standards.

**Implication**: This is effectively a duopoly between Titan and BuilderNet, controlling ~79% of all Ethereum blocks.

## 3.3 Why Titan Dominates

### Exclusive Order Flow Agreements

In April 2023, Titan entered an exclusive deal with **Banana Gun** (a popular trading bot):
- Banana Gun routes ALL user transactions to Titan
- Titan gains superior order flow for block construction
- Market share jumped from <1% to >40%

### The Flywheel Effect

```
More Order Flow
      |
      v
Better Blocks (higher MEV extraction)
      |
      v
More Auction Wins
      |
      v
More Partners Want Exclusivity
      |
      v
[Repeat - Market Dominance]
```

### Technical Excellence

Titan runs "multiple bundle merging algorithms in parallel through proprietary high-performance infrastructure."

---

# 4. Titan Builder Deep Dive

## 4.1 Company Overview

**Website**: https://www.titanbuilder.xyz/
**Documentation**: https://docs.titanbuilder.xyz/

**Philosophy**: "We are a neutral block builder on Ethereum. To avoid any conflict of interest, we don't do any searching on Ethereum."

**Team Background**: "Crypto-native team with deep experience across the transaction value chain, having been miners, validators, searchers and traders across multiple Layer-1s."

## 4.2 Infrastructure

### RPC Endpoint
```
https://rpc.titanbuilder.xyz
```

### Rate Limits
- **50 requests/second** per IP
- No authentication required for basic submission
- Higher limits available for partners

### Supported Methods

| Method | Purpose |
|--------|---------|
| `eth_sendBundle` | Submit atomic transaction bundles |
| `eth_cancelBundle` | Cancel pending bundles |
| `eth_sendPrivateTransaction` | Single private transaction |
| `eth_sendRawTransaction` | Standard transaction (private) |
| `eth_sendEndOfBlockBundle` | End-of-block MEV capture |
| `eth_sendBlobs` | EIP-4844 blob transactions |

### Bundle Stats API
```
https://stats.titanbuilder.xyz
```
Use `titan_getBundleStats` to check bundle status.

## 4.3 Business Model

### Revenue Sources
1. **MEV extraction** from block construction
2. **Order flow partnerships** (profit sharing)
3. **Priority inclusion fees** from searchers

### Estimated Profits
Reports suggest Titan has accumulated **over $40M in hidden profits** through their private order flow model.

## 4.4 Privacy Guarantees

From Titan documentation:
> "Titan will never unbundle a bundle, and will never broadcast any bundles or private transactions to the public mempool."

---

# 5. Private RPC Integration Guide

## 5.1 Available Private RPCs

### Flashbots Protect

| Property | Value |
|----------|-------|
| Mainnet RPC | `https://rpc.flashbots.net/fast` |
| Sepolia RPC | `https://rpc-sepolia.flashbots.net/` |
| Protection Rate | 98.5% |
| MEV Refund | 90% of captured MEV |
| Response Time | ~245ms |

### MEV Blocker

| Property | Value |
|----------|-------|
| RPC | `https://rpc.mevblocker.io` |
| Protection Rate | 96.2% |
| User/Validator Split | 90/10 |
| Response Time | ~180ms |
| Operators | CoW Protocol, Agnostic Relay, Beaver Build |

### Merkle

| Property | Value |
|----------|-------|
| RPC | `https://rpc.merkle.io/<API_KEY>` |
| Chains | ETH, BSC, Polygon, Base, Arbitrum, Solana |
| Protection Rate | 94.8% |
| Response Time | ~220ms |

## 5.2 How Private RPCs Work

```
1. You send transaction to Private RPC
2. Transaction enters PRIVATE mempool (not public)
3. RPC runs Order Flow Auction (OFA)
4. Searchers bid for backrun rights (NOT frontrun)
5. Winning bundle sent to block builders
6. Block included on chain
7. You receive MEV refund (if applicable)
```

## 5.3 Integration Methods

### Method 1: Wallet Configuration (Simplest)

Add to MetaMask manually:
- **Network Name**: Flashbots Protect
- **RPC URL**: `https://rpc.flashbots.net/fast`
- **Chain ID**: 1
- **Currency**: ETH
- **Explorer**: `https://etherscan.io/`

### Method 2: Provider Configuration (Recommended for Bots)

```typescript
// ethers.js v6
import { JsonRpcProvider } from 'ethers';

const privateProvider = new JsonRpcProvider(
  'https://rpc.flashbots.net/fast'
);

// All transactions through this provider are private
```

### Method 3: Direct RPC Calls

```typescript
const response = await fetch('https://rpc.flashbots.net', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_sendRawTransaction',
    params: [signedTransaction]
  })
});
```

## 5.4 Important Considerations

1. **Non-zero priority fees**: Transactions with 0 priority fee are rejected
2. **Don't switch RPCs**: If you switch before confirmation, MetaMask may resend to public mempool
3. **No failed transaction fees**: You only pay if transaction succeeds
4. **Tor available**: For maximum privacy, use `.onion` endpoint

---

# 6. Submitting to Titan Builder

## 6.1 Why Submit Directly to Titan?

| Benefit | Description |
|---------|-------------|
| Higher inclusion rate | 51% market share = best chance of inclusion |
| Bundle atomicity | All-or-nothing execution |
| MEV refunds | Get portion of MEV back |
| Sponsored bundles | Gas funding for profitable bundles |
| No public exposure | Never touches public mempool |

## 6.2 API Reference

### eth_sendBundle

**Endpoint**: `https://rpc.titanbuilder.xyz`

**Request Format**:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_sendBundle",
  "params": [{
    "txs": ["0x..signed_tx_1..", "0x..signed_tx_2.."],
    "blockNumber": "0x102286B",
    "revertingTxHashes": [],
    "droppingTxHashes": [],
    "replacementUuid": "unique-bundle-id",
    "refundPercent": 90,
    "refundRecipient": "0xYourAddress"
  }]
}
```

**Parameters**:

| Parameter | Required | Description |
|-----------|----------|-------------|
| `txs` | Yes | Array of signed raw transactions |
| `blockNumber` | No | Target block (hex), defaults to next |
| `revertingTxHashes` | No | Txs allowed to revert |
| `droppingTxHashes` | No | Txs allowed to be dropped |
| `replacementUuid` | No | ID for bundle replacement/cancellation |
| `refundPercent` | No | 0-99, percentage of profit refunded |
| `refundRecipient` | No | Address for refund (default: first tx sender) |

**Response**:
```json
{
  "result": {
    "bundleHash": "0x164d7d41f24b7f333af3b4a70b690cf93f636227165ea2b699fbb7eed09c46c7"
  },
  "error": null,
  "id": 1
}
```

### eth_sendPrivateTransaction

**Request**:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_sendPrivateTransaction",
  "params": [{
    "tx": "0x..signed_raw_transaction.."
  }]
}
```

**Response**:
```json
{
  "result": 200,
  "error": null,
  "id": 1
}
```

### eth_cancelBundle

**Request**:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_cancelBundle",
  "params": [{
    "replacementUuid": "unique-bundle-id"
  }]
}
```

## 6.3 Bundle Status Checking

**Endpoint**: `https://stats.titanbuilder.xyz`

**Method**: `titan_getBundleStats`

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "titan_getBundleStats",
  "params": [{
    "bundleHash": "0x164d7d41..."
  }]
}
```

## 6.4 Sponsored Bundles

If your bundle fails with `LackOfFundForGasLimit`, Titan automatically:
1. Sends ETH to cover gas fees
2. Executes your bundle
3. Recoups sponsoring cost from bundle profit

**Requirement**: Bundle must increase builder balance (be profitable).

---

# 7. Infrastructure Cost Analysis

## 7.1 What Does Titan's Infrastructure Look Like?

Based on research and industry knowledge, a competitive block builder requires:

### Hardware Requirements

| Component | Specification | Estimated Cost |
|-----------|---------------|----------------|
| Compute Servers | 8x High-frequency servers | $150,000/year |
| | 64-core AMD EPYC / Intel Xeon | |
| | 512GB-1TB RAM each | |
| | NVMe arrays (8TB+) | |
| Network Infrastructure | 10Gbps+ dedicated lines | $50,000/year |
| | Multiple geographic locations | |
| | Direct peering with validators | |
| Archive Nodes | Full Ethereum archive | $30,000/year |
| | ~20TB+ storage | |
| | Dedicated hardware | |
| Colocation | Multiple data centers | $100,000/year |
| | Low-latency locations | |
| | Redundant power/cooling | |
| **Hardware Subtotal** | | **$330,000/year** |

### Software & Engineering

| Component | Description | Estimated Cost |
|-----------|-------------|----------------|
| Engineering Team | 5-10 senior engineers | $1,500,000/year |
| | Blockchain specialists | |
| | Performance optimization | |
| Custom Software | Bundle merging algorithms | Internal |
| | Simulation infrastructure | |
| | MEV extraction systems | |
| Security | Audits, monitoring | $100,000/year |
| Legal/Compliance | Regulatory consultation | $50,000/year |
| **Software Subtotal** | | **$1,650,000/year** |

### Operational Costs

| Component | Description | Estimated Cost |
|-----------|-------------|----------------|
| Validator Relationships | Partnership development | $200,000/year |
| Order Flow Acquisition | Business development | $500,000/year |
| Subsidies (Market Entry) | Subsidizing blocks to gain share | $1,000,000+ |
| **Operational Subtotal** | | **$1,700,000/year** |

### Total Estimated Annual Cost

| Category | Cost |
|----------|------|
| Hardware & Infrastructure | $330,000 |
| Software & Engineering | $1,650,000 |
| Operational | $1,700,000 |
| **TOTAL** | **$3,680,000/year** |

**Note**: This is a conservative estimate. Titan likely operates at higher scale with additional proprietary systems.

## 7.2 Revenue Potential

With 51% market share and ~7,200 blocks/day:
- ~3,672 blocks/day for Titan
- Average MEV per block: $50-500
- **Daily revenue potential**: $183,600 - $1,836,000
- **Annual revenue potential**: $67M - $670M

**Conclusion**: The infrastructure investment is highly profitable at scale.

## 7.3 Barriers to Entry

1. **Technical Complexity**: Requires deep EVM expertise
2. **Capital Requirements**: $3-5M minimum to compete
3. **Order Flow**: Need partnerships (chicken-and-egg problem)
4. **Latency Competition**: Milliseconds matter
5. **Reputation**: Searchers trust established builders

---

# 8. Implementation Guide: Arbitrage Protection

## 8.1 Overview

We will implement a multi-layered protection strategy:

```
Layer 1: Private RPC (Flashbots/MEV Blocker)
    |
Layer 2: Direct Builder Submission (Titan)
    |
Layer 3: Contract-Level Protection (Commit-Reveal)
    |
Layer 4: Bytecode Obfuscation (Future)
```

## 8.2 Layer 1: Private RPC Configuration

### Step 1: Create RPC Configuration

Create a new configuration file for RPC endpoints:

**File**: `src/config/rpc-config.ts`

```typescript
export const RPC_CONFIG = {
  // Primary: Flashbots Protect (highest success rate)
  primary: 'https://rpc.flashbots.net/fast',

  // Fallback: MEV Blocker (faster response)
  fallback: 'https://rpc.mevblocker.io',

  // Direct builder submission
  titanBuilder: 'https://rpc.titanbuilder.xyz',

  // Public RPC (only for reads, NEVER for writes)
  publicRead: process.env.ETHEREUM_RPC_URL,
};
```

### Step 2: Create Private Transaction Service

**File**: `src/services/private-transaction.service.ts`

```typescript
import { ethers } from 'ethers';
import { RPC_CONFIG } from '../config/rpc-config';

export class PrivateTransactionService {
  private primaryProvider: ethers.JsonRpcProvider;
  private fallbackProvider: ethers.JsonRpcProvider;
  private titanProvider: ethers.JsonRpcProvider;
  private readProvider: ethers.JsonRpcProvider;

  constructor() {
    this.primaryProvider = new ethers.JsonRpcProvider(RPC_CONFIG.primary);
    this.fallbackProvider = new ethers.JsonRpcProvider(RPC_CONFIG.fallback);
    this.titanProvider = new ethers.JsonRpcProvider(RPC_CONFIG.titanBuilder);
    this.readProvider = new ethers.JsonRpcProvider(RPC_CONFIG.publicRead);
  }

  /**
   * Send a private transaction through Flashbots Protect
   */
  async sendPrivateTransaction(
    signedTx: string
  ): Promise<ethers.TransactionResponse> {
    try {
      // Try primary (Flashbots)
      return await this.primaryProvider.broadcastTransaction(signedTx);
    } catch (error) {
      console.warn('Primary RPC failed, trying fallback...');
      // Fallback to MEV Blocker
      return await this.fallbackProvider.broadcastTransaction(signedTx);
    }
  }

  /**
   * Get provider for READ operations only
   */
  getReadProvider(): ethers.JsonRpcProvider {
    return this.readProvider;
  }

  /**
   * Get provider for WRITE operations (private)
   */
  getWriteProvider(): ethers.JsonRpcProvider {
    return this.primaryProvider;
  }
}
```

## 8.3 Layer 2: Titan Builder Bundle Submission

### Step 3: Create Bundle Submission Service

**File**: `src/services/titan-builder.service.ts`

```typescript
import { ethers } from 'ethers';

interface BundleParams {
  txs: string[];                    // Signed transactions
  blockNumber?: string;             // Target block (hex)
  revertingTxHashes?: string[];     // Allowed to revert
  replacementUuid?: string;         // For cancellation
  refundPercent?: number;           // 0-99
  refundRecipient?: string;         // Refund address
}

interface BundleResponse {
  bundleHash: string;
}

interface BundleStats {
  isSimulated: boolean;
  isIncluded: boolean;
  simulatedAt?: string;
  includedBlockNumber?: number;
}

export class TitanBuilderService {
  private readonly RPC_URL = 'https://rpc.titanbuilder.xyz';
  private readonly STATS_URL = 'https://stats.titanbuilder.xyz';

  /**
   * Submit a bundle to Titan Builder
   */
  async sendBundle(params: BundleParams): Promise<BundleResponse> {
    const response = await fetch(this.RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_sendBundle',
        params: [{
          txs: params.txs,
          blockNumber: params.blockNumber,
          revertingTxHashes: params.revertingTxHashes || [],
          droppingTxHashes: [],
          replacementUuid: params.replacementUuid,
          refundPercent: params.refundPercent || 90,
          refundRecipient: params.refundRecipient,
        }],
      }),
    });

    const result = await response.json();

    if (result.error) {
      throw new Error(`Bundle submission failed: ${result.error.message}`);
    }

    return result.result;
  }

  /**
   * Send a single private transaction
   */
  async sendPrivateTransaction(signedTx: string): Promise<number> {
    const response = await fetch(this.RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_sendPrivateTransaction',
        params: [{ tx: signedTx }],
      }),
    });

    const result = await response.json();

    if (result.error) {
      throw new Error(`Private tx failed: ${result.error.message}`);
    }

    return result.result; // Returns 200 on success
  }

  /**
   * Cancel a pending bundle
   */
  async cancelBundle(replacementUuid: string): Promise<boolean> {
    const response = await fetch(this.RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_cancelBundle',
        params: [{ replacementUuid }],
      }),
    });

    const result = await response.json();
    return !result.error;
  }

  /**
   * Get bundle status
   */
  async getBundleStats(bundleHash: string): Promise<BundleStats> {
    const response = await fetch(this.STATS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'titan_getBundleStats',
        params: [{ bundleHash }],
      }),
    });

    const result = await response.json();
    return result.result;
  }
}
```

## 8.4 Layer 3: Arbitrage Execution with Protection

### Step 4: Create Protected Arbitrage Executor

**File**: `src/services/protected-arbitrage.service.ts`

```typescript
import { ethers } from 'ethers';
import { TitanBuilderService } from './titan-builder.service';
import { PrivateTransactionService } from './private-transaction.service';
import { v4 as uuidv4 } from 'uuid';

interface ArbitrageOpportunity {
  id: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  expectedProfit: bigint;
  swaps: SwapParams[];
}

interface SwapParams {
  dex: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  minAmountOut: bigint;
  data: string;
}

export class ProtectedArbitrageService {
  private titanBuilder: TitanBuilderService;
  private privateTx: PrivateTransactionService;
  private wallet: ethers.Wallet;
  private flashLoanContract: ethers.Contract;

  constructor(
    privateKey: string,
    flashLoanAddress: string,
    flashLoanAbi: any[]
  ) {
    this.titanBuilder = new TitanBuilderService();
    this.privateTx = new PrivateTransactionService();

    // Use READ provider for contract reads
    this.wallet = new ethers.Wallet(
      privateKey,
      this.privateTx.getReadProvider()
    );

    this.flashLoanContract = new ethers.Contract(
      flashLoanAddress,
      flashLoanAbi,
      this.wallet
    );
  }

  /**
   * Execute arbitrage with full MEV protection
   */
  async executeProtectedArbitrage(
    opportunity: ArbitrageOpportunity
  ): Promise<string> {
    const bundleUuid = uuidv4();

    try {
      // 1. Build the arbitrage transaction
      const arbTx = await this.buildArbitrageTx(opportunity);

      // 2. Sign the transaction
      const signedTx = await this.wallet.signTransaction(arbTx);

      // 3. Get current block for targeting
      const currentBlock = await this.privateTx
        .getReadProvider()
        .getBlockNumber();
      const targetBlock = `0x${(currentBlock + 1).toString(16)}`;

      // 4. Submit bundle to Titan Builder
      console.log(`Submitting bundle for block ${targetBlock}...`);

      const bundleResult = await this.titanBuilder.sendBundle({
        txs: [signedTx],
        blockNumber: targetBlock,
        replacementUuid: bundleUuid,
        refundPercent: 90, // Get 90% of MEV back
        refundRecipient: this.wallet.address,
      });

      console.log(`Bundle submitted: ${bundleResult.bundleHash}`);

      // 5. Also send to Flashbots as backup
      await this.privateTx.sendPrivateTransaction(signedTx);

      // 6. Monitor for inclusion
      const included = await this.waitForInclusion(
        bundleResult.bundleHash,
        5 // Wait up to 5 blocks
      );

      if (included) {
        console.log('Arbitrage executed successfully!');
        return bundleResult.bundleHash;
      } else {
        // Cancel and retry with next block
        await this.titanBuilder.cancelBundle(bundleUuid);
        throw new Error('Bundle not included, opportunity may be stale');
      }
    } catch (error) {
      // Always try to cancel on error
      await this.titanBuilder.cancelBundle(bundleUuid).catch(() => {});
      throw error;
    }
  }

  /**
   * Build arbitrage transaction
   */
  private async buildArbitrageTx(
    opportunity: ArbitrageOpportunity
  ): Promise<ethers.TransactionRequest> {
    // Encode arbitrage parameters
    const params = ethers.AbiCoder.defaultAbiCoder().encode(
      ['tuple(bytes32,tuple(address,address,address,uint256,uint256,bytes)[],uint256)'],
      [[
        ethers.id(opportunity.id),
        opportunity.swaps.map(s => [
          s.dex,
          s.tokenIn,
          s.tokenOut,
          s.amountIn,
          s.minAmountOut,
          s.data,
        ]),
        opportunity.expectedProfit,
      ]]
    );

    // Get gas estimate
    const gasEstimate = await this.flashLoanContract.executeArbitrage.estimateGas(
      opportunity.tokenIn,
      opportunity.amountIn,
      params
    );

    // Build transaction with aggressive gas settings
    const feeData = await this.privateTx.getReadProvider().getFeeData();

    return {
      to: await this.flashLoanContract.getAddress(),
      data: this.flashLoanContract.interface.encodeFunctionData(
        'executeArbitrage',
        [opportunity.tokenIn, opportunity.amountIn, params]
      ),
      gasLimit: gasEstimate * 120n / 100n, // 20% buffer
      maxFeePerGas: feeData.maxFeePerGas! * 2n, // 2x current
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas! * 2n,
      nonce: await this.wallet.getNonce(),
      chainId: 1n,
      type: 2,
    };
  }

  /**
   * Wait for bundle inclusion
   */
  private async waitForInclusion(
    bundleHash: string,
    maxBlocks: number
  ): Promise<boolean> {
    for (let i = 0; i < maxBlocks; i++) {
      await new Promise(resolve => setTimeout(resolve, 12000)); // Wait ~1 block

      const stats = await this.titanBuilder.getBundleStats(bundleHash);

      if (stats.isIncluded) {
        return true;
      }
    }

    return false;
  }
}
```

## 8.5 Integration Example

### Step 5: Update Main Execution Flow

**File**: `src/index.ts` (example integration)

```typescript
import { ProtectedArbitrageService } from './services/protected-arbitrage.service';
import { FLASH_LOAN_ABI } from './abis/flash-loan.abi';

async function main() {
  // Initialize protected arbitrage service
  const arbService = new ProtectedArbitrageService(
    process.env.PRIVATE_KEY!,
    process.env.FLASH_LOAN_ADDRESS!,
    FLASH_LOAN_ABI
  );

  // Example: Execute when opportunity detected
  const opportunity = {
    id: 'arb-001',
    tokenIn: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
    tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
    amountIn: ethers.parseEther('10'),
    expectedProfit: ethers.parseEther('0.1'),
    swaps: [
      {
        dex: '0x...UniswapV3Pool',
        tokenIn: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        tokenOut: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
        amountIn: ethers.parseEther('10'),
        minAmountOut: 25000n * 10n ** 6n,
        data: '0x...',
      },
      {
        dex: '0x...SushiSwapRouter',
        tokenIn: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        amountIn: 25000n * 10n ** 6n,
        minAmountOut: ethers.parseEther('10.1'),
        data: '0x...',
      },
    ],
  };

  try {
    const result = await arbService.executeProtectedArbitrage(opportunity);
    console.log(`Success! Bundle hash: ${result}`);
  } catch (error) {
    console.error('Arbitrage failed:', error);
  }
}

main().catch(console.error);
```

---

# 9. Code Examples

## 9.1 Complete cURL Examples for Titan Builder

### Submit Bundle

```bash
curl -X POST https://rpc.titanbuilder.xyz \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "eth_sendBundle",
    "params": [{
      "txs": [
        "0xf86c0a8502540be400825208944bbeeb066ed09b7aed07bf39eee0460dfa261520880de0b6b3a7640000801ca0d3dbf8e....",
        "0xf86c0b8502540be400825208944bbeeb066ed09b7aed07bf39eee0460dfa261520880de0b6b3a7640000801ca0a7f8c1...."
      ],
      "blockNumber": "0x1234567",
      "replacementUuid": "my-unique-bundle-001",
      "refundPercent": 90,
      "refundRecipient": "0xYourWalletAddress"
    }]
  }'
```

### Send Private Transaction

```bash
curl -X POST https://rpc.titanbuilder.xyz \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "eth_sendPrivateTransaction",
    "params": [{
      "tx": "0xf86c0a8502540be400825208944bbeeb066ed09b7aed07bf39eee0460dfa261520880de0b6b3a7640000801ca0d3dbf8e...."
    }]
  }'
```

### Cancel Bundle

```bash
curl -X POST https://rpc.titanbuilder.xyz \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "eth_cancelBundle",
    "params": [{
      "replacementUuid": "my-unique-bundle-001"
    }]
  }'
```

### Check Bundle Status

```bash
curl -X POST https://stats.titanbuilder.xyz \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "titan_getBundleStats",
    "params": [{
      "bundleHash": "0x164d7d41f24b7f333af3b4a70b690cf93f636227165ea2b699fbb7eed09c46c7"
    }]
  }'
```

## 9.2 Flashbots Protect Examples

### Using ethers.js v6

```typescript
import { JsonRpcProvider, Wallet } from 'ethers';

// Create provider pointing to Flashbots Protect
const provider = new JsonRpcProvider('https://rpc.flashbots.net/fast');

// Create wallet
const wallet = new Wallet(PRIVATE_KEY, provider);

// Send transaction - it goes through Flashbots Protect automatically
const tx = await wallet.sendTransaction({
  to: '0xRecipient',
  value: parseEther('1.0'),
  // Important: Must have non-zero priority fee
  maxPriorityFeePerGas: parseUnits('1', 'gwei'),
});

console.log('TX Hash:', tx.hash);
await tx.wait();
```

### Using web3.js

```javascript
const Web3 = require('web3');

const web3 = new Web3('https://rpc.flashbots.net/fast');

const account = web3.eth.accounts.privateKeyToAccount(PRIVATE_KEY);
web3.eth.accounts.wallet.add(account);

const tx = await web3.eth.sendTransaction({
  from: account.address,
  to: '0xRecipient',
  value: web3.utils.toWei('1', 'ether'),
  maxPriorityFeePerGas: web3.utils.toWei('1', 'gwei'),
});
```

---

# 10. Recommendations

## 10.1 Immediate Actions (This Week)

| Priority | Action | Effort | Impact |
|----------|--------|--------|--------|
| 1 | Configure Flashbots Protect as default RPC | 1 hour | High |
| 2 | Add Titan Builder bundle submission | 4 hours | High |
| 3 | Implement fallback RPC strategy | 2 hours | Medium |
| 4 | Set up bundle status monitoring | 2 hours | Medium |

## 10.2 Short-Term (This Month)

| Priority | Action | Effort | Impact |
|----------|--------|--------|--------|
| 1 | Remove Etherscan contract verification | 1 hour | High |
| 2 | Implement MEV refund tracking | 4 hours | Medium |
| 3 | Add multi-builder submission | 8 hours | High |
| 4 | Implement commit-reveal for sensitive ops | 16 hours | Medium |

## 10.3 Long-Term (Future Project)

| Priority | Action | Effort | Impact |
|----------|--------|--------|--------|
| 1 | Rewrite contracts in Huff | 2-4 weeks | Very High |
| 2 | Implement address obfuscation | 1 week | High |
| 3 | Research SUAVE/FHE integration | Ongoing | Future |

## 10.4 Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Private RPC downtime | Low | High | Multi-RPC fallback |
| Bundle not included | Medium | Medium | Multi-builder submission |
| Strategy copied | Medium | High | Obfuscation (future) |
| Titan exclusive deals | Low | Low | Use multiple builders |

---

# 11. Appendices

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| MEV | Maximal Extractable Value - profit from transaction ordering |
| Bundle | Atomic set of transactions submitted together |
| Searcher | Entity that identifies MEV opportunities |
| Builder | Entity that constructs blocks from transactions |
| Proposer | Validator that proposes blocks |
| OFA | Order Flow Auction - auction for transaction ordering rights |
| PBS | Proposer-Builder Separation - protocol design pattern |

## Appendix B: RPC Endpoint Reference

| Service | Endpoint | Rate Limit | Chains |
|---------|----------|------------|--------|
| Flashbots Protect | `https://rpc.flashbots.net/fast` | None | ETH |
| Flashbots (Tor) | `http://protectfbnoqyfgo...onion` | None | ETH |
| MEV Blocker | `https://rpc.mevblocker.io` | None | ETH |
| Titan Builder | `https://rpc.titanbuilder.xyz` | 50/sec | ETH |
| Titan Stats | `https://stats.titanbuilder.xyz` | N/A | ETH |
| Merkle | `https://rpc.merkle.io/<KEY>` | By tier | Multi |

## Appendix C: Block Builder APIs

| Builder | Bundle Method | Private Tx | Refunds |
|---------|---------------|------------|---------|
| Titan | `eth_sendBundle` | Yes | Yes |
| Flashbots | `eth_sendBundle` | Yes | Yes |
| Beaverbuild | `eth_sendBundle` | Yes | Yes |
| BuilderNet | `eth_sendBundle` | Yes | Yes |

## Appendix D: References

### Documentation
- Titan Builder: https://docs.titanbuilder.xyz/
- Flashbots: https://docs.flashbots.net/
- MEV Blocker: https://mevblocker.io/
- Merkle: https://www.merkle.io/

### Market Data
- Relay Scan: https://www.relayscan.io/
- Rated Network: https://explorer.rated.network/builders

### Research
- Builder Dominance Study: https://frontier.tech/builder-dominance-and-searcher-dependence
- Private RPC Benchmark: https://arxiv.org/html/2505.19708v1

---

**Document End**

*This document should be converted to Word format using:*
```bash
pandoc MEV_PROTECTION_AND_TITAN_BUILDER_REPORT.md -o MEV_PROTECTION_AND_TITAN_BUILDER_REPORT.docx
```

*Or open in any Markdown editor and export to .docx*
