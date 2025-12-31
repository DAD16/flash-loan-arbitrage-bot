-- Matrix Command Center Database Schema
-- Designed by: THE ARCHITECT (Infrastructure) + MOUSE (UI/UX)
-- Database: PostgreSQL 15+

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For text search

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE chain_type AS ENUM ('bsc', 'ethereum', 'arbitrum', 'optimism', 'base');
CREATE TYPE tx_status AS ENUM ('pending', 'success', 'failed', 'reverted');
CREATE TYPE opportunity_status AS ENUM ('detected', 'evaluating', 'executing', 'completed', 'skipped', 'failed');
CREATE TYPE recommendation_status AS ENUM ('pending', 'applied', 'dismissed', 'expired');
CREATE TYPE severity_level AS ENUM ('info', 'warning', 'critical');
CREATE TYPE confidence_level AS ENUM ('low', 'medium', 'high', 'very_high');

-- ============================================================================
-- COMPETITORS
-- ============================================================================

-- Tracked competitor addresses
CREATE TABLE competitors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    address VARCHAR(42) NOT NULL,
    chain chain_type NOT NULL DEFAULT 'bsc',
    label VARCHAR(100),  -- Optional friendly name
    is_watched BOOLEAN DEFAULT FALSE,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active_at TIMESTAMPTZ,
    total_profit_wei NUMERIC(78, 0) DEFAULT 0,
    total_transactions INTEGER DEFAULT 0,
    success_rate DECIMAL(5, 2) DEFAULT 0,
    avg_profit_per_tx_wei NUMERIC(78, 0) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_competitor_address_chain UNIQUE (address, chain)
);

-- Competitor transactions (from on-chain data)
CREATE TABLE competitor_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    competitor_id UUID REFERENCES competitors(id) ON DELETE CASCADE,
    chain chain_type NOT NULL DEFAULT 'bsc',
    tx_hash VARCHAR(66) NOT NULL,
    block_number BIGINT NOT NULL,
    block_timestamp TIMESTAMPTZ NOT NULL,

    -- Route info
    route_tokens TEXT[],  -- Array of token addresses
    route_dexes TEXT[],   -- Array of DEX names used

    -- Financial
    profit_wei NUMERIC(78, 0),
    profit_usd DECIMAL(18, 6),
    gas_used BIGINT,
    gas_price_wei NUMERIC(78, 0),
    gas_cost_wei NUMERIC(78, 0),
    net_profit_wei NUMERIC(78, 0),

    -- Status
    status tx_status NOT NULL,
    revert_reason TEXT,

    -- Analysis
    opportunity_type VARCHAR(50),  -- 'arbitrage', 'sandwich', 'liquidation'
    is_flashloan BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_tx_hash UNIQUE (tx_hash)
);

-- Competitor strategy analysis (computed periodically)
CREATE TABLE competitor_strategies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    competitor_id UUID REFERENCES competitors(id) ON DELETE CASCADE,
    analysis_period_start TIMESTAMPTZ NOT NULL,
    analysis_period_end TIMESTAMPTZ NOT NULL,

    -- Token preferences
    top_token_pairs JSONB,  -- [{"pair": "CAKE-WBNB", "count": 45, "profit": "1.2"}]

    -- DEX preferences
    dex_usage JSONB,  -- {"PancakeV3": 67, "BiSwap": 21, "Thena": 12}

    -- Gas strategy
    avg_gas_price_gwei DECIMAL(10, 4),
    max_gas_price_gwei DECIMAL(10, 4),
    min_gas_price_gwei DECIMAL(10, 4),

    -- Timing
    active_hours JSONB,  -- {"10": 15, "11": 22, "12": 18} (hour -> tx count)
    avg_execution_time_ms INTEGER,

    -- Performance
    success_rate DECIMAL(5, 2),
    avg_profit_per_tx_wei NUMERIC(78, 0),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- OUR OPPORTUNITIES
-- ============================================================================

