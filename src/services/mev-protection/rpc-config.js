"use strict";
/**
 * RPC Configuration for MEV Protection
 *
 * This module configures multiple RPC endpoints for different purposes:
 * - Private RPCs for transaction submission (prevents front-running)
 * - Public RPCs for read operations only
 * - Direct builder endpoints for bundle submission
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FAILOVER_CONFIG = exports.RPC_ENDPOINTS = void 0;
exports.getRpcUrl = getRpcUrl;
exports.RPC_ENDPOINTS = {
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
function getRpcUrl(operation, chainId = 1) {
    switch (operation) {
        case 'read':
            // Use public RPC for reads - no MEV risk
            return process.env.ETHEREUM_RPC_URL || 'https://eth.llamarpc.com';
        case 'write':
            // Use Flashbots Protect for individual transactions
            return exports.RPC_ENDPOINTS.flashbotsProtect.url;
        case 'bundle':
            // Use Titan Builder for bundle submission
            return exports.RPC_ENDPOINTS.titanBuilder.url;
        default:
            return exports.RPC_ENDPOINTS.flashbotsProtect.url;
    }
}
/**
 * Configuration for multi-RPC failover strategy
 */
exports.FAILOVER_CONFIG = {
    // Order of RPCs to try for private transactions
    privateTransactionOrder: [
        exports.RPC_ENDPOINTS.flashbotsProtect.url,
        exports.RPC_ENDPOINTS.mevBlocker.url,
        exports.RPC_ENDPOINTS.titanBuilder.url,
    ],
    // Order of builders to submit bundles to
    bundleSubmissionOrder: [
        exports.RPC_ENDPOINTS.titanBuilder.url,
        // Add more builders here as needed
    ],
    // Retry configuration
    maxRetries: 3,
    retryDelayMs: 1000,
    timeoutMs: 30000,
};
