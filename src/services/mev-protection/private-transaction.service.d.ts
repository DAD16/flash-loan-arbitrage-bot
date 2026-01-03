/**
 * Private Transaction Service
 *
 * Handles routing of transactions through private mempools
 * to prevent front-running and sandwich attacks.
 *
 * Supports multiple private RPCs with automatic failover.
 */
import { ethers } from 'ethers';
export interface TransactionResult {
    hash: string;
    provider: string;
    timestamp: number;
}
export interface ProviderHealth {
    url: string;
    name: string;
    isHealthy: boolean;
    lastChecked: number;
    latencyMs?: number;
    errorCount: number;
}
export declare class PrivateTransactionService {
    private readProvider;
    private privateProviders;
    private providerHealth;
    private titanBuilder;
    constructor();
    /**
     * Get provider for READ operations
     *
     * Use this for:
     * - Checking balances
     * - Estimating gas
     * - Reading contract state
     * - Getting block numbers
     *
     * Safe to use public RPC - no MEV risk for reads
     */
    getReadProvider(): ethers.JsonRpcProvider;
    /**
     * Get provider for WRITE operations
     *
     * Returns the healthiest private RPC provider
     * for transaction submission.
     */
    getWriteProvider(): ethers.JsonRpcProvider;
    /**
     * Send a private transaction with automatic failover
     *
     * Tries each private RPC in order until one succeeds.
     * Tracks provider health for future routing decisions.
     *
     * @param signedTx Signed raw transaction hex
     * @returns Transaction result with hash and provider used
     */
    sendPrivateTransaction(signedTx: string): Promise<TransactionResult>;
    /**
     * Send transaction with multi-provider broadcast
     *
     * Sends to ALL private RPCs simultaneously for maximum
     * inclusion probability. Useful for time-sensitive arbitrage.
     *
     * @param signedTx Signed raw transaction hex
     */
    broadcastToAll(signedTx: string): Promise<TransactionResult[]>;
    /**
     * Create a wallet connected to private RPC
     *
     * @param privateKey Private key hex string
     */
    createPrivateWallet(privateKey: string): ethers.Wallet;
    /**
     * Create a wallet for reads only
     *
     * Useful for gas estimation and balance checks
     * before switching to private provider for actual send.
     *
     * @param privateKey Private key hex string
     */
    createReadWallet(privateKey: string): ethers.Wallet;
    /**
     * Check health of all providers
     */
    healthCheck(): Promise<Map<string, ProviderHealth>>;
    /**
     * Get the healthiest provider URL
     */
    private getHealthiestProvider;
}
export declare function getPrivateTransactionService(): PrivateTransactionService;
