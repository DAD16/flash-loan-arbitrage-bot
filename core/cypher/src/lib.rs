//! CYPHER - Risk Manager
//!
//! Deals with the harsh reality of risk management.
//! Enforces position limits, monitors exposure, and triggers
//! circuit breakers when necessary.
//!
//! # Responsibilities
//! - Enforce position limits
//! - Monitor total exposure
//! - Trigger circuit breakers
//! - Calculate risk metrics (VaR, etc.)

use ethers::types::{Address, U256};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use thiserror::Error;

/// Cypher risk management errors
#[derive(Error, Debug)]
pub enum CypherError {
    #[error("Position limit exceeded: {0}")]
    PositionLimitExceeded(String),

    #[error("Exposure limit exceeded: current {current}, max {max}")]
    ExposureLimitExceeded { current: U256, max: U256 },

    #[error("Circuit breaker triggered: {0}")]
    CircuitBreakerTriggered(String),

    #[error("Risk check failed: {0}")]
    RiskCheckFailed(String),

    #[error("Cooldown active: {remaining_ms}ms remaining")]
    CooldownActive { remaining_ms: u64 },
}

/// Risk limits configuration
#[derive(Debug, Clone)]
pub struct RiskLimits {
    /// Maximum single position size in wei
    pub max_position_size: U256,
    /// Maximum total exposure in wei
    pub max_total_exposure: U256,
    /// Maximum number of concurrent positions
    pub max_concurrent_positions: u32,
    /// Maximum loss per hour in wei
    pub max_hourly_loss: U256,
    /// Maximum loss per day in wei
    pub max_daily_loss: U256,
    /// Cooldown after failed transaction in ms
    pub failure_cooldown_ms: u64,
    /// Maximum gas price willing to pay
    pub max_gas_price: U256,
}

impl Default for RiskLimits {
    fn default() -> Self {
        Self {
            max_position_size: U256::from(50u64) * U256::exp10(18),     // 50 ETH
            max_total_exposure: U256::from(200u64) * U256::exp10(18),   // 200 ETH
            max_concurrent_positions: 5,
            max_hourly_loss: U256::from(5u64) * U256::exp10(18),        // 5 ETH
            max_daily_loss: U256::from(20u64) * U256::exp10(18),        // 20 ETH
            failure_cooldown_ms: 5000,                                   // 5 seconds
            max_gas_price: U256::from(300_000_000_000u64),              // 300 gwei
        }
    }
}

/// Circuit breaker state
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum CircuitBreakerState {
    Closed,         // Normal operation
    Open,           // Halted - no trades allowed
    HalfOpen,       // Testing if conditions improved
}

/// Position tracking
#[derive(Debug, Clone)]
pub struct Position {
    pub id: u64,
    pub token: Address,
    pub amount: U256,
    pub entry_price: U256,
    pub timestamp_ms: u64,
}

/// Risk metrics snapshot
#[derive(Debug, Clone)]
pub struct RiskMetrics {
    pub total_exposure: U256,
    pub position_count: u32,
    pub hourly_pnl: i128,          // Can be negative
    pub daily_pnl: i128,
    pub win_rate: f64,
    pub avg_profit: U256,
    pub avg_loss: U256,
    pub sharpe_ratio: f64,
    pub max_drawdown: f64,
}

/// Cypher risk manager
pub struct Cypher {
    limits: RiskLimits,
    positions: HashMap<u64, Position>,
    circuit_breaker: CircuitBreakerState,
    is_halted: Arc<AtomicBool>,
    cooldown_until_ms: Arc<AtomicU64>,

    // Tracking
    hourly_loss: U256,
    daily_loss: U256,
    total_exposure: U256,
    next_position_id: u64,
}