-- Detected arbitrage opportunities
CREATE TABLE opportunities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chain chain_type NOT NULL DEFAULT 'bsc',

    -- Route
    route_tokens TEXT[] NOT NULL,
    route_token_symbols TEXT[],
    route_dexes TEXT[] NOT NULL,

    -- Expected profit
    expected_profit_wei NUMERIC(78, 0) NOT NULL,
    expected_profit_usd DECIMAL(18, 6),
    expected_gas_wei NUMERIC(78, 0),
    expected_net_profit_wei NUMERIC(78, 0),

    -- Confidence
    confidence confidence_level NOT NULL,
    confidence_score DECIMAL(5, 2),  -- 0-100

    -- Timing
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ,

    -- Status
    status opportunity_status NOT NULL DEFAULT 'detected',

    -- If executed
    execution_id UUID,

    -- If skipped/failed
    skip_reason TEXT,

    -- Metadata
    price_data JSONB,  -- Prices at detection time
    liquidity_data JSONB,  -- Liquidity at detection time

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Our executed transactions
CREATE TABLE executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    opportunity_id UUID REFERENCES opportunities(id),
    chain chain_type NOT NULL DEFAULT 'bsc',

    -- Transaction
    tx_hash VARCHAR(66),
    block_number BIGINT,
    block_timestamp TIMESTAMPTZ,

    -- Route
    route_tokens TEXT[],
    route_token_symbols TEXT[],
    route_dexes TEXT[],

    -- Financial
    expected_profit_wei NUMERIC(78, 0),
    actual_profit_wei NUMERIC(78, 0),
    gas_used BIGINT,
    gas_price_wei NUMERIC(78, 0),
    gas_cost_wei NUMERIC(78, 0),
    net_profit_wei NUMERIC(78, 0),
    net_profit_usd DECIMAL(18, 6),

    -- Slippage
    expected_slippage_bps INTEGER,
    actual_slippage_bps INTEGER,

    -- Status
    status tx_status NOT NULL,
    revert_reason TEXT,
    error_message TEXT,

    -- Timing
    submitted_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    execution_time_ms INTEGER,

    -- Competition
    competing_tx_hashes TEXT[],  -- Other bots in same block
    was_frontrun BOOLEAN DEFAULT FALSE,
    frontrunner_address VARCHAR(42),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add foreign key for executions
ALTER TABLE opportunities
    ADD CONSTRAINT fk_opportunity_execution
    FOREIGN KEY (execution_id) REFERENCES executions(id);

-- ============================================================================
-- STRATEGY CONFIGURATION
-- ============================================================================

-- Strategy snapshots (for historical analysis)
CREATE TABLE strategy_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    chain chain_type NOT NULL DEFAULT 'bsc',

    -- Profit thresholds
    min_profit_wei NUMERIC(78, 0),
    target_profit_wei NUMERIC(78, 0),
    max_position_wei NUMERIC(78, 0),

    -- Gas strategy
    base_gas_gwei DECIMAL(10, 4),
    max_gas_gwei DECIMAL(10, 4),
    priority_fee_gwei DECIMAL(10, 4),

    -- Token pairs
    enabled_pairs JSONB,

    -- DEX routing
    dex_config JSONB,

    -- Risk controls
    hourly_loss_limit_wei NUMERIC(78, 0),
    daily_loss_limit_wei NUMERIC(78, 0),
    circuit_breaker_config JSONB,

    -- Full config
    full_config JSONB,

    -- Who made the change
    change_reason TEXT,
    change_source VARCHAR(50),  -- 'manual', 'ai_recommendation', 'auto_adjust'

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- AI ANALYSIS
-- ============================================================================

-- AI-generated recommendations
CREATE TABLE ai_recommendations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chain chain_type DEFAULT 'bsc',

    -- Classification
    category VARCHAR(50) NOT NULL,  -- 'gas_optimization', 'pair_selection', 'dex_routing', etc.
    priority severity_level NOT NULL DEFAULT 'info',

    -- Content
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    evidence JSONB,  -- Data supporting the recommendation

    -- Action
    suggested_action JSONB,  -- Machine-readable action
    expected_impact TEXT,  -- Human-readable impact
    expected_profit_increase_pct DECIMAL(5, 2),

    -- Status
    status recommendation_status NOT NULL DEFAULT 'pending',
    applied_at TIMESTAMPTZ,
    dismissed_at TIMESTAMPTZ,
    dismissed_reason TEXT,

    -- Validation
    was_validated BOOLEAN,
    validation_result JSONB,
    actual_impact_pct DECIMAL(5, 2),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

-- Detected patterns
CREATE TABLE patterns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chain chain_type DEFAULT 'bsc',

    -- Pattern info
    pattern_type VARCHAR(50) NOT NULL,  -- 'timing', 'gas', 'competitor', 'liquidity'
    name VARCHAR(100) NOT NULL,
    description TEXT,

    -- Data
    pattern_data JSONB NOT NULL,
    confidence_score DECIMAL(5, 2),

    -- Time range
    analysis_start TIMESTAMPTZ,
    analysis_end TIMESTAMPTZ,

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    last_validated_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AI analysis runs (for tracking)
CREATE TABLE ai_analysis_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_type VARCHAR(50) NOT NULL,  -- 'competitor_analysis', 'pattern_detection', 'recommendation_generation'
    chain chain_type DEFAULT 'bsc',

    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,

    -- Input
    analysis_period_start TIMESTAMPTZ,
    analysis_period_end TIMESTAMPTZ,
    input_data JSONB,

    -- Output
    output_summary JSONB,
    recommendations_generated INTEGER DEFAULT 0,
    patterns_detected INTEGER DEFAULT 0,

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'running',
    error_message TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- TOKENS & DEXES
