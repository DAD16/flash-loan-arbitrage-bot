/**
 * Competitors API Routes
 * Endpoints for competitor tracking and analysis
 */

import { Router, Request, Response } from 'express';
import db, { CompetitorRow } from '../db.js';

const router = Router();

// GET /api/competitors - List all competitors
router.get('/', (req: Request, res: Response) => {
  try {
    const { chain = 'bsc', watched, limit = 100, offset = 0 } = req.query;

    let sql = 'SELECT * FROM competitors WHERE chain = ?';
    const params: (string | number)[] = [chain as string];

    if (watched === 'true') {
      sql += ' AND is_watched = 1';
    }

    sql += ' ORDER BY total_profit_wei DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const competitors = db.prepare(sql).all(...params) as CompetitorRow[];

    // Get total count
    const countSql = watched === 'true'
      ? 'SELECT COUNT(*) as count FROM competitors WHERE chain = ? AND is_watched = 1'
      : 'SELECT COUNT(*) as count FROM competitors WHERE chain = ?';
    const { count } = db.prepare(countSql).get(chain as string) as { count: number };

    res.json({
      data: competitors,
      pagination: {
        total: count,
        limit: Number(limit),
        offset: Number(offset)
      }
    });
  } catch (error) {
    console.error('Error fetching competitors:', error);
    res.status(500).json({ error: 'Failed to fetch competitors' });
  }
});

// GET /api/competitors/leaderboard - Top competitors by profit
router.get('/leaderboard', (req: Request, res: Response) => {
  try {
    const { chain = 'bsc', period = '24h', limit = 20 } = req.query;

    // For now, return all-time leaderboard
    // TODO: Add period filtering when we have more transaction data
    const competitors = db.prepare(`
      SELECT
        c.*,
        (SELECT COUNT(*) FROM competitor_transactions ct WHERE ct.competitor_id = c.id) as tx_count
      FROM competitors c
      WHERE c.chain = ?
      ORDER BY CAST(c.total_profit_wei AS INTEGER) DESC
      LIMIT ?
    `).all(chain as string, Number(limit));

    res.json({ data: competitors });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// GET /api/competitors/:id - Get competitor details
router.get('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const competitor = db.prepare('SELECT * FROM competitors WHERE id = ?').get(id) as CompetitorRow | undefined;

    if (!competitor) {
      return res.status(404).json({ error: 'Competitor not found' });
    }

    // Get recent transactions
    const transactions = db.prepare(`
      SELECT * FROM competitor_transactions
      WHERE competitor_id = ?
      ORDER BY block_timestamp DESC
      LIMIT 50
    `).all(id);

    // Get strategy analysis if available
    const strategy = db.prepare(`
      SELECT * FROM competitor_strategies
      WHERE competitor_id = ?
      ORDER BY analysis_period_end DESC
      LIMIT 1
    `).get(id);

    res.json({
      data: {
        ...competitor,
        transactions,
        strategy
      }
    });
  } catch (error) {
    console.error('Error fetching competitor:', error);
    res.status(500).json({ error: 'Failed to fetch competitor' });
  }
});

// POST /api/competitors - Add a new competitor to track
router.post('/', (req: Request, res: Response) => {
  try {
    const { address, chain = 'bsc', label, notes } = req.body;

    if (!address) {
      return res.status(400).json({ error: 'Address is required' });
    }

    // Check if already exists
    const existing = db.prepare(
      'SELECT id FROM competitors WHERE address = ? AND chain = ?'
    ).get(address, chain);

    if (existing) {
      return res.status(409).json({ error: 'Competitor already exists', id: (existing as { id: string }).id });
    }

    const result = db.prepare(`
      INSERT INTO competitors (address, chain, label, notes, is_watched)
      VALUES (?, ?, ?, ?, 1)
    `).run(address, chain, label || null, notes || null);

    // Fetch the created competitor
    const competitor = db.prepare(
      'SELECT * FROM competitors WHERE address = ? AND chain = ?'
    ).get(address, chain);

    res.status(201).json({ data: competitor });
  } catch (error) {
    console.error('Error creating competitor:', error);
    res.status(500).json({ error: 'Failed to create competitor' });
  }
});

// PATCH /api/competitors/:id - Update competitor
router.patch('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { label, notes, is_watched } = req.body;

    const updates: string[] = [];
    const params: (string | number | null)[] = [];

    if (label !== undefined) {
      updates.push('label = ?');
      params.push(label);
    }
    if (notes !== undefined) {
      updates.push('notes = ?');
      params.push(notes);
    }
    if (is_watched !== undefined) {
      updates.push('is_watched = ?');
      params.push(is_watched ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    updates.push("updated_at = datetime('now')");
    params.push(id);

    db.prepare(`UPDATE competitors SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const competitor = db.prepare('SELECT * FROM competitors WHERE id = ?').get(id);
    res.json({ data: competitor });
  } catch (error) {
    console.error('Error updating competitor:', error);
    res.status(500).json({ error: 'Failed to update competitor' });
  }
});

// DELETE /api/competitors/:id - Remove competitor
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = db.prepare('DELETE FROM competitors WHERE id = ?').run(id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Competitor not found' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting competitor:', error);
    res.status(500).json({ error: 'Failed to delete competitor' });
  }
});

// GET /api/competitors/:id/transactions - Get competitor transactions
router.get('/:id/transactions', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    const transactions = db.prepare(`
      SELECT * FROM competitor_transactions
      WHERE competitor_id = ?
      ORDER BY block_timestamp DESC
      LIMIT ? OFFSET ?
    `).all(id, Number(limit), Number(offset));

    const { count } = db.prepare(
      'SELECT COUNT(*) as count FROM competitor_transactions WHERE competitor_id = ?'
    ).get(id) as { count: number };

    res.json({
      data: transactions,
      pagination: { total: count, limit: Number(limit), offset: Number(offset) }
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

export default router;
