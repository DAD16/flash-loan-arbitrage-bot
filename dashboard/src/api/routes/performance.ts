/**
 * Performance API Routes
 * Endpoints for daily/hourly performance metrics
 */

import { Router, Request, Response } from 'express';
import db from '../db.js';

const router = Router();

// GET /api/performance/daily - Get daily performance
router.get('/daily', (req: Request, res: Response) => {
  try {
    const { chain = 'bsc', days = 30 } = req.query;

    const performance = db.prepare(`
      SELECT * FROM daily_performance
      WHERE chain = ?
      AND date >= date('now', '-' || ? || ' days')
      ORDER BY date DESC
    `).all(chain as string, Number(days));

    // Parse JSON fields
    const parsed = performance.map(p => {
      const row = p as Record<string, any>;
      return {
        ...row,
        profit_by_pair: row.profit_by_pair ? JSON.parse(row.profit_by_pair) : null,
        profit_by_dex: row.profit_by_dex ? JSON.parse(row.profit_by_dex) : null
      };
    });

    res.json({ data: parsed });
  } catch (error) {
    console.error('Error fetching daily performance:', error);
    res.status(500).json({ error: 'Failed to fetch daily performance' });
  }
});

// GET /api/performance/hourly - Get hourly metrics
router.get('/hourly', (req: Request, res: Response) => {
  try {
    const { chain = 'bsc', hours = 24 } = req.query;

    const metrics = db.prepare(`
      SELECT * FROM hourly_metrics
      WHERE chain = ?
      AND hour_start >= datetime('now', '-' || ? || ' hours')
      ORDER BY hour_start DESC
    `).all(chain as string, Number(hours));

    res.json({ data: metrics });
  } catch (error) {
    console.error('Error fetching hourly metrics:', error);
    res.status(500).json({ error: 'Failed to fetch hourly metrics' });
  }
});

// GET /api/performance/summary - Get performance summary
router.get('/summary', (req: Request, res: Response) => {
  try {
    const { chain = 'bsc' } = req.query;

    // Today's stats
    const today = db.prepare(`
      SELECT * FROM daily_performance
      WHERE chain = ? AND date = date('now')
    `).get(chain as string);

    // Yesterday's stats for comparison
    const yesterday = db.prepare(`
      SELECT * FROM daily_performance
      WHERE chain = ? AND date = date('now', '-1 day')
    `).get(chain as string);

    // Last 7 days totals
    const weekStats = db.prepare(`
      SELECT
        SUM(total_opportunities) as total_opportunities,
        SUM(total_executions) as total_executions,
        SUM(successful_executions) as successful_executions,
        SUM(CAST(net_profit_wei AS INTEGER)) as net_profit_wei,
        SUM(net_profit_usd) as net_profit_usd,
        AVG(success_rate) as avg_success_rate
      FROM daily_performance
      WHERE chain = ? AND date >= date('now', '-7 days')
    `).get(chain as string);

    // Last 30 days totals
    const monthStats = db.prepare(`
      SELECT
        SUM(total_opportunities) as total_opportunities,
        SUM(total_executions) as total_executions,
        SUM(successful_executions) as successful_executions,
        SUM(CAST(net_profit_wei AS INTEGER)) as net_profit_wei,
        SUM(net_profit_usd) as net_profit_usd,
        AVG(success_rate) as avg_success_rate
      FROM daily_performance
      WHERE chain = ? AND date >= date('now', '-30 days')
    `).get(chain as string);

    // All-time totals
    const allTimeStats = db.prepare(`
      SELECT
        SUM(total_opportunities) as total_opportunities,
        SUM(total_executions) as total_executions,
        SUM(successful_executions) as successful_executions,
        SUM(CAST(net_profit_wei AS INTEGER)) as net_profit_wei,
        SUM(net_profit_usd) as net_profit_usd,
        AVG(success_rate) as avg_success_rate
      FROM daily_performance
      WHERE chain = ?
    `).get(chain as string);

    res.json({
      data: {
        today,
        yesterday,
        week: weekStats,
        month: monthStats,
        all_time: allTimeStats
      }
    });
  } catch (error) {
    console.error('Error fetching performance summary:', error);
    res.status(500).json({ error: 'Failed to fetch performance summary' });
  }
});

