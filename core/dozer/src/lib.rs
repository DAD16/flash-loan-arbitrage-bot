//! DOZER - Data Pipeline Operator
//!
//! Processes and transforms raw market data from all feeds.
//! Uses lock-free data structures and Chronicle Queue for high-throughput
//! data processing with minimal latency.
//!
//! # Responsibilities
//! - Normalize prices across DEXs
//! - Maintain real-time order book state
//! - Calculate cross-DEX spreads
//! - Feed data to analysis layer

pub mod normalizer;
pub mod chronicle;
pub mod ai_research;

use crossbeam_channel::{Receiver, Sender};
use matrix_types::{ChainId, DexId, PriceUpdate};
use thiserror::Error;
use ethers_core::types::{Address, U256};
use std::collections::HashMap;

/// Dozer errors
#[derive(Error, Debug)]
pub enum DozerError {
    #[error("Normalization failed: {0}")]
    NormalizationFailed(String),

    #[error("Queue error: {0}")]
    QueueError(String),

    #[error("State error: {0}")]
    StateError(String),
}

/// Normalized price with metadata
#[derive(Debug, Clone)]
pub struct NormalizedPrice {
    pub chain: ChainId,
    pub dex: DexId,
    pub pool: Address,
    pub token0: Address,
    pub token1: Address,
    pub price: U256,           // Normalized to 18 decimals
    pub liquidity: U256,       // Available liquidity
    pub timestamp_ms: u64,
    pub confidence: f64,       // Price confidence score (0.0 - 1.0)
}

/// Cross-DEX spread opportunity
#[derive(Debug, Clone)]
pub struct SpreadInfo {
    pub chain: ChainId,
    pub token0: Address,
    pub token1: Address,
    pub buy_dex: DexId,
    pub buy_pool: Address,
    pub buy_price: U256,
    pub sell_dex: DexId,
    pub sell_pool: Address,
    pub sell_price: U256,
    pub spread_bps: i64,       // Spread in basis points
    pub max_size: U256,        // Maximum executable size
}

/// Pool state for aggregation
#[derive(Debug, Clone)]
pub struct PoolState {
    pub chain: ChainId,
    pub dex: DexId,
    pub pool: Address,
    pub token0: Address,
    pub token1: Address,
    pub reserve0: U256,
    pub reserve1: U256,
    pub last_update_ms: u64,
}

/// Dozer data pipeline
pub struct Dozer {
    /// Pool states by (chain, pool address)
    pool_states: HashMap<(ChainId, Address), PoolState>,
    /// Output channel for normalized prices
    output_tx: Option<Sender<NormalizedPrice>>,
    /// Output channel for spread opportunities
    spread_tx: Option<Sender<SpreadInfo>>,
}

impl Dozer {
    pub fn new() -> Self {
        tracing::info!("DOZER: Pipeline operator online...");
        Self {
            pool_states: HashMap::new(),
            output_tx: None,
            spread_tx: None,
        }
    }

    /// Set output channel for normalized prices
    pub fn set_price_output(&mut self, tx: Sender<NormalizedPrice>) {
        self.output_tx = Some(tx);
    }

    /// Set output channel for spread opportunities
    pub fn set_spread_output(&mut self, tx: Sender<SpreadInfo>) {
        self.spread_tx = Some(tx);
    }

    /// Process incoming price update
    pub fn process_update(&mut self, update: PriceUpdate) -> Result<(), DozerError> {
        // Update pool state
        let key = (update.chain, update.pool);
        let state = PoolState {
            chain: update.chain,
            dex: update.dex,
            pool: update.pool,
            token0: update.token0,
            token1: update.token1,
            reserve0: update.reserve0,
            reserve1: update.reserve1,
            last_update_ms: update.timestamp_ms,
        };
        self.pool_states.insert(key, state);

        // Normalize and emit price
        let normalized = self.normalize_price(&update)?;
        if let Some(tx) = &self.output_tx {
            tx.send(normalized)
                .map_err(|e| DozerError::QueueError(e.to_string()))?;
        }

        // Check for spread opportunities
        self.check_spreads(&update)?;

        Ok(())
    }

    /// Normalize price to standard format
    fn normalize_price(&self, update: &PriceUpdate) -> Result<NormalizedPrice, DozerError> {
        // Calculate liquidity (geometric mean of reserves)
        let liquidity = (update.reserve0 * update.reserve1).integer_sqrt();

        // Confidence based on liquidity depth
        let confidence = self.calculate_confidence(liquidity);

        Ok(NormalizedPrice {
            chain: update.chain,
            dex: update.dex,
            pool: update.pool,
            token0: update.token0,
            token1: update.token1,
            price: update.price,
            liquidity,
            timestamp_ms: update.timestamp_ms,
            confidence,
        })
    }

    /// Calculate price confidence based on liquidity
    fn calculate_confidence(&self, liquidity: U256) -> f64 {
        // Higher liquidity = higher confidence
        // $1M+ = 1.0, $100k = 0.9, $10k = 0.7, <$1k = 0.3
        let liquidity_usd = liquidity.as_u128() as f64 / 1e18;
        if liquidity_usd >= 1_000_000.0 {
            1.0
        } else if liquidity_usd >= 100_000.0 {
            0.9
        } else if liquidity_usd >= 10_000.0 {
            0.7
        } else {
            0.3
        }
    }

    /// Check for cross-DEX spread opportunities
    fn check_spreads(&self, update: &PriceUpdate) -> Result<(), DozerError> {
        // Find other pools with same token pair on same chain
        for ((chain, _), state) in &self.pool_states {
            if *chain != update.chain {
                continue;
            }
            if state.pool == update.pool {
                continue;
            }

            // Check if same token pair (in either direction)
            let same_pair = (state.token0 == update.token0 && state.token1 == update.token1)
                || (state.token0 == update.token1 && state.token1 == update.token0);

            if same_pair {
                // Calculate spread and emit if significant
                // TODO: Implement spread calculation
            }
        }

        Ok(())
    }

    /// Get current pool state
    pub fn get_pool_state(&self, chain: ChainId, pool: Address) -> Option<&PoolState> {
        self.pool_states.get(&(chain, pool))
    }

    /// Get all pool states for a chain
    pub fn get_chain_pools(&self, chain: ChainId) -> Vec<&PoolState> {
        self.pool_states
            .iter()
            .filter(|((c, _), _)| *c == chain)
            .map(|(_, state)| state)
            .collect()
    }
}

impl Default for Dozer {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dozer_creation() {
        let dozer = Dozer::new();
        assert!(dozer.pool_states.is_empty());
    }

    #[test]
    fn test_confidence_calculation() {
        let dozer = Dozer::new();

        // High liquidity
        let high = U256::from(1_000_000u64) * U256::exp10(18);
        assert_eq!(dozer.calculate_confidence(high), 1.0);

        // Low liquidity
        let low = U256::from(100u64) * U256::exp10(18);
        assert_eq!(dozer.calculate_confidence(low), 0.3);
    }
}
