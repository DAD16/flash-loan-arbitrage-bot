/**
 * MEV Protection Routes
 *
 * API endpoints for managing MEV protection settings:
 * - Toggle Flashbots Protect, MEV Blocker, Titan Builder
 * - Check private RPC health status
 * - View current configuration
 */

import { Router, Request, Response } from 'express';
import { createRequire } from 'module';

// Use createRequire to import CommonJS module from ESM
const require = createRequire(import.meta.url);
const mevProtection = require('../../../../src/services/mev-protection/index.js');

const {
  getMEVProtectionManager,
  getPrivateTransactionService,
  ChainId,
  CHAIN_CONFIGS,
} = mevProtection;

const router = Router();

// GET /api/mev/status - Get current MEV protection configuration
router.get('/status', (req: Request, res: Response) => {
  try {
    const manager = getMEVProtectionManager();
    const config = manager.getConfig();

    // Check which chains have MEV protection available
    const chainSupport: Record<string, boolean> = {};
    for (const [chainIdStr, chainConfig] of Object.entries(CHAIN_CONFIGS) as [string, { name: string }][]) {
      chainSupport[chainConfig.name] = manager.isMEVProtectionAvailable(
        Number(chainIdStr)
      );
    }

    res.json({
      enabled: config.titanBuilderEnabled || config.flashbotsEnabled,
      config: {
        titanBuilder: config.titanBuilderEnabled,
        flashbotsProtect: config.flashbotsEnabled,
        mevBlocker: config.mevBlockerEnabled,
        multiBuilder: config.multiBuilderEnabled,
        refundPercent: config.refundPercent,
        verbose: config.verbose,
      },
      chainSupport,
      description: {
        titanBuilder:
          'Direct bundle submission to Titan Builder (51% ETH block share)',
        flashbotsProtect:
          'Private mempool via Flashbots Protect (98.5% protection rate)',
        mevBlocker:
          'Alternative private mempool via MEV Blocker (96.2% protection)',
        multiBuilder: 'Broadcast to multiple builders for higher inclusion rate',
      },
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get MEV protection status',
      message: (error as Error).message,
    });
  }
});

// POST /api/mev/toggle - Toggle MEV protection settings
router.post('/toggle', (req: Request, res: Response) => {
  try {
    const {
      titanBuilder,
      flashbotsProtect,
      mevBlocker,
      multiBuilder,
      refundPercent,
      verbose,
    } = req.body;

    const manager = getMEVProtectionManager();

    // Apply changes
    if (typeof titanBuilder === 'boolean') {
      manager.setTitanBuilderEnabled(titanBuilder);
    }
    if (typeof flashbotsProtect === 'boolean') {
      manager.setFlashbotsEnabled(flashbotsProtect);
    }
    if (typeof mevBlocker === 'boolean') {
      manager.setMEVBlockerEnabled(mevBlocker);
    }
    if (typeof multiBuilder === 'boolean') {
      manager.setMultiBuilderEnabled(multiBuilder);
    }
    if (typeof refundPercent === 'number') {
      manager.setRefundPercent(refundPercent);
    }
    if (typeof verbose === 'boolean') {
      manager.setVerbose(verbose);
    }

    const updatedConfig = manager.getConfig();

    res.json({
      success: true,
      message: 'MEV protection settings updated',
      config: {
        titanBuilder: updatedConfig.titanBuilderEnabled,
        flashbotsProtect: updatedConfig.flashbotsEnabled,
        mevBlocker: updatedConfig.mevBlockerEnabled,
        multiBuilder: updatedConfig.multiBuilderEnabled,
        refundPercent: updatedConfig.refundPercent,
        verbose: updatedConfig.verbose,
      },
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to update MEV protection settings',
      message: (error as Error).message,
    });
  }
});

// POST /api/mev/enable - Quick enable all MEV protection
router.post('/enable', (req: Request, res: Response) => {
  try {
    const manager = getMEVProtectionManager();

    manager.setTitanBuilderEnabled(true);
    manager.setFlashbotsEnabled(true);
    manager.setMEVBlockerEnabled(true);
    manager.setMultiBuilderEnabled(true);

    res.json({
      success: true,
      message: 'MEV protection fully enabled',
      config: manager.getConfig(),
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to enable MEV protection',
      message: (error as Error).message,
    });
  }
});

// POST /api/mev/disable - Quick disable all MEV protection
router.post('/disable', (req: Request, res: Response) => {
  try {
    const manager = getMEVProtectionManager();

    manager.setTitanBuilderEnabled(false);
    manager.setFlashbotsEnabled(false);
    manager.setMEVBlockerEnabled(false);
    manager.setMultiBuilderEnabled(false);

    res.json({
      success: true,
      message: 'MEV protection disabled - WARNING: Transactions vulnerable to front-running!',
      config: manager.getConfig(),
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to disable MEV protection',
      message: (error as Error).message,
    });
  }
});

// GET /api/mev/health - Check health of all private RPC providers
router.get('/health', async (req: Request, res: Response) => {
  try {
    const privateTxService = getPrivateTransactionService();

    // Run health check on all providers
    const healthMap = await privateTxService.healthCheck();

    const providers: Array<{
      name: string;
      url: string;
      healthy: boolean;
      latencyMs?: number;
      errorCount: number;
      lastChecked: string;
    }> = [];

    for (const [url, health] of healthMap) {
      providers.push({
        name: health.name,
        url: url.replace(/\/\/.*@/, '//***@'), // Hide any auth in URL
        healthy: health.isHealthy,
        latencyMs: health.latencyMs,
        errorCount: health.errorCount,
        lastChecked: new Date(health.lastChecked).toISOString(),
      });
    }

    const allHealthy = providers.every((p) => p.healthy);
    const healthyCount = providers.filter((p) => p.healthy).length;

    res.json({
      status: allHealthy ? 'healthy' : healthyCount > 0 ? 'degraded' : 'unhealthy',
      healthyProviders: healthyCount,
      totalProviders: providers.length,
      providers,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to check provider health',
      message: (error as Error).message,
    });
  }
});

// GET /api/mev/chains - Get MEV protection availability per chain
router.get('/chains', (req: Request, res: Response) => {
  try {
    const manager = getMEVProtectionManager();

    interface ChainConfigType {
      name: string;
      supportsMEVProtection: boolean;
      explorerUrl: string;
    }
    const chains = (Object.entries(CHAIN_CONFIGS) as [string, ChainConfigType][]).map(([chainId, config]) => ({
      chainId: Number(chainId),
      name: config.name,
      mevProtectionAvailable: config.supportsMEVProtection,
      mevProtectionEnabled: manager.isMEVProtectionAvailable(Number(chainId)),
      explorerUrl: config.explorerUrl,
      notes: config.supportsMEVProtection
        ? 'Full Flashbots/Titan Builder support'
        : 'No private mempool - use contract obfuscation for protection',
    }));

    res.json({ chains });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get chain MEV support',
      message: (error as Error).message,
    });
  }
});

export default router;
