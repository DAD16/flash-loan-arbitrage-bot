-- Matrix Command Center Database Schema (SQLite Version)
-- Designed by: THE ARCHITECT + MOUSE
-- Database: SQLite 3

-- ============================================================================
-- COMPETITORS
-- ============================================================================

CREATE TABLE IF NOT EXISTS competitors (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    address TEXT NOT NULL,
    chain TEXT NOT NULL DEFAULT 'bsc' CHECK (chain IN ('bsc', 'ethereum', 'arbitrum', 'optimism', 'base')),
    label TEXT,
    is_watched INTEGER DEFAULT 0,
    first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_active_at TEXT,
    total_profit_wei TEXT DEFAULT '0',
    total_transactions INTEGER DEFAULT 0,
    success_rate REAL DEFAULT 0,
    avg_profit_per_tx_wei TEXT DEFAULT '0',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE (address, chain)
);

CREATE TABLE IF NOT EXISTS competitor_transactions (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    competitor_id TEXT REFERENCES competitors(id) ON DELETE CASCADE,
    chain TEXT NOT NULL DEFAULT 'bsc',
    tx_hash TEXT NOT NULL UNIQUE,
    block_number INTEGER NOT NULL,
    block_timestamp TEXT NOT NULL,

    route_tokens TEXT,  -- JSON array
    route_dexes TEXT,   -- JSON array

    profit_wei TEXT,
    profit_usd REAL,
    gas_used INTEGER,
    gas_price_wei TEXT,
    gas_cost_wei TEXT,
    net_profit_wei TEXT,

    status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'failed', 'reverted')),
    revert_reason TEXT,

    opportunity_type TEXT,
    is_flashloan INTEGER DEFAULT 0,

    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS competitor_strategies (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    competitor_id TEXT REFERENCES competitors(id) ON DELETE CASCADE,
    analysis_period_start TEXT NOT NULL,
    analysis_period_end TEXT NOT NULL,

    top_token_pairs TEXT,  -- JSON
    dex_usage TEXT,        -- JSON

    avg_gas_price_gwei REAL,
    max_gas_price_gwei REAL,
    min_gas_price_gwei REAL,

    active_hours TEXT,     -- JSON
    avg_execution_time_ms INTEGER,

    success_rate REAL,
    avg_profit_per_tx_wei TEXT,

    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================================
-- OUR OPPORTUNITIES
-- ============================================================================

CREATE TABLE IF NOT EXISTS opportunities (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    chain TEXT NOT NULL DEFAULT 'bsc',

    route_tokens TEXT NOT NULL,      -- JSON array
    route_token_symbols TEXT,        -- JSON array
    route_dexes TEXT NOT NULL,       -- JSON array

    expected_profit_wei TEXT NOT NULL,
    expected_profit_usd REAL,
    expected_gas_wei TEXT,
    expected_net_profit_wei TEXT,

    confidence TEXT NOT NULL CHECK (confidence IN ('low', 'medium', 'high', 'very_high')),
    confidence_score REAL,

    detected_at TEXT NOT NULL DEFAULT (datetime('now')),
    valid_until TEXT,

    status TEXT NOT NULL DEFAULT 'detected'
        CHECK (status IN ('detected', 'evaluating', 'executing', 'completed', 'skipped', 'failed')),

    execution_id TEXT,
    skip_reason TEXT,

    price_data TEXT,      -- JSON
    liquidity_data TEXT,  -- JSON

    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS executions (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    opportunity_id TEXT REFERENCES opportunities(id),
    chain TEXT NOT NULL DEFAULT 'bsc',

    tx_hash TEXT,
    block_number INTEGER,
    block_timestamp TEXT,

    route_tokens TEXT,
    route_token_symbols TEXT,
    route_dexes TEXT,

    expected_profit_wei TEXT,
    actual_profit_wei TEXT,
    gas_used INTEGER,
    gas_price_wei TEXT,
    gas_cost_wei TEXT,
    net_profit_wei TEXT,
    net_profit_usd REAL,

    expected_slippage_bps INTEGER,
    actual_slippage_bps INTEGER,

    status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'failed', 'reverted')),
    revert_reason TEXT,
    error_message TEXT,

    submitted_at TEXT,
    confirmed_at TEXT,
    execution_time_ms INTEGER,

    competing_tx_hashes TEXT,  -- JSON array
    was_frontrun INTEGER DEFAULT 0,
    frontrunner_address TEXT,

    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================================
-- STRATEGY CONFIGURATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS strategy_snapshots (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    snapshot_at TEXT NOT NULL DEFAULT (datetime('now')),
    chain TEXT NOT NULL DEFAULT 'bsc',

    min_profit_wei TEXT,
    target_profit_wei TEXT,
    max_position_wei TEXT,

    base_gas_gwei REAL,
    max_gas_gwei REAL,
    priority_fee_gwei REAL,

    enabled_pairs TEXT,    -- JSON
    dex_config TEXT,       -- JSON

    hourly_loss_limit_wei TEXT,
    daily_loss_limit_wei TEXT,
    circuit_breaker_config TEXT,  -- JSON

    full_config TEXT,      -- JSON

    change_reason TEXT,
    change_source TEXT,

    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================================
-- AI ANALYSIS
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_recommendations (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    chain TEXT DEFAULT 'bsc',

    category TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'info' CHECK (priority IN ('info', 'warning', 'critical')),

    title TEXT NOT NULL,
    description TEXT NOT NULL,
    evidence TEXT,           -- JSON

    suggested_action TEXT,   -- JSON
    expected_impact TEXT,
    expected_profit_increase_pct REAL,

    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'applied', 'dismissed', 'expired')),
    applied_at TEXT,
    dismissed_at TEXT,
    dismissed_reason TEXT,

    was_validated INTEGER,
    validation_result TEXT,  -- JSON
    actual_impact_pct REAL,

    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT
);

