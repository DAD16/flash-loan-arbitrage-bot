/**
 * Strategy API Routes
 * Endpoints for strategy configuration and management
 */

import { Router, Request, Response } from 'express';
import db from '../db.js';

const router = Router();

// GET /api/strategy/current - Get current strategy configuration
router.get('/current', (req: Request, res: Response) => {
  try {
    const { chain = 'bsc' } = req.query;

    const strategy = db.prepare(`
      SELECT * FROM strategy_snapshots
      WHERE chain = ?
      ORDER BY snapshot_at DESC
      LIMIT 1
    `).get(chain as string);

    if (!strategy) {
      // Return default strategy if none exists
      return res.json({
        data: {
          chain,
          min_profit_wei: '100000000000000000', // 0.1 BNB
          target_profit_wei: '500000000000000000', // 0.5 BNB
          max_position_wei: '10000000000000000000', // 10 BNB
          base_gas_gwei: 3.0,
          max_gas_gwei: 10.0,
          priority_fee_gwei: 1.0,
          enabled_pairs: [],
          dex_config: {},
          hourly_loss_limit_wei: '500000000000000000', // 0.5 BNB
          daily_loss_limit_wei: '2000000000000000000', // 2 BNB
          circuit_breaker_config: {
            consecutive_failures: 5,
            loss_threshold_wei: '1000000000000000000',
            cooldown_seconds: 300
          }
        }
      });
    }

    // Parse JSON fields
    const parsed = {
      ...strategy,
      enabled_pairs: (strategy as any).enabled_pairs ? JSON.parse((strategy as any).enabled_pairs) : [],
      dex_config: (strategy as any).dex_config ? JSON.parse((strategy as any).dex_config) : {},
      circuit_breaker_config: (strategy as any).circuit_breaker_config ? JSON.parse((strategy as any).circuit_breaker_config) : {},
      full_config: (strategy as any).full_config ? JSON.parse((strategy as any).full_config) : null
    };

    res.json({ data: parsed });
  } catch (error) {
    console.error('Error fetching strategy:', error);
    res.status(500).json({ error: 'Failed to fetch strategy' });
  }
});

// GET /api/strategy/history - Get strategy change history
router.get('/history', (req: Request, res: Response) => {
  try {
    const { chain = 'bsc', limit = 50 } = req.query;

    const history = db.prepare(`
      SELECT * FROM strategy_snapshots
      WHERE chain = ?
      ORDER BY snapshot_at DESC
      LIMIT ?
    `).all(chain as string, Number(limit));

    res.json({ data: history });
  } catch (error) {
    console.error('Error fetching strategy history:', error);
    res.status(500).json({ error: 'Failed to fetch strategy history' });
  }
});

