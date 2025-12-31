//! Matrix Types - Shared types for the flash loan arbitrage bot

use ethers_core::types::{Address, U256, H256};
use serde::{Deserialize, Serialize};

/// Chain identifiers
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ChainId {
    Ethereum = 1,
    Bsc = 56,
    Optimism = 10,
    Arbitrum = 42161,
    Base = 8453,
}

/// DEX identifiers
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum DexId {
    UniswapV3,
    SushiSwap,
    Curve,
    Balancer,
    PancakeSwap,
    Camelot,
    Velodrome,
    Aerodrome,
}

/// Price update from data feed
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PriceUpdate {
    pub timestamp_ms: u64,
    pub chain: ChainId,
    pub dex: DexId,
    pub pool: Address,
    pub token0: Address,
    pub token1: Address,
    pub reserve0: U256,
    pub reserve1: U256,
    pub price: U256, // token0 price in terms of token1 (18 decimals)
}

/// Arbitrage opportunity
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Opportunity {
    pub id: u64,
    pub timestamp_ms: u64,
    pub chain: ChainId,
    pub profit_wei: U256,
    pub gas_estimate: u64,
    pub path: Vec<SwapStep>,
    pub flash_loan_token: Address,
    pub flash_loan_amount: U256,
}

/// Single swap step in arbitrage path
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwapStep {
    pub dex: DexId,
    pub pool: Address,
    pub token_in: Address,
    pub token_out: Address,
    pub amount_in: U256,
    pub amount_out: U256,
}

/// Execution result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionResult {
    pub opportunity_id: u64,
    pub tx_hash: H256,
    pub success: bool,
    pub actual_profit: U256,
    pub gas_used: u64,
    pub block_number: u64,
    pub timestamp_ms: u64,
}

/// Agent health status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentHealth {
    pub name: String,
    pub status: AgentStatus,
    pub last_heartbeat_ms: u64,
    pub error_count: u64,
    pub metrics: std::collections::HashMap<String, f64>,
}

/// Agent status
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum AgentStatus {
    Starting,
    Running,
    Degraded,
    Stopping,
    Stopped,
    Failed,
}
