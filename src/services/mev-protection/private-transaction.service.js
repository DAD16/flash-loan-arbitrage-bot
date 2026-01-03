"use strict";
/**
 * Private Transaction Service
 *
 * Handles routing of transactions through private mempools
 * to prevent front-running and sandwich attacks.
 *
 * Supports multiple private RPCs with automatic failover.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrivateTransactionService = void 0;
exports.getPrivateTransactionService = getPrivateTransactionService;
const ethers_1 = require("ethers");
const rpc_config_1 = require("./rpc-config");
const titan_builder_service_1 = require("./titan-builder.service");
// ============ Service ============
class PrivateTransactionService {
    readProvider;
    privateProviders;
    providerHealth;
    titanBuilder = (0, titan_builder_service_1.getTitanBuilder)();
    constructor() {
        // Initialize read provider (public RPC - safe for reads)
        this.readProvider = new ethers_1.ethers.JsonRpcProvider((0, rpc_config_1.getRpcUrl)('read'));
        // Initialize private providers
        this.privateProviders = new Map();
        this.providerHealth = new Map();
        for (const url of rpc_config_1.FAILOVER_CONFIG.privateTransactionOrder) {
            const provider = new ethers_1.ethers.JsonRpcProvider(url);
            this.privateProviders.set(url, provider);
            // Find the endpoint config
            const endpointConfig = Object.values(rpc_config_1.RPC_ENDPOINTS).find((e) => e.url === url);
            this.providerHealth.set(url, {
                url,
                name: endpointConfig?.name || 'Unknown',
                isHealthy: true,
                lastChecked: 0,
                errorCount: 0,
            });
        }
    }
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
    getReadProvider() {
        return this.readProvider;
    }
    /**
     * Get provider for WRITE operations
     *
     * Returns the healthiest private RPC provider
     * for transaction submission.
     */
    getWriteProvider() {
        const healthyUrl = this.getHealthiestProvider();
        return this.privateProviders.get(healthyUrl);
    }
    /**
     * Send a private transaction with automatic failover
     *
     * Tries each private RPC in order until one succeeds.
     * Tracks provider health for future routing decisions.
     *
     * @param signedTx Signed raw transaction hex
     * @returns Transaction result with hash and provider used
     */
    async sendPrivateTransaction(signedTx) {
        const errors = [];
        for (const url of rpc_config_1.FAILOVER_CONFIG.privateTransactionOrder) {
            const health = this.providerHealth.get(url);
            // Skip unhealthy providers
            if (!health.isHealthy && Date.now() - health.lastChecked < 60000) {
                continue;
            }
            try {
                const startTime = Date.now();
                const provider = this.privateProviders.get(url);
                const txResponse = await provider.broadcastTransaction(signedTx);
                // Update health metrics
                health.isHealthy = true;
                health.lastChecked = Date.now();
                health.latencyMs = Date.now() - startTime;
                health.errorCount = 0;
                console.log(`Transaction sent via ${health.name}: ${txResponse.hash}`);
                return {
                    hash: txResponse.hash,
                    provider: health.name,
                    timestamp: Date.now(),
                };
            }
            catch (error) {
                const err = error;
                errors.push(err);
                // Update health metrics
                health.errorCount++;
                health.lastChecked = Date.now();
                if (health.errorCount >= 3) {
                    health.isHealthy = false;
                }
                console.warn(`Failed to send via ${health.name}:`, err.message);
            }
        }
        // All providers failed - throw aggregated error
        throw new Error(`All private RPCs failed. Errors: ${errors.map((e) => e.message).join('; ')}`);
    }
    /**
     * Send transaction with multi-provider broadcast
     *
     * Sends to ALL private RPCs simultaneously for maximum
     * inclusion probability. Useful for time-sensitive arbitrage.
     *
     * @param signedTx Signed raw transaction hex
     */
    async broadcastToAll(signedTx) {
        const promises = rpc_config_1.FAILOVER_CONFIG.privateTransactionOrder.map(async (url) => {
            try {
                const provider = this.privateProviders.get(url);
                const health = this.providerHealth.get(url);
                const txResponse = await provider.broadcastTransaction(signedTx);
                return {
                    hash: txResponse.hash,
                    provider: health.name,
                    timestamp: Date.now(),
                };
            }
            catch (error) {
                return null;
            }
        });
        // Also send directly to Titan Builder
        promises.push((async () => {
            try {
                await this.titanBuilder.sendPrivateTransaction(signedTx);
                // Titan returns 200, not hash, so we compute hash locally
                const tx = ethers_1.ethers.Transaction.from(signedTx);
                return {
                    hash: tx.hash,
                    provider: 'Titan Builder (Direct)',
                    timestamp: Date.now(),
                };
            }
            catch {
                return null;
            }
        })());
        const results = await Promise.all(promises);
        return results.filter((r) => r !== null);
    }
    /**
     * Create a wallet connected to private RPC
     *
     * @param privateKey Private key hex string
     */
    createPrivateWallet(privateKey) {
        return new ethers_1.ethers.Wallet(privateKey, this.getWriteProvider());
    }
    /**
     * Create a wallet for reads only
     *
     * Useful for gas estimation and balance checks
     * before switching to private provider for actual send.
     *
     * @param privateKey Private key hex string
     */
    createReadWallet(privateKey) {
        return new ethers_1.ethers.Wallet(privateKey, this.readProvider);
    }
    /**
     * Check health of all providers
     */
    async healthCheck() {
        const checks = Array.from(this.privateProviders.entries()).map(async ([url, provider]) => {
            const health = this.providerHealth.get(url);
            const startTime = Date.now();
            try {
                await provider.getBlockNumber();
                health.isHealthy = true;
                health.latencyMs = Date.now() - startTime;
                health.errorCount = 0;
            }
            catch {
                health.isHealthy = false;
                health.errorCount++;
            }
            health.lastChecked = Date.now();
        });
        await Promise.all(checks);
        return this.providerHealth;
    }
    /**
     * Get the healthiest provider URL
     */
    getHealthiestProvider() {
        let bestUrl = rpc_config_1.FAILOVER_CONFIG.privateTransactionOrder[0];
        let bestScore = -1;
        for (const url of rpc_config_1.FAILOVER_CONFIG.privateTransactionOrder) {
            const health = this.providerHealth.get(url);
            // Calculate score: healthy + low latency + low errors
            let score = 0;
            if (health.isHealthy)
                score += 100;
            if (health.latencyMs)
                score += Math.max(0, 1000 - health.latencyMs);
            score -= health.errorCount * 20;
            if (score > bestScore) {
                bestScore = score;
                bestUrl = url;
            }
        }
        return bestUrl;
    }
}
exports.PrivateTransactionService = PrivateTransactionService;
// ============ Singleton Export ============
let instance = null;
function getPrivateTransactionService() {
    if (!instance) {
        instance = new PrivateTransactionService();
    }
    return instance;
}
