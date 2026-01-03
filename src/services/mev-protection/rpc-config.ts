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
  rateLimit?: number; // requests per second
  supportsPrivateTx: boolean;
  supportsBundles: boolean;
  chains: number[];
}

export const RPC_ENDPOINTS: Record<string, RPCEndpoint> = {
  // Primary: Flashbots Protect - highest success rate (98.5%)
  flashbotsProtect: {
    url: 'https://rpc.flashbots.net/fast',
    name: 'Flashbots Protect',
    supportsPrivateTx: true,
    supportsBundles: false, // Use auction API for bundles
    chains: [1], // Ethereum mainnet only
  },

  // Secondary: MEV Blocker - faster response time (~180ms)
  mevBlocker: {
    url: 'https://rpc.mevblocker.io',
    name: 'MEV Blocker',
    supportsPrivateTx: true,
    supportsBundles: false,
    chains: [1],
  },

  // Direct builder submission: Titan Builder (51% market share)
  titanBuilder: {
    url: 'https://rpc.titanbuilder.xyz',
    name: 'Titan Builder',
    rateLimit: 50,
    supportsPrivateTx: true,
    supportsBundles: true,
    chains: [1],
  },

  // Titan Builder stats endpoint
  titanStats: {
    url: 'https://stats.titanbuilder.xyz',
    name: 'Titan Stats',
    supportsPrivateTx: false,
    supportsBundles: false,
    chains: [1],
  },

  // Flashbots Tor endpoint (maximum privacy)
  flashbotsTor: {
    url: 'http://protectfbnoqyfgo3t5ouw3c7odp55qqoxnfdd7u24nzz5pkbclbzzyd.onion',
    name: 'Flashbots Tor',
    supportsPrivateTx: true,
    supportsBundles: false,
    chains: [1],
  },
};

/**
 * Get the appropriate RPC URL based on operation type
 */
export function getRpcUrl(
  operation: 'read' | 'write' | 'bundle',
  chainId: number = 1
): string {
  switch (operation) {
    case 'read':
      // Use public RPC for reads - no MEV risk
      return process.env.ETHEREUM_RPC_URL || 'https://eth.llamarpc.com';

    case 'write':
      // Use Flashbots Protect for individual transactions
      return RPC_ENDPOINTS.flashbotsProtect.url;

    case 'bundle':
      // Use Titan Builder for bundle submission
      return RPC_ENDPOINTS.titanBuilder.url;

    default:
      return RPC_ENDPOINTS.flashbotsProtect.url;
  }
}

/**
 * Configuration for multi-RPC failover strategy
 */
export const FAILOVER_CONFIG = {
  // Order of RPCs to try for private transactions
  privateTransactionOrder: [
    RPC_ENDPOINTS.flashbotsProtect.url,
    RPC_ENDPOINTS.mevBlocker.url,
    RPC_ENDPOINTS.titanBuilder.url,
  ],

  // Order of builders to submit bundles to
  bundleSubmissionOrder: [
    RPC_ENDPOINTS.titanBuilder.url,
    // Add more builders here as needed
  ],

  // Retry configuration
  maxRetries: 3,
  retryDelayMs: 1000,
  timeoutMs: 30000,
};
