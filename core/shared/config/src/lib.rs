//! Matrix Config - Configuration management for the flash loan arbitrage bot
//!
//! Provides hierarchical configuration loading from multiple sources:
//! - Default values
//! - Configuration files (TOML/YAML)
//! - Environment variables
//! - Runtime overrides

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use thiserror::Error;

/// Configuration errors
#[derive(Error, Debug)]
pub enum ConfigError {
    #[error("Failed to load config file: {0}")]
    LoadError(String),

    #[error("Failed to parse config: {0}")]
    ParseError(String),

    #[error("Missing required config: {0}")]
    MissingRequired(String),

    #[error("Invalid config value: {0}")]
    InvalidValue(String),

    #[error("Environment variable error: {0}")]
    EnvError(String),
}

/// Chain-specific configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChainConfig {
    pub name: String,
    pub chain_id: u64,
    pub rpc_url: String,
    pub ws_url: String,
    pub flashloan_provider: String,
    pub flash_loan_contract: String,
    pub block_time_ms: u64,
    pub gas_limit: u64,
    pub priority_fee_gwei: u64,
}

/// DEX configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DexConfig {
    pub name: String,
    pub router_address: String,
    pub factory_address: String,
    pub fee_bps: u64,
    pub supported_chains: Vec<u64>,
}

/// RPC provider configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpcConfig {
    pub name: String,
    pub http_url: String,
    pub ws_url: String,
    pub api_key: Option<String>,
    pub priority: u32,
    pub max_retries: u32,
    pub timeout_ms: u64,
}

/// Risk management configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskConfig {
    pub max_position_size_eth: f64,
    pub max_total_exposure_eth: f64,
    pub max_concurrent_positions: u32,
    pub max_hourly_loss_eth: f64,
    pub max_daily_loss_eth: f64,
    pub min_profit_eth: f64,
    pub max_slippage_bps: u64,
    pub max_gas_price_gwei: u64,
    pub failure_cooldown_ms: u64,
}

impl Default for RiskConfig {
    fn default() -> Self {
        Self {
            max_position_size_eth: 50.0,
            max_total_exposure_eth: 200.0,
            max_concurrent_positions: 5,
            max_hourly_loss_eth: 5.0,
            max_daily_loss_eth: 20.0,
            min_profit_eth: 0.001,
            max_slippage_bps: 100,
            max_gas_price_gwei: 300,
            failure_cooldown_ms: 5000,
        }
    }
}

/// Monitoring configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitoringConfig {
    pub prometheus_port: u16,
    pub health_check_port: u16,
    pub jaeger_endpoint: Option<String>,
    pub log_level: String,
    pub metrics_interval_ms: u64,
}

impl Default for MonitoringConfig {
    fn default() -> Self {
        Self {
            prometheus_port: 9090,
            health_check_port: 8080,
            jaeger_endpoint: None,
            log_level: "info".to_string(),
            metrics_interval_ms: 1000,
        }
    }
}

/// Agent configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub enabled: bool,
    pub instances: u32,
    pub settings: HashMap<String, String>,
}

impl Default for AgentConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            instances: 1,
            settings: HashMap::new(),
        }
    }
}

/// Main configuration structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatrixConfig {
    pub environment: String,
    pub chains: HashMap<String, ChainConfig>,
    pub dexes: HashMap<String, DexConfig>,
    pub rpc_providers: Vec<RpcConfig>,
    pub risk: RiskConfig,
    pub monitoring: MonitoringConfig,
    pub agents: HashMap<String, AgentConfig>,
}

impl Default for MatrixConfig {
    fn default() -> Self {
        Self {
            environment: "development".to_string(),
            chains: HashMap::new(),
            dexes: HashMap::new(),
            rpc_providers: Vec::new(),
            risk: RiskConfig::default(),
            monitoring: MonitoringConfig::default(),
            agents: HashMap::new(),
        }
    }
}

impl MatrixConfig {
    /// Load configuration from file
    pub fn from_file<P: AsRef<Path>>(path: P) -> Result<Self, ConfigError> {
        let content = std::fs::read_to_string(path.as_ref())
            .map_err(|e| ConfigError::LoadError(e.to_string()))?;

        let config: MatrixConfig = toml::from_str(&content)
            .map_err(|e| ConfigError::ParseError(e.to_string()))?;

        Ok(config)
    }

