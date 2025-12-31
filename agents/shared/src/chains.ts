/**
 * Chain configuration and utilities
 */

import type { Address } from 'viem';
import type { ChainId } from './types.js';

export interface ChainConfig {
  id: ChainId;
  chainId: number;
  name: string;
  rpcUrl: string;
  wsUrl: string;
  blockTimeMs: number;
  flashLoanProvider: 'aave_v3' | 'pancakeswap' | 'dydx';
  flashLoanContract: Address;
  nativeToken: {
    symbol: string;
    decimals: number;
  };
  explorer: string;
}

export const CHAIN_CONFIGS: Record<ChainId, ChainConfig> = {
  ethereum: {
    id: 'ethereum',
    chainId: 1,
    name: 'Ethereum Mainnet',
    rpcUrl: process.env.ETH_RPC_URL || 'https://eth.llamarpc.com',
    wsUrl: process.env.ETH_WS_URL || 'wss://eth.llamarpc.com',
    blockTimeMs: 12000,
    flashLoanProvider: 'aave_v3',
    flashLoanContract: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2' as Address, // Aave V3 Pool
    nativeToken: { symbol: 'ETH', decimals: 18 },
    explorer: 'https://etherscan.io',
  },
  arbitrum: {
    id: 'arbitrum',
    chainId: 42161,
    name: 'Arbitrum One',
    rpcUrl: process.env.ARB_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    wsUrl: process.env.ARB_WS_URL || 'wss://arb1.arbitrum.io/ws',
    blockTimeMs: 250,
    flashLoanProvider: 'aave_v3',
    flashLoanContract: '0x794a61358D6845594F94dc1DB02A252b5b4814aD' as Address,
    nativeToken: { symbol: 'ETH', decimals: 18 },
    explorer: 'https://arbiscan.io',
  },
  optimism: {
    id: 'optimism',
    chainId: 10,
    name: 'Optimism',
    rpcUrl: process.env.OP_RPC_URL || 'https://mainnet.optimism.io',
    wsUrl: process.env.OP_WS_URL || 'wss://mainnet.optimism.io',
    blockTimeMs: 2000,
    flashLoanProvider: 'aave_v3',
    flashLoanContract: '0x794a61358D6845594F94dc1DB02A252b5b4814aD' as Address,
    nativeToken: { symbol: 'ETH', decimals: 18 },
    explorer: 'https://optimistic.etherscan.io',
  },
  base: {
    id: 'base',
    chainId: 8453,
    name: 'Base',
    rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
    wsUrl: process.env.BASE_WS_URL || 'wss://mainnet.base.org',
    blockTimeMs: 2000,
    flashLoanProvider: 'aave_v3',
    flashLoanContract: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5' as Address,
    nativeToken: { symbol: 'ETH', decimals: 18 },
    explorer: 'https://basescan.org',
  },
  bsc: {
    id: 'bsc',
    chainId: 56,
    name: 'BNB Smart Chain',
    rpcUrl: process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org',
    wsUrl: process.env.BSC_WS_URL || 'wss://bsc-ws-node.nariox.org',
    blockTimeMs: 3000,
    flashLoanProvider: 'pancakeswap',
    flashLoanContract: '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4' as Address,
    nativeToken: { symbol: 'BNB', decimals: 18 },
    explorer: 'https://bscscan.com',
  },
};

export function getChainConfig(chainId: ChainId): ChainConfig {
  return CHAIN_CONFIGS[chainId];
}

export function getChainById(numericId: number): ChainConfig | undefined {
  return Object.values(CHAIN_CONFIGS).find((c) => c.chainId === numericId);
}

export function getAllChains(): ChainConfig[] {
  return Object.values(CHAIN_CONFIGS);
}
