/**
 * MEV Protection Manager
 *
 * Toggleable MEV protection with chain-aware routing:
 * - Ethereum: Uses Titan Builder + Flashbots Protect
 * - BSC/Other: Falls back to standard RPC (relies on contract obfuscation)
 *
 * Usage:
 * ```typescript
 * const manager = new MEVProtectionManager();
 *
 * // Enable/disable Titan Builder
 * manager.setTitanBuilderEnabled(true);
 *
 * // Execute with automatic chain detection
 * await manager.executeTransaction(signedTx, chainId);
 * ```
 */

import { ethers } from 'ethers';
import { getTitanBuilder, BundleParams } from './titan-builder.service';
import { getPrivateTransactionService } from './private-transaction.service';

// ============ Types ============

export enum ChainId {
  ETHEREUM = 1,
  BSC = 56,
  POLYGON = 137,
  ARBITRUM = 42161,
  BASE = 8453,
  OPTIMISM = 10,
}

export interface MEVProtectionConfig {
  /** Enable Titan Builder for Ethereum */
  titanBuilderEnabled: boolean;
  /** Enable Flashbots Protect for Ethereum */
  flashbotsEnabled: boolean;
  /** Enable MEV Blocker for Ethereum */
  mevBlockerEnabled: boolean;
  /** Use multi-builder broadcast on Ethereum */
  multiBuilderEnabled: boolean;
  /** MEV refund percentage (0-99) */
  refundPercent: number;
  /** Log all operations */
  verbose: boolean;
}

export interface ExecutionResult {
  success: boolean;
  hash?: string;
  bundleHash?: string;
  method: 'titan-bundle' | 'titan-private' | 'flashbots' | 'mev-blocker' | 'standard-rpc';
  chainId: number;
  error?: string;
}

export interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  supportsMEVProtection: boolean;
  explorerUrl: string;
}

// ============ Chain Configurations ============

export const CHAIN_CONFIGS: Record<number, ChainConfig> = {
  [ChainId.ETHEREUM]: {
    chainId: 1,
    name: 'Ethereum',
    rpcUrl: process.env.ETHEREUM_RPC_URL || 'https://eth.llamarpc.com',
    supportsMEVProtection: true,
    explorerUrl: 'https://etherscan.io',
  },
  [ChainId.BSC]: {
    chainId: 56,
    name: 'BNB Smart Chain',
    rpcUrl: process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org',
    supportsMEVProtection: false, // No Titan/Flashbots on BSC
    explorerUrl: 'https://bscscan.com',
  },
  [ChainId.POLYGON]: {
    chainId: 137,
    name: 'Polygon',
    rpcUrl: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
    supportsMEVProtection: false,
    explorerUrl: 'https://polygonscan.com',
  },
  [ChainId.ARBITRUM]: {
    chainId: 42161,
    name: 'Arbitrum',
    rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    supportsMEVProtection: false, // Limited MEV on L2
    explorerUrl: 'https://arbiscan.io',
  },
  [ChainId.BASE]: {
    chainId: 8453,
    name: 'Base',
    rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
    supportsMEVProtection: false,
    explorerUrl: 'https://basescan.org',
  },
};

// ============ MEV Protection Manager ============

export class MEVProtectionManager {
  private config: MEVProtectionConfig;
  private titanBuilder = getTitanBuilder();
  private privateTx = getPrivateTransactionService();
  private chainProviders: Map<number, ethers.JsonRpcProvider> = new Map();

  constructor(config?: Partial<MEVProtectionConfig>) {
    this.config = {
      titanBuilderEnabled: true,
      flashbotsEnabled: true,
      mevBlockerEnabled: true,
      multiBuilderEnabled: true,
      refundPercent: 90,
      verbose: false,
      ...config,
    };

    // Initialize providers for each chain
    for (const [chainId, chainConfig] of Object.entries(CHAIN_CONFIGS)) {
      this.chainProviders.set(
        Number(chainId),
        new ethers.JsonRpcProvider(chainConfig.rpcUrl)
      );
    }
  }

  // ============ Toggle Controls ============

