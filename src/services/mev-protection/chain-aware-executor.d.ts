/**
 * Chain-Aware Arbitrage Executor
 *
 * Automatically selects the best execution strategy based on chain:
 *
 * ETHEREUM (Chain 1):
 * - Titan Builder bundles (when enabled)
 * - Flashbots Protect fallback
 * - Standard contracts (FlashLoanReceiver.sol)
 *
 * BSC (Chain 56) & OTHER CHAINS:
 * - Obfuscated contracts (FlashLoanReceiverObfuscated.sol)
 * - Commit-reveal pattern for time-sensitive trades
 * - Standard RPC (no private mempool available)
 *
 * Usage:
 * ```typescript
 * const executor = new ChainAwareExecutor(config);
 *
 * // Toggle Titan Builder
 * executor.setTitanBuilderEnabled(true);
 *
 * // Execute on any chain
 * await executor.executeArbitrage(opportunity, ChainId.BSC);
 * ```
 */
import { MEVProtectionConfig } from './mev-protection-manager';
export interface ExecutorConfig {
    /** Private key for signing transactions */
    privateKey: string;
    /** Contract addresses per chain */
    contracts: {
        [chainId: number]: {
            /** Standard or obfuscated flash loan receiver */
            flashLoanReceiver: string;
            /** Whether this contract is obfuscated */
            isObfuscated: boolean;
            /** XOR key if obfuscated (for encoding) */
            xorKey?: string;
            /** Access salt if obfuscated */
            accessSalt?: string;
        };
    };
    /** MEV protection settings */
    mevProtection?: Partial<MEVProtectionConfig>;
}
export interface ArbitrageOpportunity {
    id: string;
    chainId: number;
    loanToken: string;
    loanAmount: bigint;
    expectedProfit: bigint;
    minProfit: bigint;
    swaps: SwapParams[];
    poolIndex?: number;
    deadline?: number;
}
export interface SwapParams {
    dex: string;
    routerIndex?: number;
    tokenIn: string;
    tokenOut: string;
    amountIn: bigint;
    minAmountOut: bigint;
    data?: string;
}
export interface ExecutionResult {
    success: boolean;
    chainId: number;
    method: 'titan-bundle' | 'private-rpc' | 'commit-reveal' | 'direct';
    transactionHash?: string;
    bundleHash?: string;
    commitmentId?: string;
    blockNumber?: number;
    gasUsed?: bigint;
    error?: string;
}
export declare class ChainAwareExecutor {
    private config;
    private mevManager;
    private titanBuilder;
    private wallets;
    private providers;
    private standardABI;
    constructor(config: ExecutorConfig);
    /**
     * Enable or disable Titan Builder for Ethereum
     */
    setTitanBuilderEnabled(enabled: boolean): void;
    /**
     * Check if Titan Builder is enabled
     */
    isTitanBuilderEnabled(): boolean;
    /**
     * Enable or disable commit-reveal for BSC
     * (Always recommended for BSC due to no private mempool)
     */
    private useCommitReveal;
    setCommitRevealEnabled(enabled: boolean): void;
    /**
     * Execute arbitrage with chain-appropriate strategy
     */
    executeArbitrage(opportunity: ArbitrageOpportunity): Promise<ExecutionResult>;
    private executeEthereum;
    private executeObfuscated;
    /**
     * Execute with commit-reveal pattern
     * Phase 1: Submit commitment (hides intent)
     * Phase 2: Wait for blocks
     * Phase 3: Reveal and execute
     */
    private executeWithCommitReveal;
    /**
     * Direct execution on obfuscated contract (faster but less protected)
     */
    private executeObfuscatedDirect;
    /**
     * Standard execution (non-obfuscated, non-Ethereum)
     */
    private executeDirect;
    private encodeStandardParams;
    private encodeObfuscatedParams;
    private waitBlocks;
    /**
     * Get wallet address for a chain
     */
    getWalletAddress(chainId: number): string | undefined;
    /**
     * Get current balance on a chain
     */
    getBalance(chainId: number, token?: string): Promise<bigint>;
}
export declare function createChainAwareExecutor(config: ExecutorConfig): ChainAwareExecutor;
