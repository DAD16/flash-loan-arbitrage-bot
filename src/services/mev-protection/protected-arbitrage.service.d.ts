/**
 * Protected Arbitrage Service
 *
 * Executes arbitrage opportunities with full MEV protection:
 * 1. Routes through private mempools (no public exposure)
 * 2. Submits bundles directly to Titan Builder
 * 3. Uses atomic bundle execution (all-or-nothing)
 * 4. Provides MEV refunds (90% of captured value)
 *
 * Usage:
 * ```typescript
 * const arbService = new ProtectedArbitrageService(privateKey, contractAddress);
 * const result = await arbService.executeProtectedArbitrage(opportunity);
 * ```
 */
export interface SwapParams {
    /** DEX pool or router address */
    dex: string;
    /** Input token address */
    tokenIn: string;
    /** Output token address */
    tokenOut: string;
    /** Input amount in wei */
    amountIn: bigint;
    /** Minimum output amount in wei */
    minAmountOut: bigint;
    /** Encoded swap calldata */
    data: string;
}
export interface ArbitrageOpportunity {
    /** Unique identifier for tracking */
    id: string;
    /** Flash loan token address */
    loanToken: string;
    /** Flash loan amount in wei */
    loanAmount: bigint;
    /** Expected profit in wei */
    expectedProfit: bigint;
    /** Minimum acceptable profit in wei */
    minProfit: bigint;
    /** Array of swaps to execute */
    swaps: SwapParams[];
    /** Maximum gas price willing to pay */
    maxGasPrice?: bigint;
    /** Deadline timestamp */
    deadline?: number;
}
export interface ExecutionResult {
    success: boolean;
    bundleHash?: string;
    transactionHash?: string;
    blockNumber?: number;
    gasUsed?: bigint;
    actualProfit?: bigint;
    provider?: string;
    error?: string;
}
export interface ExecutionOptions {
    /** Submit to multiple builders simultaneously */
    multiBuilder?: boolean;
    /** Wait for inclusion confirmation */
    waitForInclusion?: boolean;
    /** Maximum blocks to wait for inclusion */
    maxWaitBlocks?: number;
    /** Gas price multiplier (default 1.5x) */
    gasPriceMultiplier?: number;
    /** MEV refund percentage (0-99) */
    refundPercent?: number;
}
export declare class ProtectedArbitrageService {
    private titanBuilder;
    private privateTx;
    private wallet;
    private readWallet;
    private flashLoanContract;
    private contractAddress;
    constructor(privateKey: string, flashLoanContractAddress: string, flashLoanAbi?: any[]);
    /**
     * Execute arbitrage with full MEV protection
     *
     * This is the main entry point for protected arbitrage execution.
     * It handles:
     * - Transaction building and signing
     * - Bundle submission to Titan Builder
     * - Fallback to private RPCs
     * - Inclusion monitoring
     *
     * @param opportunity The arbitrage opportunity to execute
     * @param options Execution options
     */
    executeProtectedArbitrage(opportunity: ArbitrageOpportunity, options?: ExecutionOptions): Promise<ExecutionResult>;
    /**
     * Execute multiple arbitrage opportunities as atomic bundle
     *
     * All opportunities execute together or none do.
     * Useful for related opportunities that depend on each other.
     *
     * @param opportunities Array of opportunities
     * @param options Execution options
     */
    executeMultipleArbitrage(opportunities: ArbitrageOpportunity[], options?: ExecutionOptions): Promise<ExecutionResult>;
    /**
     * Check if wallet is authorized to execute on contract
     */
    isAuthorized(): Promise<boolean>;
    /**
     * Get current wallet address
     */
    getWalletAddress(): string;
    /**
     * Build arbitrage transaction
     */
    private buildArbitrageTransaction;
    /**
     * Encode arbitrage parameters for contract call
     */
    private encodeArbitrageParams;
}
/**
 * Create a protected arbitrage service
 *
 * @param privateKey Wallet private key
 * @param flashLoanAddress FlashLoanReceiver contract address
 * @param abi Optional custom ABI
 */
export declare function createProtectedArbitrageService(privateKey: string, flashLoanAddress: string, abi?: any[]): ProtectedArbitrageService;
