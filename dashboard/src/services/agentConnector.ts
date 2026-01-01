/**
 * Agent Database Connector
 * Provides database access for all Matrix agents
 *
 * Used by: NEO, ORACLE, SATI, TRINITY, SERAPH, CYPHER, and all other agents
 */

import Database from 'better-sqlite3';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '../../db/matrix.db');

export interface Opportunity {
  id?: string;
  chain: string;
  routeTokens: string[];
  routeTokenSymbols?: string[];
  routeDexes: string[];
  expectedProfitWei: string;
  expectedProfitUsd?: number;
  expectedGasWei?: string;
  expectedNetProfitWei?: string;
  confidence: 'low' | 'medium' | 'high' | 'very_high';
  confidenceScore?: number;
  validUntil?: string;
  priceData?: Record<string, any>;
  liquidityData?: Record<string, any>;
}

export interface Execution {
  id?: string;
  opportunityId?: string;
  chain: string;
  txHash?: string;
  routeTokens?: string[];
  routeTokenSymbols?: string[];
  routeDexes?: string[];
  expectedProfitWei?: string;
  actualProfitWei?: string;
  gasUsed?: number;
  gasPriceWei?: string;
  gasCostWei?: string;
  netProfitWei?: string;
  netProfitUsd?: number;
  expectedSlippageBps?: number;
  actualSlippageBps?: number;
  status: 'pending' | 'success' | 'failed' | 'reverted';
  revertReason?: string;
  errorMessage?: string;
  executionTimeMs?: number;
  wasFrontrun?: boolean;
  frontrunnerAddress?: string;
}

export interface AIRecommendation {
  id?: string;
  chain?: string;
  category: string;
  priority: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  evidence?: Record<string, any>;
  suggestedAction?: Record<string, any>;
  expectedImpact?: string;
  expectedProfitIncreasePct?: number;
  expiresAt?: string;
}

export interface StrategyConfig {
  chain: string;
  minProfitWei?: string;
  targetProfitWei?: string;
  maxPositionWei?: string;
  baseGasGwei?: number;
  maxGasGwei?: number;
  priorityFeeGwei?: number;
  enabledPairs?: string[];
  dexConfig?: Record<string, any>;
  hourlyLossLimitWei?: string;
  dailyLossLimitWei?: string;
  circuitBreakerConfig?: {
    consecutiveFailures: number;
    lossThresholdWei: string;
    cooldownSeconds: number;
  };
}

/**
 * AgentConnector - Database interface for Matrix agents
 */
export class AgentConnector {
  private db: Database.Database;
  private agentName: string;

  constructor(agentName: string) {
    this.agentName = agentName;
    this.db = new Database(DB_PATH);
    this.db.pragma('foreign_keys = ON');
    console.log(`[${agentName}] Connected to database`);
  }

  // ============ OPPORTUNITIES ============

  /**
   * Record a detected opportunity (used by ORACLE)
   */
  createOpportunity(opp: Opportunity): string {
    const result = this.db.prepare(`
      INSERT INTO opportunities (
        chain, route_tokens, route_token_symbols, route_dexes,
        expected_profit_wei, expected_profit_usd, expected_gas_wei, expected_net_profit_wei,
        confidence, confidence_score, valid_until, price_data, liquidity_data, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'detected')
    `).run(
      opp.chain,
      JSON.stringify(opp.routeTokens),
      opp.routeTokenSymbols ? JSON.stringify(opp.routeTokenSymbols) : null,
      JSON.stringify(opp.routeDexes),
      opp.expectedProfitWei,
      opp.expectedProfitUsd || null,
      opp.expectedGasWei || null,
      opp.expectedNetProfitWei || null,
      opp.confidence,
      opp.confidenceScore || null,
      opp.validUntil || null,
      opp.priceData ? JSON.stringify(opp.priceData) : null,
      opp.liquidityData ? JSON.stringify(opp.liquidityData) : null
    );

    const created = this.db.prepare('SELECT id FROM opportunities WHERE rowid = ?').get(result.lastInsertRowid) as { id: string };
    console.log(`[${this.agentName}] Created opportunity ${created.id}`);
    return created.id;
  }

