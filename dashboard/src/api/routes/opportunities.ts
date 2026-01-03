/**
 * Opportunities API Routes
 * Endpoints for our arbitrage opportunities
 */

import { Router, Request, Response } from 'express';
import db, { OpportunityRow } from '../db.js';

const router = Router();

// GET /api/opportunities - List opportunities
router.get('/', (req: Request, res: Response) => {
  try {
    const { chain = 'bsc', status, confidence, limit = 100, offset = 0 } = req.query;

    // Use ISO format timestamp for comparison (matches database format)
    const nowISO = new Date().toISOString();

    // Filter out expired opportunities by default
    let sql = `SELECT * FROM opportunities WHERE chain = ? AND (valid_until IS NULL OR valid_until > ?)`;
    const params: (string | number)[] = [chain as string, nowISO];

    if (status) {
      sql += ' AND status = ?';
      params.push(status as string);
    }

    if (confidence) {
      sql += ' AND confidence = ?';
      params.push(confidence as string);
    }

    sql += ' ORDER BY detected_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const opportunities = db.prepare(sql).all(...params) as OpportunityRow[];

    // Parse JSON fields
    const parsed = opportunities.map(opp => ({
      ...opp,
      route_tokens: JSON.parse(opp.route_tokens),
      route_token_symbols: opp.route_token_symbols ? JSON.parse(opp.route_token_symbols) : null,
      route_dexes: JSON.parse(opp.route_dexes),
      price_data: opp.price_data ? JSON.parse(opp.price_data) : null,
      liquidity_data: opp.liquidity_data ? JSON.parse(opp.liquidity_data) : null
    }));

    const { count } = db.prepare(
      `SELECT COUNT(*) as count FROM opportunities WHERE chain = ? AND (valid_until IS NULL OR valid_until > ?)`
    ).get(chain as string, nowISO) as { count: number };

    res.json({
      data: parsed,
      pagination: { total: count, limit: Number(limit), offset: Number(offset) }
    });
  } catch (error) {
    console.error('Error fetching opportunities:', error);
    res.status(500).json({ error: 'Failed to fetch opportunities' });
  }
});

// GET /api/opportunities/pending - Get pending opportunities (ready for execution)
router.get('/pending', (req: Request, res: Response) => {
  try {
    const { chain = 'bsc', min_profit_wei } = req.query;

    // Use ISO format timestamp for comparison (matches database format)
    const nowISO = new Date().toISOString();

    let sql = `
      SELECT * FROM opportunities
      WHERE chain = ?
      AND status IN ('detected', 'evaluating')
      AND (valid_until IS NULL OR valid_until > ?)
    `;
    const params: (string | number)[] = [chain as string, nowISO];

    if (min_profit_wei) {
      sql += ' AND CAST(expected_net_profit_wei AS INTEGER) >= ?';
      params.push(Number(min_profit_wei));
    }

    sql += ' ORDER BY CAST(expected_net_profit_wei AS INTEGER) DESC LIMIT 50';

    const opportunities = db.prepare(sql).all(...params);

    res.json({ data: opportunities });
  } catch (error) {
    console.error('Error fetching pending opportunities:', error);
    res.status(500).json({ error: 'Failed to fetch pending opportunities' });
  }
});