  /**
   * Enable or disable Titan Builder
   */
  setTitanBuilderEnabled(enabled: boolean): void {
    this.config.titanBuilderEnabled = enabled;
    this.log(`Titan Builder ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }

  /**
   * Enable or disable Flashbots Protect
   */
  setFlashbotsEnabled(enabled: boolean): void {
    this.config.flashbotsEnabled = enabled;
    this.log(`Flashbots Protect ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }

  /**
   * Enable or disable MEV Blocker
   */
  setMEVBlockerEnabled(enabled: boolean): void {
    this.config.mevBlockerEnabled = enabled;
    this.log(`MEV Blocker ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }

  /**
   * Enable or disable multi-builder broadcast
   */
  setMultiBuilderEnabled(enabled: boolean): void {
    this.config.multiBuilderEnabled = enabled;
    this.log(`Multi-Builder ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }

  /**
   * Set MEV refund percentage (0-99)
   */
  setRefundPercent(percent: number): void {
    if (percent < 0 || percent > 99) {
      throw new Error('Refund percent must be 0-99');
    }
    this.config.refundPercent = percent;
    this.log(`Refund percent set to ${percent}%`);
  }

  /**
   * Enable or disable verbose logging
   */
  setVerbose(verbose: boolean): void {
    this.config.verbose = verbose;
  }

  /**
   * Get current configuration
   */
  getConfig(): MEVProtectionConfig {
    return { ...this.config };
  }

  /**
   * Check if MEV protection is available for a chain
   */
  isMEVProtectionAvailable(chainId: number): boolean {
    const chainConfig = CHAIN_CONFIGS[chainId];
    if (!chainConfig) return false;

    return (
      chainConfig.supportsMEVProtection &&
      (this.config.titanBuilderEnabled ||
        this.config.flashbotsEnabled ||
        this.config.mevBlockerEnabled)
    );
  }

  // ============ Execution Methods ============

  /**
   * Execute a single transaction with appropriate MEV protection
   *
   * Automatically routes based on chain and configuration:
   * - Ethereum + Titan enabled: Bundle submission
   * - Ethereum + Flashbots enabled: Private mempool
   * - Other chains: Standard RPC (use contract obfuscation!)
   */
  async executeTransaction(
    signedTx: string,
    chainId: number
  ): Promise<ExecutionResult> {
    const chainConfig = CHAIN_CONFIGS[chainId];

    if (!chainConfig) {
      return {
        success: false,
        method: 'standard-rpc',
        chainId,
        error: `Unsupported chain: ${chainId}`,
      };
    }

    // Ethereum with MEV protection
    if (chainId === ChainId.ETHEREUM && this.isMEVProtectionAvailable(chainId)) {
      return this.executeWithMEVProtection(signedTx);
    }

    // Other chains - standard RPC
    return this.executeStandardRPC(signedTx, chainId);
  }

  /**
   * Execute a bundle of transactions (Ethereum only)
   */
  async executeBundle(
    signedTxs: string[],
    chainId: number,
    options?: {
      targetBlock?: string;
      replacementUuid?: string;
    }
  ): Promise<ExecutionResult> {
    if (chainId !== ChainId.ETHEREUM) {
      return {
        success: false,
        method: 'standard-rpc',
        chainId,
        error: 'Bundle execution only supported on Ethereum',
      };
    }

    if (!this.config.titanBuilderEnabled) {
      return {
        success: false,
        method: 'standard-rpc',
        chainId,
        error: 'Titan Builder disabled - cannot submit bundles',
      };
    }

    try {
      // Get target block if not specified
      let targetBlock = options?.targetBlock;
      if (!targetBlock) {
        const provider = this.chainProviders.get(ChainId.ETHEREUM)!;
        const currentBlock = await provider.getBlockNumber();
        targetBlock = `0x${(currentBlock + 1).toString(16)}`;
      }

      const bundleParams: BundleParams = {
        txs: signedTxs,
        blockNumber: targetBlock,
        replacementUuid: options?.replacementUuid,
        refundPercent: this.config.refundPercent,
      };

      const result = await this.titanBuilder.sendBundle(bundleParams);

      this.log(`Bundle submitted: ${result.bundleHash}`);

      return {
        success: true,
        bundleHash: result.bundleHash,
        method: 'titan-bundle',
        chainId,
      };
    } catch (error) {
      return {
        success: false,
        method: 'titan-bundle',
        chainId,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Get provider for a specific chain
   */
  getProvider(chainId: number): ethers.JsonRpcProvider | undefined {
    return this.chainProviders.get(chainId);
  }

  /**
   * Add or update a chain configuration
   */
  addChainConfig(config: ChainConfig): void {
    CHAIN_CONFIGS[config.chainId] = config;
    this.chainProviders.set(
      config.chainId,
      new ethers.JsonRpcProvider(config.rpcUrl)
    );
  }

  // ============ Private Methods ============

  /**
   * Execute with Ethereum MEV protection
   */
  private async executeWithMEVProtection(
    signedTx: string
  ): Promise<ExecutionResult> {
    const tx = ethers.Transaction.from(signedTx);

    // Strategy 1: Titan Builder bundle (single tx)
    if (this.config.titanBuilderEnabled) {
      try {
        const provider = this.chainProviders.get(ChainId.ETHEREUM)!;
        const currentBlock = await provider.getBlockNumber();
        const targetBlock = `0x${(currentBlock + 1).toString(16)}`;

        const bundleResult = await this.titanBuilder.sendBundle({
          txs: [signedTx],
          blockNumber: targetBlock,
          refundPercent: this.config.refundPercent,
        });

        this.log(`Titan bundle: ${bundleResult.bundleHash}`);

        // Also broadcast to other providers if multi-builder enabled
        if (this.config.multiBuilderEnabled) {
          this.broadcastToOtherProviders(signedTx).catch(() => {});
        }

        return {
          success: true,
          hash: tx.hash!,
          bundleHash: bundleResult.bundleHash,
          method: 'titan-bundle',
          chainId: ChainId.ETHEREUM,
        };
      } catch (error) {
        this.log(`Titan failed: ${(error as Error).message}, trying fallback`);
      }
    }

    // Strategy 2: Private transaction via Flashbots/MEV Blocker
    if (this.config.flashbotsEnabled || this.config.mevBlockerEnabled) {
      try {
        const result = await this.privateTx.sendPrivateTransaction(signedTx);

        this.log(`Private tx via ${result.provider}: ${result.hash}`);

        return {
          success: true,
          hash: result.hash,
          method: 'flashbots',
          chainId: ChainId.ETHEREUM,
        };
      } catch (error) {
        this.log(`Private tx failed: ${(error as Error).message}`);
      }
    }

    // Strategy 3: Fall back to standard RPC
    return this.executeStandardRPC(signedTx, ChainId.ETHEREUM);
  }

  /**
   * Execute via standard RPC (no MEV protection)
   */
  private async executeStandardRPC(
    signedTx: string,
    chainId: number
  ): Promise<ExecutionResult> {
    const provider = this.chainProviders.get(chainId);

    if (!provider) {
      return {
        success: false,
        method: 'standard-rpc',
        chainId,
        error: `No provider for chain ${chainId}`,
      };
    }

    try {
      const txResponse = await provider.broadcastTransaction(signedTx);

      this.log(`Standard RPC tx: ${txResponse.hash}`);

      // WARN: No MEV protection on this chain!
      if (!CHAIN_CONFIGS[chainId]?.supportsMEVProtection) {
        console.warn(
          `[MEV WARNING] Chain ${chainId} has no MEV protection. ` +
            `Ensure contract-level obfuscation is enabled!`
        );
      }

      return {
        success: true,
        hash: txResponse.hash,
        method: 'standard-rpc',
        chainId,
      };
    } catch (error) {
      return {
        success: false,
        method: 'standard-rpc',
        chainId,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Broadcast to other MEV protection providers
   */
  private async broadcastToOtherProviders(signedTx: string): Promise<void> {
    const promises: Promise<any>[] = [];

    if (this.config.flashbotsEnabled) {
      promises.push(
        this.privateTx.sendPrivateTransaction(signedTx).catch(() => {})
      );
    }

    await Promise.allSettled(promises);
  }

  private log(message: string): void {
    if (this.config.verbose) {
      console.log(`[MEVProtection] ${message}`);
    }
  }
}

// ============ Singleton Export ============

let instance: MEVProtectionManager | null = null;

export function getMEVProtectionManager(
  config?: Partial<MEVProtectionConfig>
): MEVProtectionManager {
  if (!instance) {
    instance = new MEVProtectionManager(config);
  }
  return instance;
}

/**
 * Quick toggle functions for convenience
 */
export const MEVProtection = {
  enable: () => getMEVProtectionManager().setTitanBuilderEnabled(true),
  disable: () => getMEVProtectionManager().setTitanBuilderEnabled(false),
  isEnabled: () => getMEVProtectionManager().getConfig().titanBuilderEnabled,
  getManager: getMEVProtectionManager,
};