CREATE TABLE IF NOT EXISTS patterns (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    chain TEXT DEFAULT 'bsc',

    pattern_type TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,

    pattern_data TEXT NOT NULL,  -- JSON
    confidence_score REAL,

    analysis_start TEXT,
    analysis_end TEXT,

    is_active INTEGER DEFAULT 1,
    last_validated_at TEXT,

    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_analysis_runs (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    run_type TEXT NOT NULL,
    chain TEXT DEFAULT 'bsc',

    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,

    analysis_period_start TEXT,
    analysis_period_end TEXT,
    input_data TEXT,         -- JSON

    output_summary TEXT,     -- JSON
    recommendations_generated INTEGER DEFAULT 0,
    patterns_detected INTEGER DEFAULT 0,

    status TEXT NOT NULL DEFAULT 'running',
    error_message TEXT,

    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================================
-- TOKENS & DEXES
-- ============================================================================

CREATE TABLE IF NOT EXISTS tokens (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    address TEXT NOT NULL,
    chain TEXT NOT NULL DEFAULT 'bsc',
    symbol TEXT NOT NULL,
    name TEXT,
    decimals INTEGER NOT NULL DEFAULT 18,
    logo_url TEXT,
    coingecko_id TEXT,

    is_enabled INTEGER DEFAULT 1,
    priority INTEGER DEFAULT 50,

    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE (address, chain)
);

CREATE TABLE IF NOT EXISTS dexes (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    chain TEXT NOT NULL DEFAULT 'bsc',
    name TEXT NOT NULL,
    router_address TEXT NOT NULL,
    factory_address TEXT,

    fee_bps INTEGER,
    is_enabled INTEGER DEFAULT 1,
    priority INTEGER DEFAULT 50,
    max_slippage_bps INTEGER DEFAULT 50,

    version TEXT,
    dex_type TEXT,

    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE (router_address, chain)
);

-- ============================================================================
-- AGGREGATES
-- ============================================================================

CREATE TABLE IF NOT EXISTS daily_performance (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    date TEXT NOT NULL,
    chain TEXT NOT NULL DEFAULT 'bsc',

    total_opportunities INTEGER DEFAULT 0,
    total_executions INTEGER DEFAULT 0,
    successful_executions INTEGER DEFAULT 0,
    failed_executions INTEGER DEFAULT 0,
    skipped_opportunities INTEGER DEFAULT 0,

    gross_profit_wei TEXT DEFAULT '0',
    gas_spent_wei TEXT DEFAULT '0',
    net_profit_wei TEXT DEFAULT '0',
    net_profit_usd REAL DEFAULT 0,

    success_rate REAL DEFAULT 0,
    avg_profit_per_tx_wei TEXT DEFAULT '0',

    our_rank INTEGER,
    top_competitor_profit_wei TEXT,

    profit_by_pair TEXT,  -- JSON
    profit_by_dex TEXT,   -- JSON

    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE (date, chain)
);

CREATE TABLE IF NOT EXISTS hourly_metrics (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    hour_start TEXT NOT NULL,
    chain TEXT NOT NULL DEFAULT 'bsc',

    opportunities_detected INTEGER DEFAULT 0,
    executions_attempted INTEGER DEFAULT 0,
    executions_successful INTEGER DEFAULT 0,

    gross_profit_wei TEXT DEFAULT '0',
    net_profit_wei TEXT DEFAULT '0',

    avg_gas_price_gwei REAL,
    avg_execution_time_ms INTEGER,

    competitor_activity_count INTEGER DEFAULT 0,

    created_at TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE (hour_start, chain)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_competitors_chain ON competitors(chain);
CREATE INDEX IF NOT EXISTS idx_competitors_watched ON competitors(is_watched);
CREATE INDEX IF NOT EXISTS idx_competitors_profit ON competitors(total_profit_wei);

CREATE INDEX IF NOT EXISTS idx_competitor_tx_competitor ON competitor_transactions(competitor_id);
CREATE INDEX IF NOT EXISTS idx_competitor_tx_block ON competitor_transactions(block_number);
CREATE INDEX IF NOT EXISTS idx_competitor_tx_timestamp ON competitor_transactions(block_timestamp);

CREATE INDEX IF NOT EXISTS idx_opportunities_chain ON opportunities(chain);
CREATE INDEX IF NOT EXISTS idx_opportunities_status ON opportunities(status);
CREATE INDEX IF NOT EXISTS idx_opportunities_detected ON opportunities(detected_at);

CREATE INDEX IF NOT EXISTS idx_executions_chain ON executions(chain);
CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);
CREATE INDEX IF NOT EXISTS idx_executions_timestamp ON executions(block_timestamp);

CREATE INDEX IF NOT EXISTS idx_recommendations_status ON ai_recommendations(status);
CREATE INDEX IF NOT EXISTS idx_patterns_type ON patterns(pattern_type);

CREATE INDEX IF NOT EXISTS idx_daily_performance_date ON daily_performance(date);
CREATE INDEX IF NOT EXISTS idx_hourly_metrics_hour ON hourly_metrics(hour_start);

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- BSC DEXes (from THE ARCHITECT's research)
INSERT OR IGNORE INTO dexes (chain, name, router_address, factory_address, fee_bps, priority, dex_type, version) VALUES
('bsc', 'PancakeSwap V3', '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4', '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865', 25, 1, 'uniswap_v3', 'v3'),
('bsc', 'PancakeSwap V2', '0x10ED43C718714eb63d5aA57B78B54704E256024E', '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73', 25, 2, 'uniswap_v2', 'v2'),
('bsc', 'BiSwap', '0x3a6d8cA21D1CF76F653A67577FA0D27453350dD8', '0x858E3312ed3A876947EA49d572A7C42DE08af7EE', 10, 3, 'uniswap_v2', 'v2'),
('bsc', 'Thena', '0xd4ae6eCA985340Dd434D38F470aCCce4DC78D109', '0xAFD89d21BdB66d00817d4153E055830B1c2B3970', 30, 4, 've33', 'v1'),
('bsc', 'MDEX', '0x7DAe51BD3E3376B8c7c4900E9107f12Be3AF1bA8', '0x3CD1C46068dAEa5Ebb0d3f55F6915B10648062B8', 30, 5, 'uniswap_v2', 'v2'),
('bsc', 'ApeSwap', '0xcF0feBd3f17CEf5b47b0cD257aCf6025c5BFf3b7', '0x0841BD0B734E4F5853f0dD8d7Ea041c241fb0Da6', 20, 6, 'uniswap_v2', 'v2');

-- Common BSC tokens
INSERT OR IGNORE INTO tokens (chain, address, symbol, name, decimals, priority) VALUES
('bsc', '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', 'WBNB', 'Wrapped BNB', 18, 1),
('bsc', '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', 'CAKE', 'PancakeSwap Token', 18, 2),
('bsc', '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', 'BUSD', 'Binance USD', 18, 3),
('bsc', '0x55d398326f99059fF775485246999027B3197955', 'USDT', 'Tether USD', 18, 4),
('bsc', '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', 'ETH', 'Ethereum', 18, 5),
('bsc', '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', 'USDC', 'USD Coin', 18, 6),
('bsc', '0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE', 'XRP', 'XRP Token', 18, 7),
('bsc', '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', 'BTCB', 'Bitcoin BEP2', 18, 8);
