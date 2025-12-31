/**
 * Shared types for Matrix agents
 */

import { z } from 'zod';
import type { Address, Hash, Hex } from 'viem';

// Chain identifiers
export const ChainIdSchema = z.enum(['ethereum', 'arbitrum', 'optimism', 'base', 'bsc']);
export type ChainId = z.infer<typeof ChainIdSchema>;

export const ChainIdNumber: Record<ChainId, number> = {
  ethereum: 1,
  arbitrum: 42161,
  optimism: 10,
  base: 8453,
  bsc: 56,
};

// DEX identifiers
export const DexIdSchema = z.enum([
  'uniswap_v3',
  'sushiswap',
  'curve',
  'balancer',
  'pancakeswap',
  'camelot',
  'velodrome',
  'aerodrome',
]);
export type DexId = z.infer<typeof DexIdSchema>;

// Price update from data feed
export interface PriceUpdate {
  timestampMs: number;
  chain: ChainId;
  dex: DexId;
  pool: Address;
  token0: Address;
  token1: Address;
  reserve0: bigint;
  reserve1: bigint;
  price: bigint; // token0 price in terms of token1 (18 decimals)
}

// Arbitrage opportunity
export interface Opportunity {
  id: bigint;
  timestampMs: number;
  chain: ChainId;
  profitWei: bigint;
  gasEstimate: bigint;
  path: SwapStep[];
  flashLoanToken: Address;
  flashLoanAmount: bigint;
}

// Single swap step in arbitrage path
export interface SwapStep {
  dex: DexId;
  pool: Address;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  amountOut: bigint;
}

// Execution result
export interface ExecutionResult {
  opportunityId: bigint;
  txHash: Hash;
  success: boolean;
  actualProfit: bigint;
  gasUsed: bigint;
  blockNumber: bigint;
  timestampMs: number;
}

// Agent status
export const AgentStatusSchema = z.enum([
  'starting',
  'running',
  'degraded',
  'stopping',
  'stopped',
  'failed',
]);
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

// Agent health
export interface AgentHealth {
  name: string;
  status: AgentStatus;
  lastHeartbeatMs: number;
  errorCount: number;
  metrics: Record<string, number>;
}

// Pending transaction from mempool
export interface PendingTransaction {
  hash: Hash;
  from: Address;
  to: Address;
  value: bigint;
  data: Hex;
  gasPrice: bigint;
  gasLimit: bigint;
  nonce: number;
  chainId: number;
  timestampMs: number;
}

// MEV opportunity type
export const MevTypeSchema = z.enum([
  'arbitrage',
  'liquidation',
  'backrun',
  'sandwich',
]);
export type MevType = z.infer<typeof MevTypeSchema>;

// MEV opportunity detected
export interface MevOpportunity {
  type: MevType;
  targetTx: PendingTransaction;
  estimatedProfit: bigint;
  gasRequired: bigint;
  deadline: number;
  confidence: number; // 0-1
}
