//! Matrix Metrics - Metrics and monitoring for the flash loan arbitrage bot
//!
//! Provides Prometheus-compatible metrics collection for all agents
//! and system components.

use prometheus::{
    Counter, CounterVec, Gauge, GaugeVec, Histogram, HistogramOpts, HistogramVec,
    IntCounter, IntCounterVec, IntGauge, IntGaugeVec, Opts, Registry,
};
use std::sync::OnceLock;

/// Global metrics registry
static REGISTRY: OnceLock<Registry> = OnceLock::new();

/// Get or initialize the global registry
pub fn registry() -> &'static Registry {
    REGISTRY.get_or_init(Registry::new)
}

/// Latency buckets for histograms (in seconds)
pub const LATENCY_BUCKETS: &[f64] = &[
    0.0001,  // 100μs
    0.0005,  // 500μs
    0.001,   // 1ms
    0.005,   // 5ms
    0.01,    // 10ms
    0.025,   // 25ms
    0.05,    // 50ms
    0.1,     // 100ms
    0.25,    // 250ms
    0.5,     // 500ms
    1.0,     // 1s
];

/// Profit buckets for histograms (in ETH)
pub const PROFIT_BUCKETS: &[f64] = &[
    0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0, 5.0,
];

/// Agent metrics
pub struct AgentMetrics {
    pub status: IntGaugeVec,
    pub uptime_seconds: GaugeVec,
    pub error_count: IntCounterVec,
    pub message_count: IntCounterVec,
    pub processing_time: HistogramVec,
}

impl AgentMetrics {
    pub fn new(registry: &Registry) -> Self {
        let status = IntGaugeVec::new(
            Opts::new("matrix_agent_status", "Agent status (0=stopped, 1=starting, 2=running, 3=stopping, 4=failed)"),
            &["agent"],
        ).expect("Failed to create agent_status metric");

        let uptime_seconds = GaugeVec::new(
            Opts::new("matrix_agent_uptime_seconds", "Agent uptime in seconds"),
            &["agent"],
        ).expect("Failed to create agent_uptime metric");

        let error_count = IntCounterVec::new(
            Opts::new("matrix_agent_errors_total", "Total agent errors"),
            &["agent", "error_type"],
        ).expect("Failed to create agent_errors metric");

        let message_count = IntCounterVec::new(
            Opts::new("matrix_agent_messages_total", "Total messages processed"),
            &["agent", "direction"],
        ).expect("Failed to create agent_messages metric");

        let processing_time = HistogramVec::new(
            HistogramOpts::new("matrix_agent_processing_seconds", "Message processing time")
                .buckets(LATENCY_BUCKETS.to_vec()),
            &["agent"],
        ).expect("Failed to create agent_processing metric");

        registry.register(Box::new(status.clone())).ok();
        registry.register(Box::new(uptime_seconds.clone())).ok();
        registry.register(Box::new(error_count.clone())).ok();
        registry.register(Box::new(message_count.clone())).ok();
        registry.register(Box::new(processing_time.clone())).ok();

        Self {
            status,
            uptime_seconds,
            error_count,
            message_count,
            processing_time,
        }
    }
}

/// Arbitrage metrics
pub struct ArbitrageMetrics {
    pub opportunities_detected: IntCounterVec,
    pub opportunities_executed: IntCounterVec,
    pub execution_success: IntCounterVec,
    pub execution_failed: IntCounterVec,
    pub profit_eth: HistogramVec,
    pub gas_used: HistogramVec,
    pub latency: HistogramVec,
    pub active_positions: IntGaugeVec,
    pub total_exposure: GaugeVec,
}

