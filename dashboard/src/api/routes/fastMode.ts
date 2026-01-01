/**
 * Fast Mode API Routes
 *
 * Controls the Fast Execution Mode for automated arbitrage.
 * Part of Phase A Speed Optimization.
 */

import { Router, Request, Response } from 'express';
import { getWebSocketServer, type FastModeConfig } from '../../services/websocketServer.js';

const router = Router();

/**
 * GET /api/fast-mode/status
 * Get current Fast Mode configuration
 */
router.get('/status', (req: Request, res: Response) => {
  try {
    const wsServer = getWebSocketServer();
    const config = wsServer.getFastModeConfig();
    const stats = wsServer.getStats();

    res.json({
      success: true,
      data: {
        config,
        stats: {
          wsClients: stats.clients,
          messageCount: stats.messageCount,
          avgLatencyMs: stats.avgLatencyMs,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /api/fast-mode/enable
 * Enable Fast Mode with optional config
 */
router.post('/enable', (req: Request, res: Response) => {
  try {
    const wsServer = getWebSocketServer();
    const config: Partial<FastModeConfig> = {
      enabled: true,
      ...req.body,
    };

    wsServer.setFastModeConfig(config);

    console.log('[FastMode] ENABLED with config:', wsServer.getFastModeConfig());

    res.json({
      success: true,
      message: 'Fast Mode enabled',
      data: wsServer.getFastModeConfig(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /api/fast-mode/disable
 * Disable Fast Mode (emergency stop)
 */
router.post('/disable', (req: Request, res: Response) => {
  try {
    const wsServer = getWebSocketServer();
    wsServer.setFastModeConfig({
      enabled: false,
      autoExecute: false,
    });

    console.log('[FastMode] DISABLED');

    res.json({
      success: true,
      message: 'Fast Mode disabled',
      data: wsServer.getFastModeConfig(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /api/fast-mode/config
 * Update Fast Mode configuration
 */
router.post('/config', (req: Request, res: Response) => {
  try {
    const wsServer = getWebSocketServer();
    const {
      autoExecute,
      minProfitThresholdBps,
      maxGasGwei,
      maxSlippageBps,
      usePrivateMempool,
      cooldownMs,
    } = req.body;

    const updates: Partial<FastModeConfig> = {};

    if (typeof autoExecute === 'boolean') updates.autoExecute = autoExecute;
    if (typeof minProfitThresholdBps === 'number') updates.minProfitThresholdBps = minProfitThresholdBps;
    if (typeof maxGasGwei === 'number') updates.maxGasGwei = maxGasGwei;
    if (typeof maxSlippageBps === 'number') updates.maxSlippageBps = maxSlippageBps;
    if (typeof usePrivateMempool === 'boolean') updates.usePrivateMempool = usePrivateMempool;
    if (typeof cooldownMs === 'number') updates.cooldownMs = cooldownMs;

    wsServer.setFastModeConfig(updates);

    res.json({
      success: true,
      message: 'Configuration updated',
      data: wsServer.getFastModeConfig(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /api/fast-mode/latency
 * Get latency metrics
 */
router.get('/latency', (req: Request, res: Response) => {
  try {
    const wsServer = getWebSocketServer();
    const stats = wsServer.getStats();

    res.json({
      success: true,
      data: {
        avgLatencyMs: stats.avgLatencyMs,
        wsClients: stats.clients,
        messageCount: stats.messageCount,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

export default router;