-- ============================================================================

-- Token registry
CREATE TABLE tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    address VARCHAR(42) NOT NULL,
    chain chain_type NOT NULL DEFAULT 'bsc',
    symbol VARCHAR(20) NOT NULL,
    name VARCHAR(100),
    decimals INTEGER NOT NULL DEFAULT 18,
    logo_url TEXT,
    coingecko_id VARCHAR(100),

    -- Tracking
    is_enabled BOOLEAN DEFAULT TRUE,
    priority INTEGER DEFAULT 50,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_token_address_chain UNIQUE (address, chain)
);

-- DEX registry
CREATE TABLE dexes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chain chain_type NOT NULL DEFAULT 'bsc',
    name VARCHAR(50) NOT NULL,
    router_address VARCHAR(42) NOT NULL,
    factory_address VARCHAR(42),

    -- Config
    fee_bps INTEGER,  -- Fee in basis points
    is_enabled BOOLEAN DEFAULT TRUE,
    priority INTEGER DEFAULT 50,
    max_slippage_bps INTEGER DEFAULT 50,

    -- Metadata
    version VARCHAR(10),
    dex_type VARCHAR(20),  -- 'uniswap_v2', 'uniswap_v3', 'curve', etc.

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_dex_router_chain UNIQUE (router_address, chain)
);

-- ============================================================================
-- AGGREGATES & VIEWS
-- ============================================================================

-- Daily performance summary
CREATE TABLE daily_performance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    chain chain_type NOT NULL DEFAULT 'bsc',

    -- Transactions
    total_opportunities INTEGER DEFAULT 0,
    total_executions INTEGER DEFAULT 0,
    successful_executions INTEGER DEFAULT 0,
    failed_executions INTEGER DEFAULT 0,
    skipped_opportunities INTEGER DEFAULT 0,

    -- Financial
    gross_profit_wei NUMERIC(78, 0) DEFAULT 0,
    gas_spent_wei NUMERIC(78, 0) DEFAULT 0,
    net_profit_wei NUMERIC(78, 0) DEFAULT 0,
    net_profit_usd DECIMAL(18, 6) DEFAULT 0,

    -- Rates
    success_rate DECIMAL(5, 2) DEFAULT 0,
    avg_profit_per_tx_wei NUMERIC(78, 0) DEFAULT 0,

    -- Competitor comparison
    our_rank INTEGER,
    top_competitor_profit_wei NUMERIC(78, 0),

    -- Breakdown
    profit_by_pair JSONB,
    profit_by_dex JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_daily_chain UNIQUE (date, chain)
);

-- Hourly metrics (for pattern detection)
CREATE TABLE hourly_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hour_start TIMESTAMPTZ NOT NULL,
    chain chain_type NOT NULL DEFAULT 'bsc',

    opportunities_detected INTEGER DEFAULT 0,
    executions_attempted INTEGER DEFAULT 0,
    executions_successful INTEGER DEFAULT 0,

    gross_profit_wei NUMERIC(78, 0) DEFAULT 0,
    net_profit_wei NUMERIC(78, 0) DEFAULT 0,

    avg_gas_price_gwei DECIMAL(10, 4),
    avg_execution_time_ms INTEGER,

    competitor_activity_count INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_hourly_chain UNIQUE (hour_start, chain)
);

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Competitor leaderboard view
CREATE VIEW competitor_leaderboard AS
SELECT
    c.id,
    c.address,
    c.chain,
    c.label,
    c.is_watched,
    c.total_profit_wei,
    c.total_transactions,
    c.success_rate,
    c.avg_profit_per_tx_wei,
    c.last_active_at,
    RANK() OVER (PARTITION BY c.chain ORDER BY c.total_profit_wei DESC) as rank
FROM competitors c
WHERE c.total_transactions > 0;

-- Recent opportunities view
CREATE VIEW recent_opportunities AS
SELECT
    o.*,
    e.tx_hash,
    e.status as execution_status,
    e.actual_profit_wei,
    e.net_profit_wei as actual_net_profit_wei
FROM opportunities o
LEFT JOIN executions e ON o.execution_id = e.id
WHERE o.detected_at > NOW() - INTERVAL '24 hours'
ORDER BY o.detected_at DESC;

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Competitors
CREATE INDEX idx_competitors_chain ON competitors(chain);
CREATE INDEX idx_competitors_watched ON competitors(is_watched) WHERE is_watched = TRUE;
CREATE INDEX idx_competitors_profit ON competitors(total_profit_wei DESC);

