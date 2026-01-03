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
export declare enum ChainId {
    ETHEREUM = 1,
    BSC = 56,
    POLYGON = 137,
    ARBITRUM = 42161,
    BASE = 8453,
    OPTIMISM = 10
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
export declare const CHAIN_CONFIGS: Record<number, ChainConfig>;
export declare class MEVProtectionManager {
    private config;
    private titanBuilder;
    private privateTx;
    private chainProviders;
    constructor(config?: Partial<MEVProtectionConfig>);
    /**
     * Enable or disable Titan Builder
     */
    setTitanBuilderEnabled(enabled: boolean): void;
    /**
     * Enable or disable Flashbots Protect
     */
    setFlashbotsEnabled(enabled: boolean): void;
    /**
     * Enable or disable MEV Blocker
     */
    setMEVBlockerEnabled(enabled: boolean): void;
    /**
     * Enable or disable multi-builder broadcast
     */
    setMultiBuilderEnabled(enabled: boolean): void;
    /**
     * Set MEV refund percentage (0-99)
     */
    setRefundPercent(percent: number): void;
    /**
     * Enable or disable verbose logging
     */
    setVerbose(verbose: boolean): void;
    /**
     * Get current configuration
     */
    getConfig(): MEVProtectionConfig;
    /**
     * Check if MEV protection is available for a chain
     */
    isMEVProtectionAvailable(chainId: number): boolean;
    /**
     * Execute a single transaction with appropriate MEV protection
     *
     * Automatically routes based on chain and configuration:
     * - Ethereum + Titan enabled: Bundle submission
     * - Ethereum + Flashbots enabled: Private mempool
     * - Other chains: Standard RPC (use contract obfuscation!)
     */
    executeTransaction(signedTx: string, chainId: number): Promise<ExecutionResult>;
    /**
     * Execute a bundle of transactions (Ethereum only)
     */
    executeBundle(signedTxs: string[], chainId: number, options?: {
        targetBlock?: string;
        replacementUuid?: string;
    }): Promise<ExecutionResult>;
    /**
     * Get provider for a specific chain
     */
    getProvider(chainId: number): ethers.JsonRpcProvider | undefined;
    /**
     * Add or update a chain configuration
     */
    addChainConfig(config: ChainConfig): void;
    /**
     * Execute with Ethereum MEV protection
     */
    private executeWithMEVProtection;
    /**
     * Execute via standard RPC (no MEV protection)
     */
    private executeStandardRPC;
    /**
     * Broadcast to other MEV protection providers
     */
    private broadcastToOtherProviders;
    private log;
}
export declare function getMEVProtectionManager(config?: Partial<MEVProtectionConfig>): MEVProtectionManager;
/**
 * Quick toggle functions for convenience
 */
export declare const MEVProtection: {
    enable: () => void;
    disable: () => void;
    isEnabled: () => boolean;
    getManager: typeof getMEVProtectionManager;
};
