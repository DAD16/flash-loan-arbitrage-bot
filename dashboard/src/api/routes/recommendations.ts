/**
 * AI Recommendations API Routes
 * Endpoints for AI-generated insights and recommendations
 */

import { Router, Request, Response } from 'express';
import db, { RecommendationRow } from '../db.js';

const router = Router();

// GET /api/recommendations - List recommendations
router.get('/', (req: Request, res: Response) => {
  try {
    const { chain = 'bsc', status, priority, category, limit = 50, offset = 0 } = req.query;

    let sql = 'SELECT * FROM ai_recommendations WHERE (chain = ? OR chain IS NULL)';
    const params: (string | number)[] = [chain as string];

    if (status) {
      sql += ' AND status = ?';
      params.push(status as string);
    }

    if (priority) {
      sql += ' AND priority = ?';
      params.push(priority as string);
    }

    if (category) {
      sql += ' AND category = ?';
      params.push(category as string);
    }

    // Exclude expired
    sql += " AND (expires_at IS NULL OR expires_at > datetime('now'))";

    sql += ' ORDER BY CASE priority WHEN \'critical\' THEN 1 WHEN \'warning\' THEN 2 ELSE 3 END, created_at DESC';
    sql += ' LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const recommendations = db.prepare(sql).all(...params);

    // Parse JSON fields
    const parsed = recommendations.map(rec => {
      const row = rec as RecommendationRow;
      return {
        ...row,
        evidence: row.evidence ? JSON.parse(row.evidence) : null,
        suggested_action: row.suggested_action ? JSON.parse(row.suggested_action) : null,
        validation_result: row.validation_result ? JSON.parse(row.validation_result) : null
      };
    });

    const { count } = db.prepare(
      "SELECT COUNT(*) as count FROM ai_recommendations WHERE (chain = ? OR chain IS NULL) AND (expires_at IS NULL OR expires_at > datetime('now'))"
    ).get(chain as string) as { count: number };

    res.json({
      data: parsed,
      pagination: { total: count, limit: Number(limit), offset: Number(offset) }
    });
  } catch (error) {
    console.error('Error fetching recommendations:', error);
    res.status(500).json({ error: 'Failed to fetch recommendations' });
  }
});

// GET /api/recommendations/pending - Get actionable recommendations
router.get('/pending', (req: Request, res: Response) => {
  try {
    const { chain = 'bsc' } = req.query;

    const recommendations = db.prepare(`
      SELECT * FROM ai_recommendations
      WHERE (chain = ? OR chain IS NULL)
      AND status = 'pending'
      AND (expires_at IS NULL OR expires_at > datetime('now'))
      ORDER BY
        CASE priority WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
        expected_profit_increase_pct DESC NULLS LAST
      LIMIT 20
    `).all(chain as string);

    res.json({ data: recommendations });
  } catch (error) {
    console.error('Error fetching pending recommendations:', error);
    res.status(500).json({ error: 'Failed to fetch pending recommendations' });
  }
});

// GET /api/recommendations/quick-wins - High-impact, easy recommendations
router.get('/quick-wins', (req: Request, res: Response) => {
  try {
    const { chain = 'bsc' } = req.query;

    const recommendations = db.prepare(`
      SELECT * FROM ai_recommendations
      WHERE (chain = ? OR chain IS NULL)
      AND status = 'pending'
      AND expected_profit_increase_pct > 5
      AND (expires_at IS NULL OR expires_at > datetime('now'))
      ORDER BY expected_profit_increase_pct DESC
      LIMIT 10
    `).all(chain as string);

    res.json({ data: recommendations });
  } catch (error) {
    console.error('Error fetching quick wins:', error);
    res.status(500).json({ error: 'Failed to fetch quick wins' });
  }
});

// GET /api/recommendations/:id - Get recommendation details
router.get('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const recommendation = db.prepare('SELECT * FROM ai_recommendations WHERE id = ?').get(id);

    if (!recommendation) {
      return res.status(404).json({ error: 'Recommendation not found' });
    }

    res.json({ data: recommendation });
  } catch (error) {
    console.error('Error fetching recommendation:', error);
    res.status(500).json({ error: 'Failed to fetch recommendation' });
  }
});

