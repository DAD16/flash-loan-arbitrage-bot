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

import { RPC_ENDPOINTS } from './rpc-config';

// ============ Types ============

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

interface JsonRpcResponse<T> {
  jsonrpc: string;
  id: number | string;
  result?: T;
  error?: {
    code: number;
    message: string;
  };
}

// ============ Service ============

export class TitanBuilderService {
  private readonly rpcUrl: string;
  private readonly statsUrl: string;
  private requestId: number = 0;

  constructor() {
    this.rpcUrl = RPC_ENDPOINTS.titanBuilder.url;
    this.statsUrl = RPC_ENDPOINTS.titanStats.url;
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
  async sendBundle(params: BundleParams): Promise<BundleResponse> {
    const response = await this.rpcCall<BundleResponse>('eth_sendBundle', [
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
  async sendPrivateTransaction(signedTx: string): Promise<number> {
    const response = await this.rpcCall<number>('eth_sendPrivateTransaction', [
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
  async cancelBundle(replacementUuid: string): Promise<boolean> {
    try {
      await this.rpcCall<void>('eth_cancelBundle', [{ replacementUuid }]);
      return true;
    } catch {
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
  async getBundleStats(bundleHash: string): Promise<BundleStats> {
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

    const result: JsonRpcResponse<BundleStats> = await response.json();

    if (result.error) {
      throw new Error(`Bundle stats error: ${result.error.message}`);
    }

    return result.result!;
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
  async sendEndOfBlockBundle(params: BundleParams): Promise<BundleResponse> {
    // Note: This endpoint requires authentication
    // Implement X-Flashbots-Signature if needed
    const response = await this.rpcCall<BundleResponse>(
      'eth_sendEndOfBlockBundle',
      [
        {
          txs: params.txs,
          blockNumber: params.blockNumber,
          revertingTxHashes: params.revertingTxHashes || [],
        },
      ]
    );

    return response;
  }

  /**
   * Wait for bundle inclusion with polling
   *
   * @param bundleHash Bundle hash to monitor
   * @param maxBlocks Maximum blocks to wait
   * @param pollIntervalMs Polling interval in milliseconds
   */
  async waitForInclusion(
    bundleHash: string,
    maxBlocks: number = 5,
    pollIntervalMs: number = 2000
  ): Promise<{ included: boolean; blockNumber?: number }> {
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
      } catch (error) {
        // Stats endpoint might be temporarily unavailable
        console.warn('Error fetching bundle stats:', error);
      }

      await this.sleep(pollIntervalMs);
    }

    return { included: false };
  }

  // ============ Private Methods ============

  private async rpcCall<T>(method: string, params: any[]): Promise<T> {
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

    const result: JsonRpcResponse<T> = await response.json();

    if (result.error) {
      throw new Error(`RPC error: ${result.error.message}`);
    }

    return result.result!;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============ Singleton Export ============

let instance: TitanBuilderService | null = null;

export function getTitanBuilder(): TitanBuilderService {
  if (!instance) {
    instance = new TitanBuilderService();
  }
  return instance;
}
