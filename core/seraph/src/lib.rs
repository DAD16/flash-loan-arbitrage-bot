//! SERAPH - Transaction Validator
//!
//! Guardian that validates transactions before execution.
//! Uses revm for EVM simulation to verify expected outcomes
//! before committing real transactions.
//!
//! # Responsibilities
//! - Simulate transactions before submission
//! - Verify expected profit > gas cost
//! - Check slippage within limits
//! - Validate all safety conditions

use async_trait::async_trait;
use ethers::types::{Address, U256, Bytes, H256};
use thiserror::Error;

/// Seraph validation errors
#[derive(Error, Debug)]
pub enum SeraphError {
    #[error("Simulation failed: {0}")]
    SimulationFailed(String),

    #[error("Validation failed: {0}")]
    ValidationFailed(String),

    #[error("Insufficient profit: expected {expected}, got {actual}")]
    InsufficientProfit { expected: U256, actual: U256 },

    #[error("Slippage exceeded: max {max_bps}bps, actual {actual_bps}bps")]
    SlippageExceeded { max_bps: u64, actual_bps: u64 },

    #[error("Gas estimation failed: {0}")]
    GasEstimationFailed(String),

    #[error("State access error: {0}")]
    StateAccessError(String),
}

/// Transaction to validate
#[derive(Debug, Clone)]
pub struct ValidationRequest {
    pub from: Address,
    pub to: Address,
    pub value: U256,
    pub data: Bytes,
    pub gas_limit: u64,
    pub gas_price: U256,
    pub expected_profit: U256,
    pub max_slippage_bps: u64,
}

/// Validation result
#[derive(Debug, Clone)]
pub struct ValidationResult {
    pub is_valid: bool,
    pub simulated_profit: U256,
    pub gas_used: u64,
    pub net_profit: U256,           // profit - gas cost
    pub slippage_bps: u64,
    pub state_changes: Vec<StateChange>,
    pub warnings: Vec<String>,
    pub errors: Vec<String>,
}

/// State change from simulation
#[derive(Debug, Clone)]
pub struct StateChange {
    pub address: Address,
    pub slot: H256,
    pub old_value: H256,
    pub new_value: H256,
}

/// Safety check configuration
#[derive(Debug, Clone)]
pub struct SafetyConfig {
    pub min_profit_wei: U256,
    pub max_slippage_bps: u64,
    pub max_gas_price: U256,
    pub max_position_size: U256,
    pub allowed_tokens: Vec<Address>,
    pub blocked_addresses: Vec<Address>,
}

impl Default for SafetyConfig {
    fn default() -> Self {
        Self {
            min_profit_wei: U256::from(1_000_000_000_000_000u64), // 0.001 ETH
            max_slippage_bps: 100,                                 // 1%
            max_gas_price: U256::from(500_000_000_000u64),        // 500 gwei
            max_position_size: U256::from(100u64) * U256::exp10(18), // 100 ETH
            allowed_tokens: Vec::new(),
            blocked_addresses: Vec::new(),
        }
    }
}

/// Transaction validator trait
#[async_trait]
pub trait Validator: Send + Sync {
    /// Validate a transaction
    async fn validate(&self, request: &ValidationRequest) -> Result<ValidationResult, SeraphError>;

    /// Simulate transaction execution
    async fn simulate(&self, request: &ValidationRequest) -> Result<U256, SeraphError>;

    /// Estimate gas usage
    async fn estimate_gas(&self, request: &ValidationRequest) -> Result<u64, SeraphError>;
}

/// Seraph transaction validator
pub struct Seraph {
    config: SafetyConfig,
    // EVM instance will be added (revm)
}

impl Seraph {
    pub fn new(config: SafetyConfig) -> Self {
        tracing::info!("SERAPH: Guardian initialized with safety checks...");
        Self { config }
    }

    pub fn with_default_config() -> Self {
        Self::new(SafetyConfig::default())
    }

    /// Perform pre-flight safety checks
    pub fn pre_flight_check(&self, request: &ValidationRequest) -> Result<(), SeraphError> {
        // Check gas price
        if request.gas_price > self.config.max_gas_price {
            return Err(SeraphError::ValidationFailed(format!(
                "Gas price {} exceeds max {}",
                request.gas_price, self.config.max_gas_price
            )));
        }

        // Check position size
        if request.value > self.config.max_position_size {
            return Err(SeraphError::ValidationFailed(format!(
                "Position size {} exceeds max {}",
                request.value, self.config.max_position_size
            )));
        }

        // Check blocked addresses
        if self.config.blocked_addresses.contains(&request.to) {
            return Err(SeraphError::ValidationFailed(
                "Target address is blocked".to_string()
            ));
        }

        Ok(())
    }

    /// Validate profit meets minimum threshold
    pub fn validate_profit(&self, profit: U256, gas_cost: U256) -> Result<U256, SeraphError> {
        if profit <= gas_cost {
            return Err(SeraphError::InsufficientProfit {
                expected: self.config.min_profit_wei,
                actual: U256::zero(),
            });
        }

        let net_profit = profit - gas_cost;
        if net_profit < self.config.min_profit_wei {
            return Err(SeraphError::InsufficientProfit {
                expected: self.config.min_profit_wei,
                actual: net_profit,
            });
        }

        Ok(net_profit)
    }

    /// Validate slippage within limits
    pub fn validate_slippage(&self, expected: U256, actual: U256) -> Result<u64, SeraphError> {
        if actual >= expected {
            return Ok(0);
        }

        let diff = expected - actual;
        let slippage_bps = (diff * U256::from(10000u64) / expected).as_u64();

        if slippage_bps > self.config.max_slippage_bps {
            return Err(SeraphError::SlippageExceeded {
                max_bps: self.config.max_slippage_bps,
                actual_bps: slippage_bps,
            });
        }

        Ok(slippage_bps)
    }

    /// Get current safety config
    pub fn config(&self) -> &SafetyConfig {
        &self.config
    }

    /// Update safety config
    pub fn update_config(&mut self, config: SafetyConfig) {
        tracing::info!("SERAPH: Updating safety configuration");
        self.config = config;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_seraph_creation() {
        let seraph = Seraph::with_default_config();
        assert_eq!(seraph.config().max_slippage_bps, 100);
    }

    #[test]
    fn test_profit_validation() {
        let seraph = Seraph::with_default_config();

        // Valid profit
        let profit = U256::from(10_000_000_000_000_000u64); // 0.01 ETH
        let gas = U256::from(1_000_000_000_000_000u64);      // 0.001 ETH
        let result = seraph.validate_profit(profit, gas);
        assert!(result.is_ok());

        // Insufficient profit
        let low_profit = U256::from(500_000_000_000_000u64); // 0.0005 ETH
        let result = seraph.validate_profit(low_profit, gas);
        assert!(result.is_err());
    }

    #[test]
    fn test_slippage_validation() {
        let seraph = Seraph::with_default_config();

        // No slippage
        let expected = U256::from(1000u64);
        let actual = U256::from(1000u64);
        let result = seraph.validate_slippage(expected, actual);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 0);

        // Acceptable slippage (0.5%)
        let actual_low = U256::from(995u64);
        let result = seraph.validate_slippage(expected, actual_low);
        assert!(result.is_ok());

        // Excessive slippage (5%)
        let actual_very_low = U256::from(950u64);
        let result = seraph.validate_slippage(expected, actual_very_low);
        assert!(result.is_err());
    }
}
