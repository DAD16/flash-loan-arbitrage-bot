/**
 * Database Service
 * SQLite database access layer for Matrix Command Center
 */

import Database, { Database as DatabaseType } from 'better-sqlite3';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Get database path relative to this file
const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '../../db/matrix.db');

// Create database connection
const db: DatabaseType = new Database(DB_PATH);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

export default db;

// Helper types for database rows
export interface CompetitorRow {
  id: string;
  address: string;
  chain: string;
  label: string | null;
  is_watched: number;
  first_seen_at: string;
  last_active_at: string | null;
  total_profit_wei: string;
  total_transactions: number;
  success_rate: number;
  avg_profit_per_tx_wei: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OpportunityRow {
  id: string;
  chain: string;
  route_tokens: string;
  route_token_symbols: string | null;
  route_dexes: string;
  expected_profit_wei: string;
  expected_profit_usd: number | null;
  expected_gas_wei: string | null;
  expected_net_profit_wei: string | null;
  confidence: string;
  confidence_score: number | null;
  detected_at: string;
  valid_until: string | null;
  status: string;
  execution_id: string | null;
  skip_reason: string | null;
  price_data: string | null;
  liquidity_data: string | null;
  created_at: string;
}

export interface ExecutionRow {
  id: string;
  opportunity_id: string | null;
  chain: string;
  tx_hash: string | null;
  block_number: number | null;
  block_timestamp: string | null;
  route_tokens: string | null;
  route_token_symbols: string | null;
  route_dexes: string | null;
  expected_profit_wei: string | null;
  actual_profit_wei: string | null;
  gas_used: number | null;
  gas_price_wei: string | null;
  gas_cost_wei: string | null;
  net_profit_wei: string | null;
  net_profit_usd: number | null;
  expected_slippage_bps: number | null;
  actual_slippage_bps: number | null;
  status: string;
  revert_reason: string | null;
  error_message: string | null;
  submitted_at: string | null;
  confirmed_at: string | null;
  execution_time_ms: number | null;
  competing_tx_hashes: string | null;
  was_frontrun: number;
  frontrunner_address: string | null;
  created_at: string;
}

export interface RecommendationRow {
  id: string;
  chain: string | null;
  category: string;
  priority: string;
  title: string;
  description: string;
  evidence: string | null;
  suggested_action: string | null;
  expected_impact: string | null;
  expected_profit_increase_pct: number | null;
  status: string;
  applied_at: string | null;
  dismissed_at: string | null;
  dismissed_reason: string | null;
  was_validated: number | null;
  validation_result: string | null;
  actual_impact_pct: number | null;
  created_at: string;
  expires_at: string | null;
}

export interface DexRow {
  id: string;
  chain: string;
  name: string;
  router_address: string;
  factory_address: string | null;
  fee_bps: number | null;
  is_enabled: number;
  priority: number;
  max_slippage_bps: number;
  version: string | null;
  dex_type: string | null;
  created_at: string;
  updated_at: string;
}

export interface TokenRow {
  id: string;
  address: string;
  chain: string;
  symbol: string;
  name: string | null;
  decimals: number;
  logo_url: string | null;
  coingecko_id: string | null;
  is_enabled: number;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface DailyPerformanceRow {
  id: string;
  date: string;
  chain: string;
  total_opportunities: number;
  total_executions: number;
  successful_executions: number;
  failed_executions: number;
  skipped_opportunities: number;
  gross_profit_wei: string;
  gas_spent_wei: string;
  net_profit_wei: string;
  net_profit_usd: number;
  success_rate: number;
  avg_profit_per_tx_wei: string;
  our_rank: number | null;
  top_competitor_profit_wei: string | null;
  profit_by_pair: string | null;
  profit_by_dex: string | null;
  created_at: string;
  updated_at: string;
}
