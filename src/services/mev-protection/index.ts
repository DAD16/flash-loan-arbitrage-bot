/**
 * MEV Protection Services
 *
 * This module provides comprehensive MEV protection for arbitrage execution:
 *
 * ## Components
 *
 * ### RPC Configuration (`rpc-config.ts`)
 * Centralized configuration for all RPC endpoints including:
 * - Flashbots Protect (98.5% front-running protection)
 * - MEV Blocker (faster response, 96.2% protection)
 * - Titan Builder (51% block market share)
 *
 * ### Titan Builder Service (`titan-builder.service.ts`)
 * Direct integration with Titan Builder for:
 * - Bundle submission (`eth_sendBundle`)
 * - Private transactions (`eth_sendPrivateTransaction`)
 * - Bundle cancellation (`eth_cancelBundle`)
 * - Status monitoring (`titan_getBundleStats`)
 *
 * ### Private Transaction Service (`private-transaction.service.ts`)
 * Multi-provider transaction routing with:
 * - Automatic failover between private RPCs
 * - Health monitoring and scoring
 * - Parallel broadcast to all providers
 *
 * ### Protected Arbitrage Service (`protected-arbitrage.service.ts`)
 * High-level arbitrage execution with:
 * - Automatic MEV protection
 * - Multi-builder submission
 * - 90% MEV refunds
 * - Inclusion monitoring
 *
 * ## Quick Start
 *
 * ```typescript
 * import {
 *   createProtectedArbitrageService,
 *   ArbitrageOpportunity
 * } from './services/mev-protection';
 *
 * // Initialize service
 * const arbService = createProtectedArbitrageService(
 *   process.env.PRIVATE_KEY!,
 *   process.env.FLASH_LOAN_ADDRESS!
 * );
 *
 * // Execute protected arbitrage
 * const opportunity: ArbitrageOpportunity = {
 *   id: 'arb-001',
 *   loanToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
 *   loanAmount: ethers.parseEther('10'),
 *   expectedProfit: ethers.parseEther('0.1'),
 *   minProfit: ethers.parseEther('0.05'),
 *   swaps: [...],
 * };
 *
 * const result = await arbService.executeProtectedArbitrage(opportunity);
 * ```
 *
 * ## Architecture
 *
 * ```
 * User Code
 *     |
 *     v
 * ProtectedArbitrageService
 *     |
 *     +---> TitanBuilderService (Bundle submission)
 *     |         |
 *     |         +---> rpc.titanbuilder.xyz
 *     |
 *     +---> PrivateTransactionService (Failover/broadcast)
 *               |
 *               +---> Flashbots Protect
 *               +---> MEV Blocker
 *               +---> Titan Builder
 * ```
 *
 * ## Why This Matters
 *
 * Without protection, your arbitrage transactions are visible in the
 * public mempool for ~12 seconds, allowing:
 *
 * - **Front-running**: Others execute your trade first
 * - **Sandwich attacks**: Your trade gets wrapped with buy/sell orders
 * - **Strategy copying**: Competitors analyze your contract
 *
 * With this module:
 * - Transactions never enter public mempool
 * - Direct submission to block builders
 * - 96-98% protection rate
 * - 90% MEV refunds on captured value
 */

// Core configuration
export { getRpcUrl, RPC_ENDPOINTS, FAILOVER_CONFIG } from './rpc-config';
export type { RPCEndpoint } from './rpc-config';

// Titan Builder integration
export {
  TitanBuilderService,
  getTitanBuilder,
} from './titan-builder.service';
export type {
  BundleParams,
  BundleResponse,
  BundleStats,
  PrivateTransactionParams,
} from './titan-builder.service';

// Private transaction routing
export {
  PrivateTransactionService,
  getPrivateTransactionService,
} from './private-transaction.service';
export type {
  TransactionResult,
  ProviderHealth,
} from './private-transaction.service';

// Protected arbitrage execution
export {
  ProtectedArbitrageService,
  createProtectedArbitrageService,
} from './protected-arbitrage.service';
export type {
  SwapParams,
  ArbitrageOpportunity,
  ExecutionResult,
  ExecutionOptions,
} from './protected-arbitrage.service';

// MEV Protection Manager (toggleable)
export {
  MEVProtectionManager,
  getMEVProtectionManager,
  MEVProtection,
  ChainId,
  CHAIN_CONFIGS,
} from './mev-protection-manager';
export type {
  MEVProtectionConfig,
  ChainConfig,
  ExecutionResult as MEVExecutionResult,
} from './mev-protection-manager';

// Chain-Aware Executor (Ethereum + BSC)
export {
  ChainAwareExecutor,
  createChainAwareExecutor,
} from './chain-aware-executor';
export type {
  ExecutorConfig,
  ArbitrageOpportunity as ChainArbitrageOpportunity,
  SwapParams as ChainSwapParams,
  ExecutionResult as ChainExecutionResult,
} from './chain-aware-executor';