impl Cypher {
    pub fn new(limits: RiskLimits) -> Self {
        tracing::info!("CYPHER: Risk manager online with limits: {:?}", limits);
        Self {
            limits,
            positions: HashMap::new(),
            circuit_breaker: CircuitBreakerState::Closed,
            is_halted: Arc::new(AtomicBool::new(false)),
            cooldown_until_ms: Arc::new(AtomicU64::new(0)),
            hourly_loss: U256::zero(),
            daily_loss: U256::zero(),
            total_exposure: U256::zero(),
            next_position_id: 1,
        }
    }

    pub fn with_default_limits() -> Self {
        Self::new(RiskLimits::default())
    }

    /// Check if trading is allowed
    pub fn can_trade(&self, current_time_ms: u64) -> Result<(), CypherError> {
        // Check halt status
        if self.is_halted.load(Ordering::SeqCst) {
            return Err(CypherError::CircuitBreakerTriggered(
                "System is halted".to_string()
            ));
        }

        // Check circuit breaker
        if self.circuit_breaker == CircuitBreakerState::Open {
            return Err(CypherError::CircuitBreakerTriggered(
                "Circuit breaker is open".to_string()
            ));
        }

        // Check cooldown
        let cooldown_until = self.cooldown_until_ms.load(Ordering::SeqCst);
        if current_time_ms < cooldown_until {
            return Err(CypherError::CooldownActive {
                remaining_ms: cooldown_until - current_time_ms,
            });
        }

        Ok(())
    }

    /// Check if a new position is allowed
    pub fn check_position(&self, amount: U256) -> Result<(), CypherError> {
        // Check position size
        if amount > self.limits.max_position_size {
            return Err(CypherError::PositionLimitExceeded(format!(
                "Position size {} exceeds max {}",
                amount, self.limits.max_position_size
            )));
        }

        // Check total exposure
        let new_exposure = self.total_exposure + amount;
        if new_exposure > self.limits.max_total_exposure {
            return Err(CypherError::ExposureLimitExceeded {
                current: new_exposure,
                max: self.limits.max_total_exposure,
            });
        }

        // Check concurrent positions
        if self.positions.len() as u32 >= self.limits.max_concurrent_positions {
            return Err(CypherError::RiskCheckFailed(format!(
                "Max concurrent positions ({}) reached",
                self.limits.max_concurrent_positions
            )));
        }

        Ok(())
    }

    /// Open a new position
    pub fn open_position(&mut self, token: Address, amount: U256, price: U256, timestamp_ms: u64) -> Result<u64, CypherError> {
        self.check_position(amount)?;

        let id = self.next_position_id;
        self.next_position_id += 1;

        let position = Position {
            id,
            token,
            amount,
            entry_price: price,
            timestamp_ms,
        };

        self.positions.insert(id, position);
        self.total_exposure += amount;

        tracing::info!("CYPHER: Opened position {} for {} wei", id, amount);
        Ok(id)
    }

    /// Close a position
    pub fn close_position(&mut self, id: u64, exit_price: U256) -> Result<i128, CypherError> {
        let position = self.positions.remove(&id).ok_or_else(|| {
            CypherError::RiskCheckFailed(format!("Position {} not found", id))
        })?;

        self.total_exposure = self.total_exposure.saturating_sub(position.amount);

        // Calculate PnL
        let entry_value = position.amount * position.entry_price / U256::exp10(18);
        let exit_value = position.amount * exit_price / U256::exp10(18);

        let pnl = if exit_value >= entry_value {
            (exit_value - entry_value).as_u128() as i128
        } else {
            -((entry_value - exit_value).as_u128() as i128)
        };

        // Track losses
        if pnl < 0 {
            let loss = U256::from((-pnl) as u128);
            self.hourly_loss += loss;
            self.daily_loss += loss;

            // Check loss limits
            self.check_loss_limits()?;
        }

        tracing::info!("CYPHER: Closed position {} with PnL: {}", id, pnl);
        Ok(pnl)
    }