impl ArbitrageMetrics {
    pub fn new(registry: &Registry) -> Self {
        let opportunities_detected = IntCounterVec::new(
            Opts::new("matrix_opportunities_detected_total", "Total arbitrage opportunities detected"),
            &["chain", "dex_pair"],
        ).expect("Failed to create opportunities_detected metric");

        let opportunities_executed = IntCounterVec::new(
            Opts::new("matrix_opportunities_executed_total", "Total arbitrage opportunities executed"),
            &["chain"],
        ).expect("Failed to create opportunities_executed metric");

        let execution_success = IntCounterVec::new(
            Opts::new("matrix_execution_success_total", "Successful executions"),
            &["chain"],
        ).expect("Failed to create execution_success metric");

        let execution_failed = IntCounterVec::new(
            Opts::new("matrix_execution_failed_total", "Failed executions"),
            &["chain", "reason"],
        ).expect("Failed to create execution_failed metric");

        let profit_eth = HistogramVec::new(
            HistogramOpts::new("matrix_profit_eth", "Profit per trade in ETH")
                .buckets(PROFIT_BUCKETS.to_vec()),
            &["chain"],
        ).expect("Failed to create profit_eth metric");

        let gas_used = HistogramVec::new(
            HistogramOpts::new("matrix_gas_used", "Gas used per transaction")
                .buckets(vec![50000.0, 100000.0, 200000.0, 300000.0, 500000.0, 1000000.0]),
            &["chain"],
        ).expect("Failed to create gas_used metric");

        let latency = HistogramVec::new(
            HistogramOpts::new("matrix_execution_latency_seconds", "End-to-end execution latency")
                .buckets(LATENCY_BUCKETS.to_vec()),
            &["chain", "stage"],
        ).expect("Failed to create latency metric");

        let active_positions = IntGaugeVec::new(
            Opts::new("matrix_active_positions", "Number of active positions"),
            &["chain"],
        ).expect("Failed to create active_positions metric");

        let total_exposure = GaugeVec::new(
            Opts::new("matrix_total_exposure_eth", "Total exposure in ETH"),
            &["chain"],
        ).expect("Failed to create total_exposure metric");

        registry.register(Box::new(opportunities_detected.clone())).ok();
        registry.register(Box::new(opportunities_executed.clone())).ok();
        registry.register(Box::new(execution_success.clone())).ok();
        registry.register(Box::new(execution_failed.clone())).ok();
        registry.register(Box::new(profit_eth.clone())).ok();
        registry.register(Box::new(gas_used.clone())).ok();
        registry.register(Box::new(latency.clone())).ok();
        registry.register(Box::new(active_positions.clone())).ok();
        registry.register(Box::new(total_exposure.clone())).ok();

        Self {
            opportunities_detected,
            opportunities_executed,
            execution_success,
            execution_failed,
            profit_eth,
            gas_used,
            latency,
            active_positions,
            total_exposure,
        }
    }
}

/// Market data metrics
pub struct MarketMetrics {
    pub price_updates: IntCounterVec,
    pub feed_status: IntGaugeVec,
    pub feed_latency: HistogramVec,
    pub price_staleness: GaugeVec,
    pub reconnect_count: IntCounterVec,
}

impl MarketMetrics {
    pub fn new(registry: &Registry) -> Self {
        let price_updates = IntCounterVec::new(
            Opts::new("matrix_price_updates_total", "Total price updates received"),
            &["chain", "dex", "pool"],
        ).expect("Failed to create price_updates metric");

        let feed_status = IntGaugeVec::new(
            Opts::new("matrix_feed_status", "Feed connection status (0=disconnected, 1=connecting, 2=connected)"),
            &["chain", "dex"],
        ).expect("Failed to create feed_status metric");

        let feed_latency = HistogramVec::new(
            HistogramOpts::new("matrix_feed_latency_seconds", "Price feed latency")
                .buckets(LATENCY_BUCKETS.to_vec()),
            &["chain", "dex"],
        ).expect("Failed to create feed_latency metric");

        let price_staleness = GaugeVec::new(
            Opts::new("matrix_price_staleness_seconds", "Time since last price update"),
            &["chain", "dex", "pool"],
        ).expect("Failed to create price_staleness metric");

        let reconnect_count = IntCounterVec::new(
            Opts::new("matrix_feed_reconnects_total", "Total feed reconnection attempts"),
            &["chain", "dex"],
        ).expect("Failed to create reconnect_count metric");

        registry.register(Box::new(price_updates.clone())).ok();
        registry.register(Box::new(feed_status.clone())).ok();
        registry.register(Box::new(feed_latency.clone())).ok();
        registry.register(Box::new(price_staleness.clone())).ok();
        registry.register(Box::new(reconnect_count.clone())).ok();

        Self {
            price_updates,
            feed_status,
            feed_latency,
            price_staleness,
            reconnect_count,
        }
    }
}

/// Risk metrics
pub struct RiskMetrics {
    pub circuit_breaker_status: IntGauge,
    pub hourly_pnl_eth: Gauge,
    pub daily_pnl_eth: Gauge,
    pub max_drawdown: Gauge,
    pub position_count: IntGauge,
    pub cooldown_active: IntGauge,
}

