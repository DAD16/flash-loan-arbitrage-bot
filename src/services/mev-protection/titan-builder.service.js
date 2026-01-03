"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TitanBuilderService = void 0;
exports.getTitanBuilder = getTitanBuilder;
const rpc_config_1 = require("./rpc-config");
// ============ Service ============
class TitanBuilderService {
    rpcUrl;
    statsUrl;
    requestId = 0;
    constructor() {
        this.rpcUrl = rpc_config_1.RPC_ENDPOINTS.titanBuilder.url;
        this.statsUrl = rpc_config_1.RPC_ENDPOINTS.titanStats.url;
    }
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
    async sendBundle(params) {
        const response = await this.rpcCall('eth_sendBundle', [
            {
                txs: params.txs,
                blockNumber: params.blockNumber,
                revertingTxHashes: params.revertingTxHashes || [],
                droppingTxHashes: params.droppingTxHashes || [],
                replacementUuid: params.replacementUuid,
                refundPercent: params.refundPercent ?? 90,
                refundTxHashes: params.refundTxHashes || [],
                refundRecipient: params.refundRecipient,
            },
        ]);
        return response;
    }
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
    async sendPrivateTransaction(signedTx) {
        const response = await this.rpcCall('eth_sendPrivateTransaction', [
            { tx: signedTx },
        ]);
        return response;
    }
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
    async cancelBundle(replacementUuid) {
        try {
            await this.rpcCall('eth_cancelBundle', [{ replacementUuid }]);
            return true;
        }
        catch {
            return false;
        }
    }
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
    async getBundleStats(bundleHash) {
        const response = await fetch(this.statsUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: ++this.requestId,
                method: 'titan_getBundleStats',
                params: [{ bundleHash }],
            }),
        });
        const result = await response.json();
        if (result.error) {
            throw new Error(`Bundle stats error: ${result.error.message}`);
        }
        return result.result;
    }
    /**
     * Submit an end-of-block bundle
     *
     * These bundles are simulated at end-of-block state, useful for:
     * - Liquidations triggered by price movements in the block
     * - Arbitrage opportunities created by other transactions
     *
     * Requires X-Flashbots-Signature header (implement if needed)
     */
    async sendEndOfBlockBundle(params) {
        // Note: This endpoint requires authentication
        // Implement X-Flashbots-Signature if needed
        const response = await this.rpcCall('eth_sendEndOfBlockBundle', [
            {
                txs: params.txs,
                blockNumber: params.blockNumber,
                revertingTxHashes: params.revertingTxHashes || [],
            },
        ]);
        return response;
    }
    /**
     * Wait for bundle inclusion with polling
     *
     * @param bundleHash Bundle hash to monitor
     * @param maxBlocks Maximum blocks to wait
     * @param pollIntervalMs Polling interval in milliseconds
     */
    async waitForInclusion(bundleHash, maxBlocks = 5, pollIntervalMs = 2000) {
        const maxAttempts = (maxBlocks * 12000) / pollIntervalMs; // ~12 seconds per block
        for (let i = 0; i < maxAttempts; i++) {
            try {
                const stats = await this.getBundleStats(bundleHash);
                if (stats.isIncluded) {
                    return {
                        included: true,
                        blockNumber: stats.includedBlockNumber,
                    };
                }
                if (stats.error) {
                    console.warn(`Bundle error: ${stats.error}`);
                    return { included: false };
                }
            }
            catch (error) {
                // Stats endpoint might be temporarily unavailable
                console.warn('Error fetching bundle stats:', error);
            }
            await this.sleep(pollIntervalMs);
        }
        return { included: false };
    }
    // ============ Private Methods ============
    async rpcCall(method, params) {
        const response = await fetch(this.rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: ++this.requestId,
                method,
                params,
            }),
        });
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
        }
        const result = await response.json();
        if (result.error) {
            throw new Error(`RPC error: ${result.error.message}`);
        }
        return result.result;
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
exports.TitanBuilderService = TitanBuilderService;
// ============ Singleton Export ============
let instance = null;
function getTitanBuilder() {
    if (!instance) {
        instance = new TitanBuilderService();
    }
    return instance;
}