// POST /api/recommendations - Create new recommendation (used by AI analysis)
router.post('/', (req: Request, res: Response) => {
  try {
    const {
      chain,
      category,
      priority = 'info',
      title,
      description,
      evidence,
      suggested_action,
      expected_impact,
      expected_profit_increase_pct,
      expires_at
    } = req.body;

    if (!category || !title || !description) {
      return res.status(400).json({ error: 'Missing required fields: category, title, description' });
    }

    const result = db.prepare(`
      INSERT INTO ai_recommendations (
        chain, category, priority, title, description,
        evidence, suggested_action, expected_impact,
        expected_profit_increase_pct, expires_at, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(
      chain || null,
      category,
      priority,
      title,
      description,
      evidence ? JSON.stringify(evidence) : null,
      suggested_action ? JSON.stringify(suggested_action) : null,
      expected_impact || null,
      expected_profit_increase_pct || null,
      expires_at || null
    );

    const recommendation = db.prepare('SELECT * FROM ai_recommendations WHERE rowid = ?').get(result.lastInsertRowid);

    res.status(201).json({ data: recommendation });
  } catch (error) {
    console.error('Error creating recommendation:', error);
    res.status(500).json({ error: 'Failed to create recommendation' });
  }
});

// POST /api/recommendations/:id/apply - Apply a recommendation
router.post('/:id/apply', (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    db.prepare(`
      UPDATE ai_recommendations
      SET status = 'applied', applied_at = datetime('now')
      WHERE id = ?
    `).run(id);

    const recommendation = db.prepare('SELECT * FROM ai_recommendations WHERE id = ?').get(id);

    if (!recommendation) {
      return res.status(404).json({ error: 'Recommendation not found' });
    }

    res.json({ data: recommendation, message: 'Recommendation applied' });
  } catch (error) {
    console.error('Error applying recommendation:', error);
    res.status(500).json({ error: 'Failed to apply recommendation' });
  }
});

// POST /api/recommendations/:id/dismiss - Dismiss a recommendation
router.post('/:id/dismiss', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    db.prepare(`
      UPDATE ai_recommendations
      SET status = 'dismissed', dismissed_at = datetime('now'), dismissed_reason = ?
      WHERE id = ?
    `).run(reason || null, id);

    const recommendation = db.prepare('SELECT * FROM ai_recommendations WHERE id = ?').get(id);

    if (!recommendation) {
      return res.status(404).json({ error: 'Recommendation not found' });
    }

    res.json({ data: recommendation, message: 'Recommendation dismissed' });
  } catch (error) {
    console.error('Error dismissing recommendation:', error);
    res.status(500).json({ error: 'Failed to dismiss recommendation' });
  }
});

// POST /api/recommendations/:id/validate - Record validation result
router.post('/:id/validate', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { was_validated, validation_result, actual_impact_pct } = req.body;

    db.prepare(`
      UPDATE ai_recommendations
      SET was_validated = ?, validation_result = ?, actual_impact_pct = ?
      WHERE id = ?
    `).run(
      was_validated ? 1 : 0,
      validation_result ? JSON.stringify(validation_result) : null,
      actual_impact_pct || null,
      id
    );

    const recommendation = db.prepare('SELECT * FROM ai_recommendations WHERE id = ?').get(id);

    res.json({ data: recommendation });
  } catch (error) {
    console.error('Error validating recommendation:', error);
    res.status(500).json({ error: 'Failed to validate recommendation' });
  }
});

// GET /api/patterns - List detected patterns
router.get('/patterns', (req: Request, res: Response) => {
  try {
    const { chain = 'bsc', pattern_type, active_only = 'true' } = req.query;

    let sql = 'SELECT * FROM patterns WHERE (chain = ? OR chain IS NULL)';
    const params: (string | number)[] = [chain as string];

    if (pattern_type) {
      sql += ' AND pattern_type = ?';
      params.push(pattern_type as string);
    }

    if (active_only === 'true') {
      sql += ' AND is_active = 1';
    }

    sql += ' ORDER BY confidence_score DESC';

    const patterns = db.prepare(sql).all(...params);

    res.json({ data: patterns });
  } catch (error) {
    console.error('Error fetching patterns:', error);
    res.status(500).json({ error: 'Failed to fetch patterns' });
  }
});

export default router;
