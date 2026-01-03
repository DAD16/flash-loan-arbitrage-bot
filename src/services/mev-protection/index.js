"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.createChainAwareExecutor = exports.ChainAwareExecutor = exports.CHAIN_CONFIGS = exports.ChainId = exports.MEVProtection = exports.getMEVProtectionManager = exports.MEVProtectionManager = exports.createProtectedArbitrageService = exports.ProtectedArbitrageService = exports.getPrivateTransactionService = exports.PrivateTransactionService = exports.getTitanBuilder = exports.TitanBuilderService = exports.FAILOVER_CONFIG = exports.RPC_ENDPOINTS = exports.getRpcUrl = void 0;
// Core configuration
var rpc_config_1 = require("./rpc-config");
Object.defineProperty(exports, "getRpcUrl", { enumerable: true, get: function () { return rpc_config_1.getRpcUrl; } });
Object.defineProperty(exports, "RPC_ENDPOINTS", { enumerable: true, get: function () { return rpc_config_1.RPC_ENDPOINTS; } });
Object.defineProperty(exports, "FAILOVER_CONFIG", { enumerable: true, get: function () { return rpc_config_1.FAILOVER_CONFIG; } });
// Titan Builder integration
var titan_builder_service_1 = require("./titan-builder.service");
Object.defineProperty(exports, "TitanBuilderService", { enumerable: true, get: function () { return titan_builder_service_1.TitanBuilderService; } });
Object.defineProperty(exports, "getTitanBuilder", { enumerable: true, get: function () { return titan_builder_service_1.getTitanBuilder; } });
// Private transaction routing
var private_transaction_service_1 = require("./private-transaction.service");
Object.defineProperty(exports, "PrivateTransactionService", { enumerable: true, get: function () { return private_transaction_service_1.PrivateTransactionService; } });
Object.defineProperty(exports, "getPrivateTransactionService", { enumerable: true, get: function () { return private_transaction_service_1.getPrivateTransactionService; } });
// Protected arbitrage execution
var protected_arbitrage_service_1 = require("./protected-arbitrage.service");
Object.defineProperty(exports, "ProtectedArbitrageService", { enumerable: true, get: function () { return protected_arbitrage_service_1.ProtectedArbitrageService; } });
Object.defineProperty(exports, "createProtectedArbitrageService", { enumerable: true, get: function () { return protected_arbitrage_service_1.createProtectedArbitrageService; } });
// MEV Protection Manager (toggleable)
var mev_protection_manager_1 = require("./mev-protection-manager");
Object.defineProperty(exports, "MEVProtectionManager", { enumerable: true, get: function () { return mev_protection_manager_1.MEVProtectionManager; } });
Object.defineProperty(exports, "getMEVProtectionManager", { enumerable: true, get: function () { return mev_protection_manager_1.getMEVProtectionManager; } });
Object.defineProperty(exports, "MEVProtection", { enumerable: true, get: function () { return mev_protection_manager_1.MEVProtection; } });
Object.defineProperty(exports, "ChainId", { enumerable: true, get: function () { return mev_protection_manager_1.ChainId; } });
Object.defineProperty(exports, "CHAIN_CONFIGS", { enumerable: true, get: function () { return mev_protection_manager_1.CHAIN_CONFIGS; } });
// Chain-Aware Executor (Ethereum + BSC)
var chain_aware_executor_1 = require("./chain-aware-executor");
Object.defineProperty(exports, "ChainAwareExecutor", { enumerable: true, get: function () { return chain_aware_executor_1.ChainAwareExecutor; } });
Object.defineProperty(exports, "createChainAwareExecutor", { enumerable: true, get: function () { return chain_aware_executor_1.createChainAwareExecutor; } });