// GET /api/opportunities/stats - Opportunity statistics
router.get('/stats', (req: Request, res: Response) => {
  try {
    const { chain = 'bsc', period = '24h' } = req.query;

    // Get period start
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
      default:
        periodStart = "datetime('now', '-1 day')";
    }

    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_opportunities,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped,
        SUM(CASE WHEN status IN ('detected', 'evaluating') THEN 1 ELSE 0 END) as pending,
        AVG(CAST(expected_profit_wei AS REAL)) as avg_expected_profit,
        SUM(CASE WHEN confidence = 'high' OR confidence = 'very_high' THEN 1 ELSE 0 END) as high_confidence_count
      FROM opportunities
      WHERE chain = ? AND detected_at >= ${periodStart}
    `).get(chain as string);

    // Get by confidence breakdown
    const byConfidence = db.prepare(`
      SELECT confidence, COUNT(*) as count
      FROM opportunities
      WHERE chain = ? AND detected_at >= ${periodStart}
      GROUP BY confidence
    `).all(chain as string);

    res.json({ data: { ...(stats as Record<string, any>), by_confidence: byConfidence } });
  } catch (error) {
    console.error('Error fetching opportunity stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/opportunities/:id - Get opportunity details
router.get('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const opportunity = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(id) as OpportunityRow | undefined;

    if (!opportunity) {
      return res.status(404).json({ error: 'Opportunity not found' });
    }

    // Get execution if exists
    let execution = null;
    if (opportunity.execution_id) {
      execution = db.prepare('SELECT * FROM executions WHERE id = ?').get(opportunity.execution_id);
    }

    res.json({
      data: {
        ...opportunity,
        route_tokens: JSON.parse(opportunity.route_tokens),
        route_token_symbols: opportunity.route_token_symbols ? JSON.parse(opportunity.route_token_symbols) : null,
        route_dexes: JSON.parse(opportunity.route_dexes),
        execution
      }
    });
  } catch (error) {
    console.error('Error fetching opportunity:', error);
    res.status(500).json({ error: 'Failed to fetch opportunity' });
  }
});

// POST /api/opportunities - Create new opportunity (used by detection system)
router.post('/', (req: Request, res: Response) => {
  try {
    const {
      chain = 'bsc',
      route_tokens,
      route_token_symbols,
      route_dexes,
      expected_profit_wei,
      expected_profit_usd,
      expected_gas_wei,
      expected_net_profit_wei,
      confidence,
      confidence_score,
      valid_until,
      price_data,
      liquidity_data
    } = req.body;

    if (!route_tokens || !route_dexes || !expected_profit_wei || !confidence) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = db.prepare(`
      INSERT INTO opportunities (
        chain, route_tokens, route_token_symbols, route_dexes,
        expected_profit_wei, expected_profit_usd, expected_gas_wei, expected_net_profit_wei,
        confidence, confidence_score, valid_until, price_data, liquidity_data, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'detected')
    `).run(
      chain,
      JSON.stringify(route_tokens),
      route_token_symbols ? JSON.stringify(route_token_symbols) : null,
      JSON.stringify(route_dexes),
      expected_profit_wei,
      expected_profit_usd || null,
      expected_gas_wei || null,
      expected_net_profit_wei || null,
      confidence,
      confidence_score || null,
      valid_until || null,
      price_data ? JSON.stringify(price_data) : null,
      liquidity_data ? JSON.stringify(liquidity_data) : null
    );

    const opportunity = db.prepare('SELECT * FROM opportunities WHERE rowid = ?').get(result.lastInsertRowid);

    res.status(201).json({ data: opportunity });
  } catch (error) {
    console.error('Error creating opportunity:', error);
    res.status(500).json({ error: 'Failed to create opportunity' });
  }
});

// POST /api/opportunities/:id/execute - Execute an opportunity
router.post('/:id/execute', (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get the opportunity
    const opportunity = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(id) as OpportunityRow | undefined;

    if (!opportunity) {
      return res.status(404).json({ error: 'Opportunity not found' });
    }

    // Check if opportunity is in a valid state for execution
    if (!['detected', 'evaluating'].includes(opportunity.status)) {
      return res.status(400).json({
        error: `Cannot execute opportunity in '${opportunity.status}' status`
      });
    }

    // Generate a simulated tx hash (in production, this would be the real tx)
    const txHash = '0x' + Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');

    // Create execution record
    const executionResult = db.prepare(`
      INSERT INTO executions (
        opportunity_id, chain, tx_hash,
        route_tokens, route_token_symbols, route_dexes,
        expected_profit_wei, expected_slippage_bps,
        status, submitted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
    `).run(
      id,
      opportunity.chain,
      txHash,
      opportunity.route_tokens,
      opportunity.route_token_symbols,
      opportunity.route_dexes,
      opportunity.expected_profit_wei,
      20 // default slippage
    );

    const execution = db.prepare('SELECT * FROM executions WHERE rowid = ?').get(executionResult.lastInsertRowid) as any;

    // Update opportunity status to executing
    db.prepare(
      "UPDATE opportunities SET status = 'executing', execution_id = ? WHERE id = ?"
    ).run(execution.id, id);

    // Simulate execution result (in production, this would wait for tx confirmation)
    // For demo, we'll randomly succeed or fail with realistic timing
    const success = Math.random() > 0.3; // 70% success rate
    const executionTimeMs = Math.floor(1500 + Math.random() * 2000); // 1.5-3.5s

    setTimeout(() => {
      if (success) {
        // Successful execution
        const actualProfit = BigInt(opportunity.expected_profit_wei || '0');
        const slippageFactor = 0.9 + Math.random() * 0.15; // 90-105% of expected
        const actualProfitWei = (actualProfit * BigInt(Math.floor(slippageFactor * 100))) / 100n;
        const gasUsed = Math.floor(200000 + Math.random() * 150000);
        const gasPriceWei = BigInt(Math.floor(3e9 + Math.random() * 4e9)); // 3-7 gwei
        const gasCostWei = gasPriceWei * BigInt(gasUsed);
        const netProfitWei = actualProfitWei - gasCostWei;
        const netProfitUsd = Number(netProfitWei) / 1e18 * 600; // Assume $600/BNB

        db.prepare(`
          UPDATE executions SET
            status = 'success',
            block_number = ?,
            block_timestamp = datetime('now'),
            actual_profit_wei = ?,
            gas_used = ?,
            gas_price_wei = ?,
            gas_cost_wei = ?,
            net_profit_wei = ?,
            net_profit_usd = ?,
            actual_slippage_bps = ?,
            execution_time_ms = ?,
            confirmed_at = datetime('now')
          WHERE id = ?
        `).run(
          Math.floor(35000000 + Math.random() * 500000),
          actualProfitWei.toString(),
          gasUsed,
          gasPriceWei.toString(),
          gasCostWei.toString(),
          netProfitWei.toString(),
          netProfitUsd,
          Math.floor(Math.random() * 50),
          executionTimeMs,
          execution.id
        );

        db.prepare("UPDATE opportunities SET status = 'completed' WHERE id = ?").run(id);
      } else {
        // Failed execution
        const revertReasons = ['K', 'INSUFFICIENT_OUTPUT_AMOUNT', 'EXPIRED', 'TRANSFER_FAILED'];
        const revertReason = revertReasons[Math.floor(Math.random() * revertReasons.length)];

        db.prepare(`
          UPDATE executions SET
            status = 'reverted',
            revert_reason = ?,
            execution_time_ms = ?,
            confirmed_at = datetime('now')
          WHERE id = ?
        `).run(revertReason, executionTimeMs, execution.id);

        db.prepare("UPDATE opportunities SET status = 'failed' WHERE id = ?").run(id);
      }
    }, 100); // Quick simulation for demo

    res.status(202).json({
      data: {
        execution_id: execution.id,
        tx_hash: txHash,
        status: 'pending',
        message: 'Execution submitted'
      }
    });
  } catch (error) {
    console.error('Error executing opportunity:', error);
    res.status(500).json({ error: 'Failed to execute opportunity' });
  }
});

// PATCH /api/opportunities/:id - Update opportunity status
router.patch('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, execution_id, skip_reason } = req.body;

    const updates: string[] = [];
    const params: (string | number | null)[] = [];

    if (status) {
      updates.push('status = ?');
      params.push(status);
    }
    if (execution_id !== undefined) {
      updates.push('execution_id = ?');
      params.push(execution_id);
    }
    if (skip_reason !== undefined) {
      updates.push('skip_reason = ?');
      params.push(skip_reason);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    params.push(id);
    db.prepare(`UPDATE opportunities SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const opportunity = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(id);
    res.json({ data: opportunity });
  } catch (error) {
    console.error('Error updating opportunity:', error);
    res.status(500).json({ error: 'Failed to update opportunity' });
  }
});

export default router;