    /// Load configuration with environment variable overrides
    pub fn from_file_with_env<P: AsRef<Path>>(path: P) -> Result<Self, ConfigError> {
        // Load dotenv if available
        let _ = dotenv::dotenv();

        let mut config = Self::from_file(path)?;
        config.apply_env_overrides()?;

        Ok(config)
    }

    /// Apply environment variable overrides
    fn apply_env_overrides(&mut self) -> Result<(), ConfigError> {
        // Override environment
        if let Ok(env) = std::env::var("MATRIX_ENVIRONMENT") {
            self.environment = env;
        }

        // Override monitoring
        if let Ok(port) = std::env::var("MATRIX_PROMETHEUS_PORT") {
            self.monitoring.prometheus_port = port
                .parse()
                .map_err(|_| ConfigError::InvalidValue("MATRIX_PROMETHEUS_PORT".to_string()))?;
        }

        if let Ok(level) = std::env::var("MATRIX_LOG_LEVEL") {
            self.monitoring.log_level = level;
        }

        // Override risk limits
        if let Ok(val) = std::env::var("MATRIX_MAX_POSITION_SIZE") {
            self.risk.max_position_size_eth = val
                .parse()
                .map_err(|_| ConfigError::InvalidValue("MATRIX_MAX_POSITION_SIZE".to_string()))?;
        }

        if let Ok(val) = std::env::var("MATRIX_MAX_GAS_PRICE_GWEI") {
            self.risk.max_gas_price_gwei = val
                .parse()
                .map_err(|_| ConfigError::InvalidValue("MATRIX_MAX_GAS_PRICE_GWEI".to_string()))?;
        }

        Ok(())
    }

    /// Get chain configuration by name
    pub fn get_chain(&self, name: &str) -> Option<&ChainConfig> {
        self.chains.get(name)
    }

    /// Get DEX configuration by name
    pub fn get_dex(&self, name: &str) -> Option<&DexConfig> {
        self.dexes.get(name)
    }

    /// Get agent configuration by name
    pub fn get_agent(&self, name: &str) -> Option<&AgentConfig> {
        self.agents.get(name)
    }

    /// Check if running in production
    pub fn is_production(&self) -> bool {
        self.environment == "production"
    }

    /// Validate configuration
    pub fn validate(&self) -> Result<(), ConfigError> {
        // Validate required chains
        if self.chains.is_empty() {
            return Err(ConfigError::MissingRequired("No chains configured".to_string()));
        }

        // Validate RPC providers
        if self.rpc_providers.is_empty() {
            return Err(ConfigError::MissingRequired("No RPC providers configured".to_string()));
        }

        // Validate risk limits
        if self.risk.max_position_size_eth <= 0.0 {
            return Err(ConfigError::InvalidValue("max_position_size must be positive".to_string()));
        }

        if self.risk.max_slippage_bps > 1000 {
            return Err(ConfigError::InvalidValue("max_slippage_bps should not exceed 10%".to_string()));
        }

        Ok(())
    }
}

/// Builder for MatrixConfig
pub struct ConfigBuilder {
    config: MatrixConfig,
}

impl ConfigBuilder {
    pub fn new() -> Self {
        Self {
            config: MatrixConfig::default(),
        }
    }

    pub fn environment(mut self, env: &str) -> Self {
        self.config.environment = env.to_string();
        self
    }

    pub fn add_chain(mut self, name: &str, chain: ChainConfig) -> Self {
        self.config.chains.insert(name.to_string(), chain);
        self
    }

    pub fn add_dex(mut self, name: &str, dex: DexConfig) -> Self {
        self.config.dexes.insert(name.to_string(), dex);
        self
    }

    pub fn add_rpc(mut self, rpc: RpcConfig) -> Self {
        self.config.rpc_providers.push(rpc);
        self
    }

    pub fn risk(mut self, risk: RiskConfig) -> Self {
        self.config.risk = risk;
        self
    }

    pub fn monitoring(mut self, monitoring: MonitoringConfig) -> Self {
        self.config.monitoring = monitoring;
        self
    }

    pub fn build(self) -> MatrixConfig {
        self.config
    }
}

impl Default for ConfigBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = MatrixConfig::default();
        assert_eq!(config.environment, "development");
        assert!(!config.is_production());
    }

    #[test]
    fn test_config_builder() {
        let config = ConfigBuilder::new()
            .environment("staging")
            .build();

        assert_eq!(config.environment, "staging");
    }

    #[test]
    fn test_risk_defaults() {
        let risk = RiskConfig::default();
        assert_eq!(risk.max_slippage_bps, 100);
        assert_eq!(risk.max_concurrent_positions, 5);
    }
}
