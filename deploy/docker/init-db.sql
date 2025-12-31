-- Matrix Flash Loan Arbitrage Bot - Database Schema

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Opportunities table
CREATE TABLE opportunities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chain_id VARCHAR(20) NOT NULL,
    profit_wei NUMERIC(78) NOT NULL,
    profit_usd NUMERIC(18, 8),
    gas_estimate BIGINT NOT NULL,
    gas_price_gwei NUMERIC(18, 9),
    path JSONB NOT NULL,
    flash_loan_token VARCHAR(42) NOT NULL,
    flash_loan_amount NUMERIC(78) NOT NULL,
    confidence NUMERIC(5, 4) NOT NULL,
    status VARCHAR(20) DEFAULT 'detected',
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    executed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_opportunities_chain ON opportunities(chain_id);
CREATE INDEX idx_opportunities_status ON opportunities(status);
CREATE INDEX idx_opportunities_detected_at ON opportunities(detected_at DESC);

-- Executions table
CREATE TABLE executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    opportunity_id UUID REFERENCES opportunities(id),
    chain_id VARCHAR(20) NOT NULL,
    tx_hash VARCHAR(66),
    block_number BIGINT,
    gas_used BIGINT,
    gas_price_wei NUMERIC(78),
    profit_wei NUMERIC(78),
    profit_usd NUMERIC(18, 8),
    success BOOLEAN NOT NULL,
    error_message TEXT,
    execution_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_executions_tx_hash ON executions(tx_hash);
CREATE INDEX idx_executions_chain ON executions(chain_id);
CREATE INDEX idx_executions_created_at ON executions(created_at DESC);

-- Price snapshots table
CREATE TABLE price_snapshots (
    id BIGSERIAL PRIMARY KEY,
    chain_id VARCHAR(20) NOT NULL,
    dex_id VARCHAR(30) NOT NULL,
    pool_address VARCHAR(42) NOT NULL,
    token0 VARCHAR(42) NOT NULL,
    token1 VARCHAR(42) NOT NULL,
    price NUMERIC(40, 18) NOT NULL,
    reserve0 NUMERIC(78),
    reserve1 NUMERIC(78),
    timestamp_ms BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_prices_pool ON price_snapshots(pool_address);
CREATE INDEX idx_prices_timestamp ON price_snapshots(timestamp_ms DESC);

-- Partitioning for price_snapshots (by day)
-- Note: Add partitions as needed for production

-- TVL snapshots table
CREATE TABLE tvl_snapshots (
    id BIGSERIAL PRIMARY KEY,
    protocol VARCHAR(50) NOT NULL,
    chain_id VARCHAR(20) NOT NULL,
    tvl_usd NUMERIC(24, 2) NOT NULL,
    tvl_change_24h NUMERIC(8, 4),
    timestamp_ms BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_tvl_protocol ON tvl_snapshots(protocol, chain_id);
CREATE INDEX idx_tvl_timestamp ON tvl_snapshots(timestamp_ms DESC);

-- Sentiment signals table
CREATE TABLE sentiment_signals (
    id BIGSERIAL PRIMARY KEY,
    source VARCHAR(30) NOT NULL,
    sentiment_score NUMERIC(5, 4) NOT NULL,
    confidence NUMERIC(5, 4) NOT NULL,
    keywords JSONB,
    raw_text TEXT,
    timestamp_ms BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sentiment_source ON sentiment_signals(source);
CREATE INDEX idx_sentiment_timestamp ON sentiment_signals(timestamp_ms DESC);

-- Gas prices table
CREATE TABLE gas_prices (
    id BIGSERIAL PRIMARY KEY,
    chain_id VARCHAR(20) NOT NULL,
    base_fee_gwei NUMERIC(18, 9) NOT NULL,
    priority_fee_gwei NUMERIC(18, 9) NOT NULL,
    block_utilization NUMERIC(5, 4),
    block_number BIGINT,
    timestamp_ms BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_gas_chain ON gas_prices(chain_id);
CREATE INDEX idx_gas_timestamp ON gas_prices(timestamp_ms DESC);

-- Agent metrics table
CREATE TABLE agent_metrics (
    id BIGSERIAL PRIMARY KEY,
    agent_name VARCHAR(30) NOT NULL,
    metric_name VARCHAR(50) NOT NULL,
    metric_value NUMERIC(24, 8) NOT NULL,
    labels JSONB,
    timestamp_ms BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_agent_metrics_name ON agent_metrics(agent_name, metric_name);
CREATE INDEX idx_agent_metrics_timestamp ON agent_metrics(timestamp_ms DESC);

-- Create views for common queries
CREATE VIEW daily_stats AS
SELECT
    DATE(created_at) as date,
    COUNT(*) as total_executions,
    COUNT(*) FILTER (WHERE success) as successful,
    SUM(profit_usd) FILTER (WHERE success) as total_profit_usd,
    AVG(execution_time_ms) as avg_execution_time_ms
FROM executions
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Cleanup function for old data
CREATE OR REPLACE FUNCTION cleanup_old_data(days_to_keep INTEGER DEFAULT 30)
RETURNS void AS $$
BEGIN
    DELETE FROM price_snapshots
    WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL;

    DELETE FROM sentiment_signals
    WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL;

    DELETE FROM gas_prices
    WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL;

    DELETE FROM agent_metrics
    WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO matrix;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO matrix;
