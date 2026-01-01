/**
 * Executions API Routes
 * Endpoints for our trade executions
 */

import { Router, Request, Response } from 'express';
import db, { ExecutionRow } from '../db.js';

const router = Router();

// GET /api/executions - List executions
router.get('/', (req: Request, res: Response) => {
  try {
    const { chain = 'bsc', status, limit = 100, offset = 0 } = req.query;

    let sql = 'SELECT * FROM executions WHERE chain = ?';
    const params: (string | number)[] = [chain as string];

    if (status) {
      sql += ' AND status = ?';
      params.push(status as string);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const executions = db.prepare(sql).all(...params);

    const { count } = db.prepare(
      'SELECT COUNT(*) as count FROM executions WHERE chain = ?'
    ).get(chain as string) as { count: number };

    res.json({
      data: executions,
      pagination: { total: count, limit: Number(limit), offset: Number(offset) }
    });
  } catch (error) {
    console.error('Error fetching executions:', error);
    res.status(500).json({ error: 'Failed to fetch executions' });
  }
});

// GET /api/executions/recent - Recent executions for live feed
router.get('/recent', (req: Request, res: Response) => {
  try {
    const { chain = 'bsc', limit = 20 } = req.query;

    const executions = db.prepare(`
      SELECT
        e.*,
        o.confidence,
        o.expected_profit_wei as opportunity_expected_profit
      FROM executions e
      LEFT JOIN opportunities o ON e.opportunity_id = o.id
      WHERE e.chain = ?
      ORDER BY e.created_at DESC
      LIMIT ?
    `).all(chain as string, Number(limit));

    res.json({ data: executions });
  } catch (error) {
    console.error('Error fetching recent executions:', error);
    res.status(500).json({ error: 'Failed to fetch recent executions' });
  }
});

// GET /api/executions/stats - Execution statistics
router.get('/stats', (req: Request, res: Response) => {
  try {
    const { chain = 'bsc', period = '24h' } = req.query;

    let periodStart: string;
    switch (period) {
      case '1h':
        periodStart = "datetime('now', '-1 hour')";
        break;
      case '24h':
        periodStart = "datetime('now', '-1 day')";
        break;
      case '7d':
        periodStart = "datetime('now', '-7 days')";
        break;
      case '30d':
        periodStart = "datetime('now', '-30 days')";
        break;
      default:
        periodStart = "datetime('now', '-1 day')";
    }

    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_executions,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'reverted' THEN 1 ELSE 0 END) as reverted,
        SUM(CASE WHEN was_frontrun = 1 THEN 1 ELSE 0 END) as frontrun_count,
        SUM(CAST(net_profit_wei AS INTEGER)) as total_net_profit_wei,
        SUM(net_profit_usd) as total_net_profit_usd,
        SUM(CAST(gas_cost_wei AS INTEGER)) as total_gas_cost_wei,
        AVG(execution_time_ms) as avg_execution_time_ms,
        AVG(actual_slippage_bps) as avg_slippage_bps
      FROM executions
      WHERE chain = ? AND created_at >= ${periodStart}
    `).get(chain as string);

    // Calculate success rate
    const statsObj = stats as Record<string, any>;
    const total = statsObj.total_executions || 0;
    const successful = statsObj.successful || 0;
    const successRate = total > 0 ? (successful / total) * 100 : 0;

    res.json({
      data: {
        ...statsObj,
        success_rate: successRate.toFixed(2)
      }
    });
  } catch (error) {
    console.error('Error fetching execution stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/executions/:id - Get execution details
router.get('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const execution = db.prepare('SELECT * FROM executions WHERE id = ?').get(id);

    if (!execution) {
      return res.status(404).json({ error: 'Execution not found' });
    }

    // Get related opportunity
    const opportunity = (execution as ExecutionRow).opportunity_id
      ? db.prepare('SELECT * FROM opportunities WHERE id = ?').get((execution as ExecutionRow).opportunity_id)
      : null;

    res.json({ data: { ...execution, opportunity } });
  } catch (error) {
    console.error('Error fetching execution:', error);
    res.status(500).json({ error: 'Failed to fetch execution' });
  }
});

// POST /api/executions - Record new execution
router.post('/', (req: Request, res: Response) => {
  try {
    const {
      opportunity_id,
      chain = 'bsc',
      tx_hash,
      route_tokens,
      route_token_symbols,
      route_dexes,
      expected_profit_wei,
      expected_slippage_bps
    } = req.body;

    const result = db.prepare(`
      INSERT INTO executions (
        opportunity_id, chain, tx_hash,
        route_tokens, route_token_symbols, route_dexes,
        expected_profit_wei, expected_slippage_bps,
        status, submitted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
    `).run(
      opportunity_id || null,
      chain,
      tx_hash || null,
      route_tokens ? JSON.stringify(route_tokens) : null,
      route_token_symbols ? JSON.stringify(route_token_symbols) : null,
      route_dexes ? JSON.stringify(route_dexes) : null,
      expected_profit_wei || null,
      expected_slippage_bps || null
    );

    const execution = db.prepare('SELECT * FROM executions WHERE rowid = ?').get(result.lastInsertRowid);

    // Update opportunity if linked
    if (opportunity_id) {
      db.prepare(
        "UPDATE opportunities SET status = 'executing', execution_id = ? WHERE id = ?"
      ).run((execution as ExecutionRow).id, opportunity_id);
    }

    res.status(201).json({ data: execution });
  } catch (error) {
    console.error('Error creating execution:', error);
    res.status(500).json({ error: 'Failed to create execution' });
  }
});

// PATCH /api/executions/:id - Update execution (after confirmation)
router.patch('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      tx_hash,
      block_number,
      block_timestamp,
      actual_profit_wei,
      gas_used,
      gas_price_wei,
      gas_cost_wei,
      net_profit_wei,
      net_profit_usd,
      actual_slippage_bps,
      status,
      revert_reason,
      error_message,
      execution_time_ms,
      was_frontrun,
      frontrunner_address
    } = req.body;

    const updates: string[] = [];
    const params: (string | number | null)[] = [];

    const fieldMap: Record<string, any> = {
      tx_hash, block_number, block_timestamp, actual_profit_wei,
      gas_used, gas_price_wei, gas_cost_wei, net_profit_wei,
      net_profit_usd, actual_slippage_bps, status, revert_reason,
      error_message, execution_time_ms, was_frontrun, frontrunner_address
    };

    for (const [key, value] of Object.entries(fieldMap)) {
      if (value !== undefined) {
        updates.push(`${key} = ?`);
        params.push(value);
      }
    }

    if (status === 'success' || status === 'failed' || status === 'reverted') {
      updates.push("confirmed_at = datetime('now')");
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    params.push(id);
    db.prepare(`UPDATE executions SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    // Update linked opportunity status
    const execution = db.prepare('SELECT * FROM executions WHERE id = ?').get(id) as ExecutionRow;
    if (execution.opportunity_id && status) {
      const oppStatus = status === 'success' ? 'completed' : 'failed';
      db.prepare('UPDATE opportunities SET status = ? WHERE id = ?').run(oppStatus, execution.opportunity_id);
    }

    res.json({ data: execution });
  } catch (error) {
    console.error('Error updating execution:', error);
    res.status(500).json({ error: 'Failed to update execution' });
  }
});

export default router;
