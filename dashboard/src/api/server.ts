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
import pricesRouter from './routes/prices.js';
import walletsRouter from './routes/wallets.js';
import fastModeRouter from './routes/fastMode.js';

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
    console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
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
  ║    GET  /api/status          - System & RPC status        ║
  ╚═══════════════════════════════════════════════════════════╝
  `);

  // Start WebSocket server for real-time streaming
  try {
    const wsServer = startWebSocketServer(9082);
    console.log(`  ⚡ WebSocket Server: ws://localhost:9082`);
    console.log(`     Fast Mode: ${wsServer.getFastModeConfig().enabled ? 'ENABLED' : 'disabled'}`);
    console.log('');
  } catch (error) {
    console.error('  ⚠️  WebSocket Server failed to start:', (error as Error).message);
  }
});

export default app;