impl RiskMetrics {
    pub fn new(registry: &Registry) -> Self {
        let circuit_breaker_status = IntGauge::new(
            "matrix_circuit_breaker_status",
            "Circuit breaker status (0=closed, 1=half-open, 2=open)",
        ).expect("Failed to create circuit_breaker_status metric");

        let hourly_pnl_eth = Gauge::new(
            "matrix_hourly_pnl_eth",
            "Profit/loss this hour in ETH",
        ).expect("Failed to create hourly_pnl metric");

        let daily_pnl_eth = Gauge::new(
            "matrix_daily_pnl_eth",
            "Profit/loss today in ETH",
        ).expect("Failed to create daily_pnl metric");

        let max_drawdown = Gauge::new(
            "matrix_max_drawdown",
            "Maximum drawdown percentage",
        ).expect("Failed to create max_drawdown metric");

        let position_count = IntGauge::new(
            "matrix_position_count",
            "Current number of open positions",
        ).expect("Failed to create position_count metric");

        let cooldown_active = IntGauge::new(
            "matrix_cooldown_active",
            "Whether cooldown is currently active (0/1)",
        ).expect("Failed to create cooldown_active metric");

        registry.register(Box::new(circuit_breaker_status.clone())).ok();
        registry.register(Box::new(hourly_pnl_eth.clone())).ok();
        registry.register(Box::new(daily_pnl_eth.clone())).ok();
        registry.register(Box::new(max_drawdown.clone())).ok();
        registry.register(Box::new(position_count.clone())).ok();
        registry.register(Box::new(cooldown_active.clone())).ok();

        Self {
            circuit_breaker_status,
            hourly_pnl_eth,
            daily_pnl_eth,
            max_drawdown,
            position_count,
            cooldown_active,
        }
    }
}

/// System metrics
pub struct SystemMetrics {
    pub cpu_usage: Gauge,
    pub memory_usage: Gauge,
    pub goroutines: IntGauge,
    pub open_connections: IntGaugeVec,
}

impl SystemMetrics {
    pub fn new(registry: &Registry) -> Self {
        let cpu_usage = Gauge::new(
            "matrix_cpu_usage_percent",
            "CPU usage percentage",
        ).expect("Failed to create cpu_usage metric");

        let memory_usage = Gauge::new(
            "matrix_memory_usage_bytes",
            "Memory usage in bytes",
        ).expect("Failed to create memory_usage metric");

        let goroutines = IntGauge::new(
            "matrix_active_tasks",
            "Number of active async tasks",
        ).expect("Failed to create goroutines metric");

        let open_connections = IntGaugeVec::new(
            Opts::new("matrix_open_connections", "Number of open connections"),
            &["type"],
        ).expect("Failed to create open_connections metric");

        registry.register(Box::new(cpu_usage.clone())).ok();
        registry.register(Box::new(memory_usage.clone())).ok();
        registry.register(Box::new(goroutines.clone())).ok();
        registry.register(Box::new(open_connections.clone())).ok();

        Self {
            cpu_usage,
            memory_usage,
            goroutines,
            open_connections,
        }
    }
}

/// All Matrix metrics
pub struct MatrixMetrics {
    pub agent: AgentMetrics,
    pub arbitrage: ArbitrageMetrics,
    pub market: MarketMetrics,
    pub risk: RiskMetrics,
    pub system: SystemMetrics,
}

impl MatrixMetrics {
    pub fn new() -> Self {
        let registry = registry();
        Self {
            agent: AgentMetrics::new(registry),
            arbitrage: ArbitrageMetrics::new(registry),
            market: MarketMetrics::new(registry),
            risk: RiskMetrics::new(registry),
            system: SystemMetrics::new(registry),
        }
    }
}

impl Default for MatrixMetrics {
    fn default() -> Self {
        Self::new()
    }
}

/// Get metrics as Prometheus text format
pub fn gather_metrics() -> String {
    use prometheus::Encoder;
    let encoder = prometheus::TextEncoder::new();
    let metric_families = registry().gather();
    let mut buffer = Vec::new();
    encoder.encode(&metric_families, &mut buffer).unwrap();
    String::from_utf8(buffer).unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_metrics_creation() {
        let metrics = MatrixMetrics::new();

        // Test setting some values
        metrics.agent.status.with_label_values(&["neo"]).set(2);
        metrics.arbitrage.opportunities_detected
            .with_label_values(&["ethereum", "uniswap-sushi"])
            .inc();

        // Verify metrics can be gathered
        let output = gather_metrics();
        assert!(!output.is_empty());
    }
}