    /// Check loss limits and trigger circuit breaker if needed
    fn check_loss_limits(&mut self) -> Result<(), CypherError> {
        if self.hourly_loss > self.limits.max_hourly_loss {
            self.trigger_circuit_breaker("Hourly loss limit exceeded");
            return Err(CypherError::CircuitBreakerTriggered(
                "Hourly loss limit exceeded".to_string()
            ));
        }

        if self.daily_loss > self.limits.max_daily_loss {
            self.trigger_circuit_breaker("Daily loss limit exceeded");
            return Err(CypherError::CircuitBreakerTriggered(
                "Daily loss limit exceeded".to_string()
            ));
        }

        Ok(())
    }

    /// Trigger circuit breaker
    pub fn trigger_circuit_breaker(&mut self, reason: &str) {
        tracing::warn!("CYPHER: Circuit breaker triggered - {}", reason);
        self.circuit_breaker = CircuitBreakerState::Open;
    }

    /// Reset circuit breaker (manual intervention)
    pub fn reset_circuit_breaker(&mut self) {
        tracing::info!("CYPHER: Circuit breaker reset");
        self.circuit_breaker = CircuitBreakerState::Closed;
    }

    /// Set failure cooldown
    pub fn set_cooldown(&self, current_time_ms: u64) {
        let cooldown_until = current_time_ms + self.limits.failure_cooldown_ms;
        self.cooldown_until_ms.store(cooldown_until, Ordering::SeqCst);
        tracing::info!("CYPHER: Cooldown set until {}", cooldown_until);
    }

    /// Emergency halt
    pub fn halt(&self, reason: &str) {
        tracing::error!("CYPHER: EMERGENCY HALT - {}", reason);
        self.is_halted.store(true, Ordering::SeqCst);
    }

    /// Resume from halt
    pub fn resume(&self) {
        tracing::info!("CYPHER: Resuming from halt");
        self.is_halted.store(false, Ordering::SeqCst);
    }

    /// Get current metrics
    pub fn metrics(&self) -> RiskMetrics {
        RiskMetrics {
            total_exposure: self.total_exposure,
            position_count: self.positions.len() as u32,
            hourly_pnl: 0,    // TODO: Calculate from history
            daily_pnl: 0,
            win_rate: 0.0,
            avg_profit: U256::zero(),
            avg_loss: U256::zero(),
            sharpe_ratio: 0.0,
            max_drawdown: 0.0,
        }
    }

    /// Get current limits
    pub fn limits(&self) -> &RiskLimits {
        &self.limits
    }

    /// Get circuit breaker state
    pub fn circuit_breaker_state(&self) -> CircuitBreakerState {
        self.circuit_breaker
    }

    /// Reset hourly counters (call every hour)
    pub fn reset_hourly(&mut self) {
        self.hourly_loss = U256::zero();
        tracing::debug!("CYPHER: Hourly counters reset");
    }

    /// Reset daily counters (call every day)
    pub fn reset_daily(&mut self) {
        self.daily_loss = U256::zero();
        tracing::debug!("CYPHER: Daily counters reset");
    }
}

impl Default for Cypher {
    fn default() -> Self {
        Self::with_default_limits()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cypher_creation() {
        let cypher = Cypher::with_default_limits();
        assert_eq!(cypher.circuit_breaker_state(), CircuitBreakerState::Closed);
    }

    #[test]
    fn test_position_limits() {
        let cypher = Cypher::with_default_limits();

        // Valid position
        let valid = U256::from(10u64) * U256::exp10(18);
        assert!(cypher.check_position(valid).is_ok());

        // Too large position
        let too_large = U256::from(100u64) * U256::exp10(18);
        assert!(cypher.check_position(too_large).is_err());
    }

    #[test]
    fn test_circuit_breaker() {
        let mut cypher = Cypher::with_default_limits();

        // Initially closed
        assert_eq!(cypher.circuit_breaker_state(), CircuitBreakerState::Closed);

        // Trigger
        cypher.trigger_circuit_breaker("Test");
        assert_eq!(cypher.circuit_breaker_state(), CircuitBreakerState::Open);

        // Reset
        cypher.reset_circuit_breaker();
        assert_eq!(cypher.circuit_breaker_state(), CircuitBreakerState::Closed);
    }
}
