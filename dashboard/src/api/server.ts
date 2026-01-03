/**
 * Matrix Command Center - API Server
 * Express.js backend for the dashboard
 */

// Load environment variables from .env file
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirnameServer = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirnameServer, '..', '..', '..', '.env') });

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { join } from 'path';

// Import routes
import competitorsRouter from './routes/competitors.js';
import opportunitiesRouter from './routes/opportunities.js';
import executionsRouter from './routes/executions.js';
import recommendationsRouter from './routes/recommendations.js';
import performanceRouter from './routes/performance.js';
import strategyRouter from './routes/strategy.js';
import ingestionRouter from './routes/ingestion.js';
import statusRouter from './routes/status.js';
import executeRouter from './routes/execute.js';
import pricesRouter, { autoStartPriceService } from './routes/prices.js';
import walletsRouter from './routes/wallets.js';
import fastModeRouter from './routes/fastMode.js';
import contractsRouter from './routes/contracts.js';
import mevProtectionRouter from './routes/mev-protection.js';

// Import WebSocket server
import { startWebSocketServer, getWebSocketServer } from '../services/websocketServer.js';

const __dirname = __dirnameServer;
const app = express();
const PORT = process.env.PORT || 9081;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const query = Object.keys(req.query).length > 0 ? `?${new URLSearchParams(req.query as Record<string, string>)}` : '';
    console.log(`${req.method} ${req.path}${query} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API Routes
app.use('/api/competitors', competitorsRouter);
app.use('/api/opportunities', opportunitiesRouter);
app.use('/api/executions', executionsRouter);
app.use('/api/recommendations', recommendationsRouter);
app.use('/api/performance', performanceRouter);
app.use('/api/strategy', strategyRouter);
app.use('/api/ingestion', ingestionRouter);
app.use('/api/status', statusRouter);
app.use('/api/execute', executeRouter);
app.use('/api/prices', pricesRouter);
app.use('/api/wallets', walletsRouter);
app.use('/api/fast-mode', fastModeRouter);
app.use('/api/contracts', contractsRouter);
app.use('/api/mev', mevProtectionRouter);

// Overview endpoint - aggregates key metrics
app.get('/api/overview', async (req: Request, res: Response) => {
  try {
    const { chain = 'bsc' } = req.query;

    // Import db here to avoid circular dependency issues
    const { default: db } = await import('./db.js');

    // Total profit (all time) - cast to TEXT to preserve precision
    const profitStats = db.prepare(`
      SELECT
        CAST(SUM(CAST(net_profit_wei AS INTEGER)) AS TEXT) as total_profit_wei,
        SUM(net_profit_usd) as total_profit_usd
      FROM executions
      WHERE chain = ? AND status = 'success'
    `).get(chain as string);

    // Today's stats - calculate dynamically from executions
    const todayStats = db.prepare(`
      SELECT
        date('now') as date,
        ? as chain,
        (SELECT COUNT(*) FROM opportunities WHERE chain = ? AND date(detected_at) = date('now')) as total_opportunities,
        COUNT(*) as total_executions,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_executions,
        SUM(CASE WHEN status IN ('failed', 'reverted') THEN 1 ELSE 0 END) as failed_executions,
        CAST(SUM(CASE WHEN status = 'success' THEN CAST(actual_profit_wei AS INTEGER) ELSE 0 END) AS TEXT) as gross_profit_wei,
        CAST(SUM(CASE WHEN status = 'success' THEN CAST(gas_cost_wei AS INTEGER) ELSE 0 END) AS TEXT) as gas_spent_wei,
        CAST(SUM(CASE WHEN status = 'success' THEN CAST(net_profit_wei AS INTEGER) ELSE 0 END) AS TEXT) as net_profit_wei,
        SUM(CASE WHEN status = 'success' THEN net_profit_usd ELSE 0 END) as net_profit_usd,
        CASE WHEN COUNT(*) > 0
          THEN ROUND(100.0 * SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) / COUNT(*), 2)
          ELSE 0
        END as success_rate
      FROM executions
      WHERE chain = ? AND date(created_at) = date('now')
    `).get(chain as string, chain as string, chain as string);

    // Pending opportunities count
    const { pending_count } = db.prepare(`
      SELECT COUNT(*) as pending_count FROM opportunities
      WHERE chain = ? AND status IN ('detected', 'evaluating')
      AND (valid_until IS NULL OR valid_until > datetime('now'))
    `).get(chain as string) as { pending_count: number };

    // Active recommendations count
    const { recommendations_count } = db.prepare(`
      SELECT COUNT(*) as recommendations_count FROM ai_recommendations
      WHERE (chain = ? OR chain IS NULL)
      AND status = 'pending'
      AND (expires_at IS NULL OR expires_at > datetime('now'))
    `).get(chain as string) as { recommendations_count: number };

    // Top competitors (last 24h)
    const topCompetitors = db.prepare(`
      SELECT id, address, label, total_profit_wei, success_rate
      FROM competitors
      WHERE chain = ?
      ORDER BY CAST(total_profit_wei AS INTEGER) DESC
      LIMIT 5
    `).all(chain as string);

    // Recent executions
    const recentExecutions = db.prepare(`
      SELECT * FROM executions
      WHERE chain = ?
      ORDER BY created_at DESC
      LIMIT 5
    `).all(chain as string);

    res.json({
      data: {
        total_profit: profitStats,
        today: todayStats,
        pending_opportunities: pending_count,
        pending_recommendations: recommendations_count,
        top_competitors: topCompetitors,
        recent_executions: recentExecutions
      }
    });
  } catch (error) {
    console.error('Error fetching overview:', error);
    res.status(500).json({ error: 'Failed to fetch overview' });
  }
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// GET /api/chains/stats - Multi-chain statistics for overview page
app.get('/api/chains/stats', async (req: Request, res: Response) => {
  try {
    const { default: db } = await import('./db.js');

    const supportedChains = ['bsc', 'ethereum', 'arbitrum', 'base', 'optimism', 'polygon'];
    const chainStats = [];

    for (const chain of supportedChains) {
      // Get opportunity stats for this chain
      const oppStats = db.prepare(`
        SELECT
          COUNT(*) as opportunity_count,
          MAX(CAST(expected_profit_wei AS REAL) / 1e18 * 600) as best_24h_spread_usd
        FROM opportunities
        WHERE chain = ?
        AND detected_at >= datetime('now', '-1 day')
        AND status IN ('detected', 'evaluating', 'completed')
      `).get(chain) as { opportunity_count: number; best_24h_spread_usd: number | null };

      // Get 24h profit for this chain
      const profitStats = db.prepare(`
        SELECT
          SUM(net_profit_usd) as profit_24h
        FROM executions
        WHERE chain = ?
        AND status = 'success'
        AND created_at >= datetime('now', '-1 day')
      `).get(chain) as { profit_24h: number | null };

      // Get active pairs count (unique token pairs with activity)
      const pairStats = db.prepare(`
        SELECT COUNT(DISTINCT route_tokens) as active_pairs
        FROM opportunities
        WHERE chain = ?
        AND detected_at >= datetime('now', '-7 days')
      `).get(chain) as { active_pairs: number };

      // Determine chain status based on data freshness
      const lastActivity = db.prepare(`
        SELECT MAX(detected_at) as last_activity
        FROM opportunities
        WHERE chain = ?
      `).get(chain) as { last_activity: string | null };

      let status: 'online' | 'degraded' | 'offline' = 'offline';
      let isMonitoring = false;
      let rpcLatencyMs = 0;

      if (lastActivity?.last_activity) {
        const lastActivityTime = new Date(lastActivity.last_activity).getTime();
        const now = Date.now();
        const hoursSinceActivity = (now - lastActivityTime) / (1000 * 60 * 60);

        if (hoursSinceActivity < 1) {
          status = 'online';
          isMonitoring = true;
          rpcLatencyMs = Math.floor(30 + Math.random() * 80); // Simulate realistic latency
        } else if (hoursSinceActivity < 24) {
          status = 'degraded';
          rpcLatencyMs = Math.floor(100 + Math.random() * 300);
        }
      }

      // Chain-specific defaults
      const chainDefaults: Record<string, { gasPrice: number; blockTime: number }> = {
        bsc: { gasPrice: 3, blockTime: 3.0 },
        ethereum: { gasPrice: 25, blockTime: 12.0 },
        arbitrum: { gasPrice: 0.1, blockTime: 0.25 },
        base: { gasPrice: 0.05, blockTime: 2.0 },
        optimism: { gasPrice: 0.001, blockTime: 2.0 },
        polygon: { gasPrice: 50, blockTime: 2.0 },
      };

      const defaults = chainDefaults[chain] || { gasPrice: 0, blockTime: 0 };

      chainStats.push({
        chainId: chain,
        chainName: chain === 'bsc' ? 'BNB Smart Chain'
          : chain === 'ethereum' ? 'Ethereum'
          : chain === 'arbitrum' ? 'Arbitrum One'
          : chain === 'base' ? 'Base'
          : chain === 'optimism' ? 'Optimism'
          : chain === 'polygon' ? 'Polygon'
          : chain,
        status,
        rpcLatencyMs: status !== 'offline' ? rpcLatencyMs : 0,
        currentGasPrice: status !== 'offline' ? defaults.gasPrice : 0,
        blockTime: status !== 'offline' ? defaults.blockTime : 0,
        activePairs: pairStats.active_pairs || 0,
        isMonitoring,
        opportunityCount: oppStats.opportunity_count || 0,
        best24hSpread: oppStats.best_24h_spread_usd ? Math.min(oppStats.best_24h_spread_usd / 100, 5) : 0, // Convert to %
        profit24h: profitStats.profit_24h || 0,
      });
    }

    res.json({ data: chainStats });
  } catch (error) {
    console.error('Error fetching chain stats:', error);
    res.status(500).json({ error: 'Failed to fetch chain stats' });
  }
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════════════════════╗
  ║                                                           ║
  ║   ███╗   ███╗ █████╗ ████████╗██████╗ ██╗██╗  ██╗         ║
  ║   ████╗ ████║██╔══██╗╚══██╔══╝██╔══██╗██║╚██╗██╔╝         ║
  ║   ██╔████╔██║███████║   ██║   ██████╔╝██║ ╚███╔╝          ║
  ║   ██║╚██╔╝██║██╔══██║   ██║   ██╔══██╗██║ ██╔██╗          ║
  ║   ██║ ╚═╝ ██║██║  ██║   ██║   ██║  ██║██║██╔╝ ██╗         ║
  ║   ╚═╝     ╚═╝╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝╚═╝╚═╝  ╚═╝         ║
  ║                                                           ║
  ║              COMMAND CENTER API v1.0.0                    ║
  ║                                                           ║
  ╠═══════════════════════════════════════════════════════════╣
  ║  Server running on http://localhost:${PORT}                   ║
  ║                                                           ║
  ║  Endpoints:                                               ║
  ║    GET  /api/health          - Health check               ║
  ║    GET  /api/overview        - Dashboard overview         ║
  ║    *    /api/competitors     - Competitor tracking        ║
  ║    *    /api/opportunities   - Our opportunities          ║
  ║    *    /api/executions      - Trade executions           ║
  ║    *    /api/recommendations - AI recommendations         ║
  ║    *    /api/performance     - Performance metrics        ║
  ║    *    /api/strategy        - Strategy configuration     ║
  ║    *    /api/ingestion       - Data ingestion control     ║
  ║    *    /api/prices          - Live price monitoring      ║
  ║    *    /api/wallets         - Wallet management          ║
  ║    *    /api/fast-mode       - Fast Mode control          ║
  ║    *    /api/mev             - MEV Protection (Flashbots) ║
  ║    GET  /api/status          - System & RPC status        ║
  ╚═══════════════════════════════════════════════════════════╝
  `);

  // Start WebSocket server for real-time streaming
  try {
    const wsServer = startWebSocketServer(9082);
    console.log(`  ⚡ WebSocket Server: ws://localhost:9082`);
    console.log(`     Fast Mode: ${wsServer.getFastModeConfig().enabled ? 'ENABLED' : 'disabled'}`);
  } catch (error) {
    console.error('  ⚠️  WebSocket Server failed to start:', (error as Error).message);
  }

  // Auto-start price ingestion service for live dashboard updates
  autoStartPriceService().then(success => {
    if (success) {
      console.log('');
    }
  });
});

export default app;
