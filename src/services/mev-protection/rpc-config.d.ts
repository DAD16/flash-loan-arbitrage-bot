/**
 * RPC Configuration for MEV Protection
 *
 * This module configures multiple RPC endpoints for different purposes:
 * - Private RPCs for transaction submission (prevents front-running)
 * - Public RPCs for read operations only
 * - Direct builder endpoints for bundle submission
 */
export interface RPCEndpoint {
    url: string;
    name: string;
    rateLimit?: number;
    supportsPrivateTx: boolean;
    supportsBundles: boolean;
    chains: number[];
}
export declare const RPC_ENDPOINTS: Record<string, RPCEndpoint>;
/**
 * Get the appropriate RPC URL based on operation type
 */
export declare function getRpcUrl(operation: 'read' | 'write' | 'bundle', chainId?: number): string;
/**
 * Configuration for multi-RPC failover strategy
 */
export declare const FAILOVER_CONFIG: {
    privateTransactionOrder: string[];
    bundleSubmissionOrder: string[];
    maxRetries: number;
    retryDelayMs: number;
    timeoutMs: number;
};