-- Competitor transactions
CREATE INDEX idx_competitor_tx_competitor ON competitor_transactions(competitor_id);
CREATE INDEX idx_competitor_tx_block ON competitor_transactions(block_number DESC);
CREATE INDEX idx_competitor_tx_timestamp ON competitor_transactions(block_timestamp DESC);
CREATE INDEX idx_competitor_tx_status ON competitor_transactions(status);

-- Opportunities
CREATE INDEX idx_opportunities_chain ON opportunities(chain);
CREATE INDEX idx_opportunities_status ON opportunities(status);
CREATE INDEX idx_opportunities_detected ON opportunities(detected_at DESC);
CREATE INDEX idx_opportunities_confidence ON opportunities(confidence_score DESC);

-- Executions
CREATE INDEX idx_executions_chain ON executions(chain);
CREATE INDEX idx_executions_status ON executions(status);
CREATE INDEX idx_executions_timestamp ON executions(block_timestamp DESC);
CREATE INDEX idx_executions_tx_hash ON executions(tx_hash);

-- AI
CREATE INDEX idx_recommendations_status ON ai_recommendations(status);
CREATE INDEX idx_recommendations_priority ON ai_recommendations(priority);
CREATE INDEX idx_patterns_type ON patterns(pattern_type);
CREATE INDEX idx_patterns_active ON patterns(is_active) WHERE is_active = TRUE;

-- Performance
CREATE INDEX idx_daily_performance_date ON daily_performance(date DESC);
CREATE INDEX idx_hourly_metrics_hour ON hourly_metrics(hour_start DESC);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to relevant tables
CREATE TRIGGER update_competitors_timestamp
    BEFORE UPDATE ON competitors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_tokens_timestamp
    BEFORE UPDATE ON tokens
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_dexes_timestamp
    BEFORE UPDATE ON dexes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_patterns_timestamp
    BEFORE UPDATE ON patterns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_daily_performance_timestamp
    BEFORE UPDATE ON daily_performance
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- BSC DEXes (from THE ARCHITECT's research)
INSERT INTO dexes (chain, name, router_address, factory_address, fee_bps, priority, dex_type, version) VALUES
('bsc', 'PancakeSwap V3', '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4', '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865', 25, 1, 'uniswap_v3', 'v3'),
('bsc', 'PancakeSwap V2', '0x10ED43C718714eb63d5aA57B78B54704E256024E', '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73', 25, 2, 'uniswap_v2', 'v2'),
('bsc', 'BiSwap', '0x3a6d8cA21D1CF76F653A67577FA0D27453350dD8', '0x858E3312ed3A876947EA49d572A7C42DE08af7EE', 10, 3, 'uniswap_v2', 'v2'),
('bsc', 'Thena', '0xd4ae6eCA985340Dd434D38F470aCCce4DC78D109', '0xAFD89d21BdB66d00817d4153E055830B1c2B3970', 30, 4, 've33', 'v1'),
('bsc', 'MDEX', '0x7DAe51BD3E3376B8c7c4900E9107f12Be3AF1bA8', '0x3CD1C46068dAEa5Ebb0d3f55F6915B10648062B8', 30, 5, 'uniswap_v2', 'v2'),
('bsc', 'ApeSwap', '0xcF0feBd3f17CEf5b47b0cD257aCf6025c5BFf3b7', '0x0841BD0B734E4F5853f0dD8d7Ea041c241fb0Da6', 20, 6, 'uniswap_v2', 'v2');

-- Common BSC tokens
INSERT INTO tokens (chain, address, symbol, name, decimals, priority) VALUES
('bsc', '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', 'WBNB', 'Wrapped BNB', 18, 1),
('bsc', '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', 'CAKE', 'PancakeSwap Token', 18, 2),
('bsc', '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', 'BUSD', 'Binance USD', 18, 3),
('bsc', '0x55d398326f99059fF775485246999027B3197955', 'USDT', 'Tether USD', 18, 4),
('bsc', '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', 'ETH', 'Ethereum', 18, 5),
('bsc', '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', 'USDC', 'USD Coin', 18, 6),
('bsc', '0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE', 'XRP', 'XRP Token', 18, 7),
('bsc', '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', 'BTCB', 'Bitcoin BEP2', 18, 8);

COMMENT ON TABLE competitors IS 'Tracked competitor MEV bot addresses';
COMMENT ON TABLE competitor_transactions IS 'Historical transactions from competitors';
COMMENT ON TABLE opportunities IS 'Detected arbitrage opportunities';
COMMENT ON TABLE executions IS 'Our executed transactions';
COMMENT ON TABLE ai_recommendations IS 'AI-generated strategy recommendations';
COMMENT ON TABLE patterns IS 'Detected patterns from historical analysis';
