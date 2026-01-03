/**
 * Private Transaction Service
 *
 * Handles routing of transactions through private mempools
 * to prevent front-running and sandwich attacks.
 *
 * Supports multiple private RPCs with automatic failover.
 */

import { ethers } from 'ethers';
import { getRpcUrl, FAILOVER_CONFIG, RPC_ENDPOINTS } from './rpc-config';
import { getTitanBuilder } from './titan-builder.service';

// ============ Types ============

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

// ============ Service ============

export class PrivateTransactionService {
  private readProvider: ethers.JsonRpcProvider;
  private privateProviders: Map<string, ethers.JsonRpcProvider>;
  private providerHealth: Map<string, ProviderHealth>;
  private titanBuilder = getTitanBuilder();

  constructor() {
    // Initialize read provider (public RPC - safe for reads)
    this.readProvider = new ethers.JsonRpcProvider(getRpcUrl('read'));

    // Initialize private providers
    this.privateProviders = new Map();
    this.providerHealth = new Map();

    for (const url of FAILOVER_CONFIG.privateTransactionOrder) {
      const provider = new ethers.JsonRpcProvider(url);
      this.privateProviders.set(url, provider);

      // Find the endpoint config
      const endpointConfig = Object.values(RPC_ENDPOINTS).find(
        (e) => e.url === url
      );

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
  getReadProvider(): ethers.JsonRpcProvider {
    return this.readProvider;
  }

  /**
   * Get provider for WRITE operations
   *
   * Returns the healthiest private RPC provider
   * for transaction submission.
   */
  getWriteProvider(): ethers.JsonRpcProvider {
    const healthyUrl = this.getHealthiestProvider();
    return this.privateProviders.get(healthyUrl)!;
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
  async sendPrivateTransaction(signedTx: string): Promise<TransactionResult> {
    const errors: Error[] = [];

    for (const url of FAILOVER_CONFIG.privateTransactionOrder) {
      const health = this.providerHealth.get(url)!;

      // Skip unhealthy providers
      if (!health.isHealthy && Date.now() - health.lastChecked < 60000) {
        continue;
      }

      try {
        const startTime = Date.now();
        const provider = this.privateProviders.get(url)!;

        const txResponse = await provider.broadcastTransaction(signedTx);

        // Update health metrics
        health.isHealthy = true;
        health.lastChecked = Date.now();
        health.latencyMs = Date.now() - startTime;
        health.errorCount = 0;

        console.log(
          `Transaction sent via ${health.name}: ${txResponse.hash}`
        );

        return {
          hash: txResponse.hash,
          provider: health.name,
          timestamp: Date.now(),
        };
      } catch (error) {
        const err = error as Error;
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
    throw new Error(
      `All private RPCs failed. Errors: ${errors.map((e) => e.message).join('; ')}`
    );
  }

  /**
   * Send transaction with multi-provider broadcast
   *
   * Sends to ALL private RPCs simultaneously for maximum
   * inclusion probability. Useful for time-sensitive arbitrage.
   *
   * @param signedTx Signed raw transaction hex
   */
  async broadcastToAll(signedTx: string): Promise<TransactionResult[]> {
    const promises = FAILOVER_CONFIG.privateTransactionOrder.map(
      async (url) => {
        try {
          const provider = this.privateProviders.get(url)!;
          const health = this.providerHealth.get(url)!;

          const txResponse = await provider.broadcastTransaction(signedTx);

          return {
            hash: txResponse.hash,
            provider: health.name,
            timestamp: Date.now(),
          };
        } catch (error) {
          return null;
        }
      }
    );

    // Also send directly to Titan Builder
    promises.push(
      (async () => {
        try {
          await this.titanBuilder.sendPrivateTransaction(signedTx);
          // Titan returns 200, not hash, so we compute hash locally
          const tx = ethers.Transaction.from(signedTx);
          return {
            hash: tx.hash!,
            provider: 'Titan Builder (Direct)',
            timestamp: Date.now(),
          };
        } catch {
          return null;
        }
      })()
    );

    const results = await Promise.all(promises);
    return results.filter((r): r is TransactionResult => r !== null);
  }

  /**
   * Create a wallet connected to private RPC
   *
   * @param privateKey Private key hex string
   */
  createPrivateWallet(privateKey: string): ethers.Wallet {
    return new ethers.Wallet(privateKey, this.getWriteProvider());
  }

  /**
   * Create a wallet for reads only
   *
   * Useful for gas estimation and balance checks
   * before switching to private provider for actual send.
   *
   * @param privateKey Private key hex string
   */
  createReadWallet(privateKey: string): ethers.Wallet {
    return new ethers.Wallet(privateKey, this.readProvider);
  }

  /**
   * Check health of all providers
   */
  async healthCheck(): Promise<Map<string, ProviderHealth>> {
    const checks = Array.from(this.privateProviders.entries()).map(
      async ([url, provider]) => {
        const health = this.providerHealth.get(url)!;
        const startTime = Date.now();

        try {
          await provider.getBlockNumber();
          health.isHealthy = true;
          health.latencyMs = Date.now() - startTime;
          health.errorCount = 0;
        } catch {
          health.isHealthy = false;
          health.errorCount++;
        }

        health.lastChecked = Date.now();
      }
    );

    await Promise.all(checks);
    return this.providerHealth;
  }

  /**
   * Get the healthiest provider URL
   */
  private getHealthiestProvider(): string {
    let bestUrl = FAILOVER_CONFIG.privateTransactionOrder[0];
    let bestScore = -1;

    for (const url of FAILOVER_CONFIG.privateTransactionOrder) {
      const health = this.providerHealth.get(url)!;

      // Calculate score: healthy + low latency + low errors
      let score = 0;
      if (health.isHealthy) score += 100;
      if (health.latencyMs) score += Math.max(0, 1000 - health.latencyMs);
      score -= health.errorCount * 20;

      if (score > bestScore) {
        bestScore = score;
        bestUrl = url;
      }
    }

    return bestUrl;
  }
}

// ============ Singleton Export ============

let instance: PrivateTransactionService | null = null;

export function getPrivateTransactionService(): PrivateTransactionService {
  if (!instance) {
    instance = new PrivateTransactionService();
  }
  return instance;
}