// POST /api/strategy - Save new strategy configuration
router.post('/', (req: Request, res: Response) => {
  try {
    const {
      chain = 'bsc',
      min_profit_wei,
      target_profit_wei,
      max_position_wei,
      base_gas_gwei,
      max_gas_gwei,
      priority_fee_gwei,
      enabled_pairs,
      dex_config,
      hourly_loss_limit_wei,
      daily_loss_limit_wei,
      circuit_breaker_config,
      change_reason,
      change_source = 'dashboard'
    } = req.body;

    // Build full config object
    const fullConfig = {
      min_profit_wei,
      target_profit_wei,
      max_position_wei,
      base_gas_gwei,
      max_gas_gwei,
      priority_fee_gwei,
      enabled_pairs,
      dex_config,
      hourly_loss_limit_wei,
      daily_loss_limit_wei,
      circuit_breaker_config
    };

    const result = db.prepare(`
      INSERT INTO strategy_snapshots (
        chain, min_profit_wei, target_profit_wei, max_position_wei,
        base_gas_gwei, max_gas_gwei, priority_fee_gwei,
        enabled_pairs, dex_config,
        hourly_loss_limit_wei, daily_loss_limit_wei, circuit_breaker_config,
        full_config, change_reason, change_source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      chain,
      min_profit_wei || null,
      target_profit_wei || null,
      max_position_wei || null,
      base_gas_gwei || null,
      max_gas_gwei || null,
      priority_fee_gwei || null,
      enabled_pairs ? JSON.stringify(enabled_pairs) : null,
      dex_config ? JSON.stringify(dex_config) : null,
      hourly_loss_limit_wei || null,
      daily_loss_limit_wei || null,
      circuit_breaker_config ? JSON.stringify(circuit_breaker_config) : null,
      JSON.stringify(fullConfig),
      change_reason || null,
      change_source
    );

    const strategy = db.prepare('SELECT * FROM strategy_snapshots WHERE rowid = ?').get(result.lastInsertRowid);

    res.status(201).json({ data: strategy, message: 'Strategy saved' });
  } catch (error) {
    console.error('Error saving strategy:', error);
    res.status(500).json({ error: 'Failed to save strategy' });
  }
});

// GET /api/dexes - List available DEXes
router.get('/dexes', (req: Request, res: Response) => {
  try {
    const { chain = 'bsc', enabled_only = 'false' } = req.query;

    let sql = 'SELECT * FROM dexes WHERE chain = ?';
    if (enabled_only === 'true') {
      sql += ' AND is_enabled = 1';
    }
    sql += ' ORDER BY priority ASC';

    const dexes = db.prepare(sql).all(chain as string);

    res.json({ data: dexes });
  } catch (error) {
    console.error('Error fetching DEXes:', error);
    res.status(500).json({ error: 'Failed to fetch DEXes' });
  }
});

// PATCH /api/dexes/:id - Update DEX configuration
router.patch('/dexes/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { is_enabled, priority, max_slippage_bps } = req.body;

    const updates: string[] = [];
    const params: (string | number)[] = [];

    if (is_enabled !== undefined) {
      updates.push('is_enabled = ?');
      params.push(is_enabled ? 1 : 0);
    }
    if (priority !== undefined) {
      updates.push('priority = ?');
      params.push(priority);
    }
    if (max_slippage_bps !== undefined) {
      updates.push('max_slippage_bps = ?');
      params.push(max_slippage_bps);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    updates.push("updated_at = datetime('now')");
    params.push(id);

    db.prepare(`UPDATE dexes SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const dex = db.prepare('SELECT * FROM dexes WHERE id = ?').get(id);
    res.json({ data: dex });
  } catch (error) {
    console.error('Error updating DEX:', error);
    res.status(500).json({ error: 'Failed to update DEX' });
  }
});

// GET /api/tokens - List available tokens
router.get('/tokens', (req: Request, res: Response) => {
  try {
    const { chain = 'bsc', enabled_only = 'false' } = req.query;

    let sql = 'SELECT * FROM tokens WHERE chain = ?';
    if (enabled_only === 'true') {
      sql += ' AND is_enabled = 1';
    }
    sql += ' ORDER BY priority ASC';

    const tokens = db.prepare(sql).all(chain as string);

    res.json({ data: tokens });
  } catch (error) {
    console.error('Error fetching tokens:', error);
    res.status(500).json({ error: 'Failed to fetch tokens' });
  }
});

// PATCH /api/tokens/:id - Update token configuration
router.patch('/tokens/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { is_enabled, priority } = req.body;

    const updates: string[] = [];
    const params: (string | number)[] = [];

    if (is_enabled !== undefined) {
      updates.push('is_enabled = ?');
      params.push(is_enabled ? 1 : 0);
    }
    if (priority !== undefined) {
      updates.push('priority = ?');
      params.push(priority);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    updates.push("updated_at = datetime('now')");
    params.push(id);

    db.prepare(`UPDATE tokens SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const token = db.prepare('SELECT * FROM tokens WHERE id = ?').get(id);
    res.json({ data: token });
  } catch (error) {
    console.error('Error updating token:', error);
    res.status(500).json({ error: 'Failed to update token' });
  }
});

// POST /api/tokens - Add new token
router.post('/tokens', (req: Request, res: Response) => {
  try {
    const {
      address,
      chain = 'bsc',
      symbol,
      name,
      decimals = 18,
      logo_url,
      coingecko_id,
      priority = 50
    } = req.body;

    if (!address || !symbol) {
      return res.status(400).json({ error: 'Address and symbol are required' });
    }

    // Check if exists
    const existing = db.prepare(
      'SELECT id FROM tokens WHERE address = ? AND chain = ?'
    ).get(address, chain);

    if (existing) {
      return res.status(409).json({ error: 'Token already exists', id: (existing as { id: string }).id });
    }

    db.prepare(`
      INSERT INTO tokens (address, chain, symbol, name, decimals, logo_url, coingecko_id, priority)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(address, chain, symbol, name || null, decimals, logo_url || null, coingecko_id || null, priority);

    const token = db.prepare(
      'SELECT * FROM tokens WHERE address = ? AND chain = ?'
    ).get(address, chain);

    res.status(201).json({ data: token });
  } catch (error) {
    console.error('Error adding token:', error);
    res.status(500).json({ error: 'Failed to add token' });
  }
});

export default router;