// POST /api/performance/daily - Record daily performance (called at end of day)
router.post('/daily', (req: Request, res: Response) => {
  try {
    const {
      date,
      chain = 'bsc',
      total_opportunities,
      total_executions,
      successful_executions,
      failed_executions,
      skipped_opportunities,
      gross_profit_wei,
      gas_spent_wei,
      net_profit_wei,
      net_profit_usd,
      success_rate,
      avg_profit_per_tx_wei,
      our_rank,
      top_competitor_profit_wei,
      profit_by_pair,
      profit_by_dex
    } = req.body;

    // Upsert daily performance
    db.prepare(`
      INSERT INTO daily_performance (
        date, chain, total_opportunities, total_executions,
        successful_executions, failed_executions, skipped_opportunities,
        gross_profit_wei, gas_spent_wei, net_profit_wei, net_profit_usd,
        success_rate, avg_profit_per_tx_wei, our_rank, top_competitor_profit_wei,
        profit_by_pair, profit_by_dex
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(date, chain) DO UPDATE SET
        total_opportunities = excluded.total_opportunities,
        total_executions = excluded.total_executions,
        successful_executions = excluded.successful_executions,
        failed_executions = excluded.failed_executions,
        skipped_opportunities = excluded.skipped_opportunities,
        gross_profit_wei = excluded.gross_profit_wei,
        gas_spent_wei = excluded.gas_spent_wei,
        net_profit_wei = excluded.net_profit_wei,
        net_profit_usd = excluded.net_profit_usd,
        success_rate = excluded.success_rate,
        avg_profit_per_tx_wei = excluded.avg_profit_per_tx_wei,
        our_rank = excluded.our_rank,
        top_competitor_profit_wei = excluded.top_competitor_profit_wei,
        profit_by_pair = excluded.profit_by_pair,
        profit_by_dex = excluded.profit_by_dex,
        updated_at = datetime('now')
    `).run(
      date || new Date().toISOString().split('T')[0],
      chain,
      total_opportunities || 0,
      total_executions || 0,
      successful_executions || 0,
      failed_executions || 0,
      skipped_opportunities || 0,
      gross_profit_wei || '0',
      gas_spent_wei || '0',
      net_profit_wei || '0',
      net_profit_usd || 0,
      success_rate || 0,
      avg_profit_per_tx_wei || '0',
      our_rank || null,
      top_competitor_profit_wei || null,
      profit_by_pair ? JSON.stringify(profit_by_pair) : null,
      profit_by_dex ? JSON.stringify(profit_by_dex) : null
    );

    const performance = db.prepare(
      'SELECT * FROM daily_performance WHERE date = ? AND chain = ?'
    ).get(date || new Date().toISOString().split('T')[0], chain);

    res.json({ data: performance });
  } catch (error) {
    console.error('Error recording daily performance:', error);
    res.status(500).json({ error: 'Failed to record daily performance' });
  }
});

// POST /api/performance/hourly - Record hourly metrics
router.post('/hourly', (req: Request, res: Response) => {
  try {
    const {
      hour_start,
      chain = 'bsc',
      opportunities_detected,
      executions_attempted,
      executions_successful,
      gross_profit_wei,
      net_profit_wei,
      avg_gas_price_gwei,
      avg_execution_time_ms,
      competitor_activity_count
    } = req.body;

    db.prepare(`
      INSERT INTO hourly_metrics (
        hour_start, chain, opportunities_detected, executions_attempted,
        executions_successful, gross_profit_wei, net_profit_wei,
        avg_gas_price_gwei, avg_execution_time_ms, competitor_activity_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(hour_start, chain) DO UPDATE SET
        opportunities_detected = excluded.opportunities_detected,
        executions_attempted = excluded.executions_attempted,
        executions_successful = excluded.executions_successful,
        gross_profit_wei = excluded.gross_profit_wei,
        net_profit_wei = excluded.net_profit_wei,
        avg_gas_price_gwei = excluded.avg_gas_price_gwei,
        avg_execution_time_ms = excluded.avg_execution_time_ms,
        competitor_activity_count = excluded.competitor_activity_count
    `).run(
      hour_start,
      chain,
      opportunities_detected || 0,
      executions_attempted || 0,
      executions_successful || 0,
      gross_profit_wei || '0',
      net_profit_wei || '0',
      avg_gas_price_gwei || null,
      avg_execution_time_ms || null,
      competitor_activity_count || 0
    );

    const metrics = db.prepare(
      'SELECT * FROM hourly_metrics WHERE hour_start = ? AND chain = ?'
    ).get(hour_start, chain);

    res.json({ data: metrics });
  } catch (error) {
    console.error('Error recording hourly metrics:', error);
    res.status(500).json({ error: 'Failed to record hourly metrics' });
  }
});

export default router;
