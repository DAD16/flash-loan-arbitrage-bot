/**
 * Titan Builder Service
 *
 * Direct integration with Titan Builder for bundle submission
 * and private transaction handling.
 *
 * Titan Builder currently has ~51% market share of Ethereum blocks,
 * making it the most likely builder to include your transactions.
 *
 * API Documentation: https://docs.titanbuilder.xyz/
 */
export interface BundleParams {
    /** Array of signed raw transactions (hex strings) */
    txs: string[];
    /** Target block number (hex). Defaults to next block if not specified */
    blockNumber?: string;
    /** Transaction hashes that are allowed to revert without failing the bundle */
    revertingTxHashes?: string[];
    /** Transaction hashes that can be dropped (but not revert) */
    droppingTxHashes?: string[];
    /** Unique identifier for bundle replacement/cancellation */
    replacementUuid?: string;
    /** Percentage of MEV profit to refund (0-99) */
    refundPercent?: number;
    /** Transaction hashes to use for calculating refund amount */
    refundTxHashes?: string[];
    /** Address to receive MEV refund. Defaults to first tx sender */
    refundRecipient?: string;
}
export interface BundleResponse {
    bundleHash: string;
}
export interface BundleStats {
    isSimulated: boolean;
    isSentToRelay: boolean;
    isIncluded: boolean;
    simulatedAt?: string;
    sentToRelayAt?: string;
    includedBlockNumber?: number;
    includedAt?: string;
    error?: string;
}
export interface PrivateTransactionParams {
    /** Signed raw transaction (hex string) */
    tx: string;
}
export declare class TitanBuilderService {
    private readonly rpcUrl;
    private readonly statsUrl;
    private requestId;
    constructor();
    /**
     * Submit a bundle of transactions to Titan Builder
     *
     * Bundles are atomic - all transactions execute together or none do.
     * This is critical for arbitrage where you need:
     * 1. Flash loan borrow
     * 2. Swap A
     * 3. Swap B
     * 4. Flash loan repay
     *
     * @param params Bundle parameters
     * @returns Bundle hash for tracking
     */
    sendBundle(params: BundleParams): Promise<BundleResponse>;
    /**
     * Send a single private transaction
     *
     * The transaction will be included in a block built by Titan
     * without ever appearing in the public mempool.
     *
     * Note: Titan does NOT support maxBlockNumber parameter
     *
     * @param signedTx Signed raw transaction hex
     * @returns HTTP status code (200 = success)
     */
    sendPrivateTransaction(signedTx: string): Promise<number>;
    /**
     * Cancel a pending bundle using its replacement UUID
     *
     * Use this when:
     * - Opportunity became stale
     * - Better opportunity found
     * - Error in bundle construction
     *
     * @param replacementUuid The UUID used when submitting the bundle
     */
    cancelBundle(replacementUuid: string): Promise<boolean>;
    /**
     * Get status of a submitted bundle
     *
     * Use this to check if your bundle was:
     * - Simulated successfully
     * - Sent to relay
     * - Included in a block
     *
     * @param bundleHash Hash returned from sendBundle
     */
    getBundleStats(bundleHash: string): Promise<BundleStats>;
    /**
     * Submit an end-of-block bundle
     *
     * These bundles are simulated at end-of-block state, useful for:
     * - Liquidations triggered by price movements in the block
     * - Arbitrage opportunities created by other transactions
     *
     * Requires X-Flashbots-Signature header (implement if needed)
     */
    sendEndOfBlockBundle(params: BundleParams): Promise<BundleResponse>;
    /**
     * Wait for bundle inclusion with polling
     *
     * @param bundleHash Bundle hash to monitor
     * @param maxBlocks Maximum blocks to wait
     * @param pollIntervalMs Polling interval in milliseconds
     */
    waitForInclusion(bundleHash: string, maxBlocks?: number, pollIntervalMs?: number): Promise<{
        included: boolean;
        blockNumber?: number;
    }>;
    private rpcCall;
    private sleep;
}
export declare function getTitanBuilder(): TitanBuilderService;