  /**
   * Get pending opportunities for execution (used by NEO, TRINITY)
   */
  getPendingOpportunities(chain: string, minProfitWei?: string): Opportunity[] {
    let sql = `
      SELECT * FROM opportunities
      WHERE chain = ?
      AND status IN ('detected', 'evaluating')
      AND (valid_until IS NULL OR valid_until > datetime('now'))
    `;
    const params: (string | number)[] = [chain];

    if (minProfitWei) {
      sql += ' AND CAST(expected_net_profit_wei AS INTEGER) >= ?';
      params.push(Number(minProfitWei));
    }

    sql += ' ORDER BY CAST(expected_net_profit_wei AS INTEGER) DESC LIMIT 50';

    return this.db.prepare(sql).all(...params) as Opportunity[];
  }

  /**
   * Update opportunity status (used by NEO, TRINITY)
   */
  updateOpportunityStatus(id: string, status: string, executionId?: string, skipReason?: string): void {
    const updates: string[] = ['status = ?'];
    const params: (string | null)[] = [status];

    if (executionId) {
      updates.push('execution_id = ?');
      params.push(executionId);
    }
    if (skipReason) {
      updates.push('skip_reason = ?');
      params.push(skipReason);
    }

    params.push(id);
    this.db.prepare(`UPDATE opportunities SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }

  // ============ EXECUTIONS ============

  /**
   * Record execution attempt (used by TRINITY)
   */
  createExecution(exec: Execution): string {
    const result = this.db.prepare(`
      INSERT INTO executions (
        opportunity_id, chain, tx_hash,
        route_tokens, route_token_symbols, route_dexes,
        expected_profit_wei, expected_slippage_bps,
        status, submitted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
    `).run(
      exec.opportunityId || null,
      exec.chain,
      exec.txHash || null,
      exec.routeTokens ? JSON.stringify(exec.routeTokens) : null,
      exec.routeTokenSymbols ? JSON.stringify(exec.routeTokenSymbols) : null,
      exec.routeDexes ? JSON.stringify(exec.routeDexes) : null,
      exec.expectedProfitWei || null,
      exec.expectedSlippageBps || null
    );

    const created = this.db.prepare('SELECT id FROM executions WHERE rowid = ?').get(result.lastInsertRowid) as { id: string };

    // Update opportunity status
    if (exec.opportunityId) {
      this.updateOpportunityStatus(exec.opportunityId, 'executing', created.id);
    }

    console.log(`[${this.agentName}] Created execution ${created.id}`);
    return created.id;
  }

  /**
   * Update execution result (used by TRINITY)
   */
  updateExecution(id: string, result: Partial<Execution>): void {
    const fieldMap: Record<string, string> = {
      txHash: 'tx_hash',
      blockNumber: 'block_number',
      blockTimestamp: 'block_timestamp',
      actualProfitWei: 'actual_profit_wei',
      gasUsed: 'gas_used',
      gasPriceWei: 'gas_price_wei',
      gasCostWei: 'gas_cost_wei',
      netProfitWei: 'net_profit_wei',
      netProfitUsd: 'net_profit_usd',
      actualSlippageBps: 'actual_slippage_bps',
      status: 'status',
      revertReason: 'revert_reason',
      errorMessage: 'error_message',
      executionTimeMs: 'execution_time_ms',
      wasFrontrun: 'was_frontrun',
      frontrunnerAddress: 'frontrunner_address',
    };

    const updates: string[] = [];
    const params: (string | number | null)[] = [];

    for (const [key, dbKey] of Object.entries(fieldMap)) {
      if ((result as any)[key] !== undefined) {
        updates.push(`${dbKey} = ?`);
        params.push((result as any)[key]);
      }
    }

    if (result.status === 'success' || result.status === 'failed' || result.status === 'reverted') {
      updates.push("confirmed_at = datetime('now')");
    }

    params.push(id);
    this.db.prepare(`UPDATE executions SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    // Update linked opportunity
    const exec = this.db.prepare('SELECT opportunity_id FROM executions WHERE id = ?').get(id) as { opportunity_id: string | null };
    if (exec.opportunity_id && result.status) {
      const oppStatus = result.status === 'success' ? 'completed' : 'failed';
      this.updateOpportunityStatus(exec.opportunity_id, oppStatus);
    }
  }

  /**
   * Get recent executions (used by CYPHER for risk monitoring)
   */
  getRecentExecutions(chain: string, limit: number = 100): Execution[] {
    return this.db.prepare(`
      SELECT * FROM executions
      WHERE chain = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(chain, limit) as Execution[];
  }

  // ============ AI RECOMMENDATIONS ============

  /**
   * Create AI recommendation (used by SATI, PERSEPHONE)
   */
  createRecommendation(rec: AIRecommendation): string {
    const result = this.db.prepare(`
      INSERT INTO ai_recommendations (
        chain, category, priority, title, description,
        evidence, suggested_action, expected_impact,
        expected_profit_increase_pct, expires_at, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(
      rec.chain || null,
      rec.category,
      rec.priority,
      rec.title,
      rec.description,
      rec.evidence ? JSON.stringify(rec.evidence) : null,
      rec.suggestedAction ? JSON.stringify(rec.suggestedAction) : null,
      rec.expectedImpact || null,
      rec.expectedProfitIncreasePct || null,
      rec.expiresAt || null
    );

    const created = this.db.prepare('SELECT id FROM ai_recommendations WHERE rowid = ?').get(result.lastInsertRowid) as { id: string };
    console.log(`[${this.agentName}] Created recommendation ${created.id}: ${rec.title}`);
    return created.id;
  }

  /**
   * Get pending recommendations (used by NEO)
   */
  getPendingRecommendations(chain?: string): AIRecommendation[] {
    let sql = `
      SELECT * FROM ai_recommendations
      WHERE status = 'pending'
      AND (expires_at IS NULL OR expires_at > datetime('now'))
    `;
    const params: string[] = [];

    if (chain) {
      sql += ' AND (chain = ? OR chain IS NULL)';
      params.push(chain);
    }

    sql += ` ORDER BY
      CASE priority WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
      expected_profit_increase_pct DESC NULLS LAST`;

    return this.db.prepare(sql).all(...params) as AIRecommendation[];
  }

  // ============ STRATEGY ============

  /**
   * Get current strategy config (used by TRINITY, CYPHER)
   */
  getCurrentStrategy(chain: string): StrategyConfig | null {
    const row = this.db.prepare(`
      SELECT * FROM strategy_snapshots
      WHERE chain = ?
      ORDER BY snapshot_at DESC
      LIMIT 1
    `).get(chain);

    if (!row) return null;

    return {
      chain: (row as any).chain,
      minProfitWei: (row as any).min_profit_wei,
      targetProfitWei: (row as any).target_profit_wei,
      maxPositionWei: (row as any).max_position_wei,
      baseGasGwei: (row as any).base_gas_gwei,
      maxGasGwei: (row as any).max_gas_gwei,
      priorityFeeGwei: (row as any).priority_fee_gwei,
      enabledPairs: (row as any).enabled_pairs ? JSON.parse((row as any).enabled_pairs) : undefined,
      dexConfig: (row as any).dex_config ? JSON.parse((row as any).dex_config) : undefined,
      hourlyLossLimitWei: (row as any).hourly_loss_limit_wei,
      dailyLossLimitWei: (row as any).daily_loss_limit_wei,
      circuitBreakerConfig: (row as any).circuit_breaker_config ? JSON.parse((row as any).circuit_breaker_config) : undefined,
    };
  }

  /**
   * Save strategy config (used by NEO when applying recommendations)
   */
  saveStrategy(config: StrategyConfig, changeReason?: string): void {
    this.db.prepare(`
      INSERT INTO strategy_snapshots (
        chain, min_profit_wei, target_profit_wei, max_position_wei,
        base_gas_gwei, max_gas_gwei, priority_fee_gwei,
        enabled_pairs, dex_config,
        hourly_loss_limit_wei, daily_loss_limit_wei, circuit_breaker_config,
        full_config, change_reason, change_source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      config.chain,
      config.minProfitWei || null,
      config.targetProfitWei || null,
      config.maxPositionWei || null,
      config.baseGasGwei || null,
      config.maxGasGwei || null,
      config.priorityFeeGwei || null,
      config.enabledPairs ? JSON.stringify(config.enabledPairs) : null,
      config.dexConfig ? JSON.stringify(config.dexConfig) : null,
      config.hourlyLossLimitWei || null,
      config.dailyLossLimitWei || null,
      config.circuitBreakerConfig ? JSON.stringify(config.circuitBreakerConfig) : null,
      JSON.stringify(config),
      changeReason || null,
      this.agentName
    );

    console.log(`[${this.agentName}] Saved strategy config for ${config.chain}`);
  }

  // ============ COMPETITORS ============

  /**
   * Get top competitors (used by SATI for strategy analysis)
   */
  getTopCompetitors(chain: string, limit: number = 20): any[] {
    return this.db.prepare(`
      SELECT * FROM competitors
      WHERE chain = ?
      ORDER BY CAST(total_profit_wei AS INTEGER) DESC
      LIMIT ?
    `).all(chain, limit);
  }

  /**
   * Get competitor transactions (used by SATI)
   */
  getCompetitorTransactions(competitorId: string, limit: number = 100): any[] {
    return this.db.prepare(`
      SELECT * FROM competitor_transactions
      WHERE competitor_id = ?
      ORDER BY block_timestamp DESC
      LIMIT ?
    `).all(competitorId, limit);
  }

  // ============ TOKENS & DEXES ============

  /**
   * Get enabled tokens (used by ORACLE, MORPHEUS)
   */
  getEnabledTokens(chain: string): any[] {
    return this.db.prepare(`
      SELECT * FROM tokens
      WHERE chain = ? AND is_enabled = 1
      ORDER BY priority ASC
    `).all(chain);
  }

  /**
   * Get enabled DEXes (used by TRINITY, ORACLE)
   */
  getEnabledDexes(chain: string): any[] {
    return this.db.prepare(`
      SELECT * FROM dexes
      WHERE chain = ? AND is_enabled = 1
      ORDER BY priority ASC
    `).all(chain);
  }

  // ============ PERFORMANCE ============

  /**
   * Record daily performance (used by NEO at end of day)
   */
  recordDailyPerformance(stats: any): void {
    this.db.prepare(`
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
      stats.date,
      stats.chain,
      stats.totalOpportunities || 0,
      stats.totalExecutions || 0,
      stats.successfulExecutions || 0,
      stats.failedExecutions || 0,
      stats.skippedOpportunities || 0,
      stats.grossProfitWei || '0',
      stats.gasSpentWei || '0',
      stats.netProfitWei || '0',
      stats.netProfitUsd || 0,
      stats.successRate || 0,
      stats.avgProfitPerTxWei || '0',
      stats.ourRank || null,
      stats.topCompetitorProfitWei || null,
      stats.profitByPair ? JSON.stringify(stats.profitByPair) : null,
      stats.profitByDex ? JSON.stringify(stats.profitByDex) : null
    );
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
    console.log(`[${this.agentName}] Database connection closed`);
  }
}

// Export singleton factory
const connectors: Map<string, AgentConnector> = new Map();

export function getAgentConnector(agentName: string): AgentConnector {
  if (!connectors.has(agentName)) {
    connectors.set(agentName, new AgentConnector(agentName));
  }
  return connectors.get(agentName)!;
}

export default AgentConnector;
