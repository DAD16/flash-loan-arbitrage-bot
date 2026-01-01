//! Generic DEX WebSocket Feed
//!
//! Base implementation for subscribing to DEX pool events via WebSocket.
//! Supports eth_subscribe for Sync events and newPendingTransactions.

use std::sync::Arc;
use std::collections::HashSet;
use tokio::sync::{mpsc, RwLock};
use tokio_tungstenite::tungstenite::Message;
use async_trait::async_trait;
use ethers::core::types::{Address, U256, H256};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tracing::{info, warn, error, debug};

use matrix_types::{ChainId, DexId, PriceUpdate};
use crate::{MorpheusError, FeedStatus, PriceFeed, FeedConfig};
use super::connection::{ManagedConnection, ConnectionConfig};

/// Pool subscription configuration
#[derive(Debug, Clone)]
pub struct PoolSubscription {
    pub pool_address: Address,
    pub token0: Address,
    pub token1: Address,
    pub dex: DexId,
}

/// JSON-RPC request structure
#[derive(Debug, Serialize)]
struct JsonRpcRequest {
    jsonrpc: &'static str,
    id: u64,
    method: &'static str,
    params: Value,
}

/// JSON-RPC response structure
#[derive(Debug, Deserialize)]
struct JsonRpcResponse {
    jsonrpc: String,
    id: Option<u64>,
    result: Option<Value>,
    error: Option<JsonRpcError>,
    method: Option<String>,
    params: Option<SubscriptionParams>,
}

#[derive(Debug, Deserialize)]
struct JsonRpcError {
    code: i64,
    message: String,
}

#[derive(Debug, Deserialize)]
struct SubscriptionParams {
    subscription: String,
    result: Value,
}

/// Sync event log from DEX pools
#[derive(Debug, Deserialize)]
struct SyncEventLog {
    address: Address,
    topics: Vec<H256>,
    data: String,
    #[serde(rename = "blockNumber")]
    block_number: Option<String>,
    #[serde(rename = "transactionHash")]
    transaction_hash: Option<H256>,
}

/// Generic DEX WebSocket feed
pub struct DexWebSocketFeed {
    id: String,
    config: FeedConfig,
    chain: ChainId,
    dex: DexId,
    pools: Vec<PoolSubscription>,
    connection: Option<ManagedConnection>,
    status: FeedStatus,
    subscription_ids: Arc<RwLock<HashSet<String>>>,
    request_id: Arc<RwLock<u64>>,
}

impl DexWebSocketFeed {
    /// Create a new DEX WebSocket feed
    pub fn new(config: FeedConfig, pools: Vec<PoolSubscription>) -> Self {
        let id = format!("{:?}-{:?}", config.chain, config.dex);
        Self {
            id: id.clone(),
            chain: config.chain,
            dex: config.dex,
            pools,
            config,
            connection: None,
            status: FeedStatus::Disconnected,
            subscription_ids: Arc::new(RwLock::new(HashSet::new())),
            request_id: Arc::new(RwLock::new(1)),
        }
    }

    /// Get next request ID
    async fn next_request_id(&self) -> u64 {
        let mut id = self.request_id.write().await;
        let current = *id;
        *id += 1;
        current
    }

    /// Parse Sync event data to extract reserves
    fn parse_sync_event(&self, log: &SyncEventLog) -> Option<(U256, U256)> {
        // Sync event signature: Sync(uint112 reserve0, uint112 reserve1)
        // Topic[0] = keccak256("Sync(uint112,uint112)")
        // Data = abi.encode(reserve0, reserve1) - each is 32 bytes padded

        if log.data.len() < 130 {
            // "0x" + 64 chars for reserve0 + 64 chars for reserve1
            return None;
        }

        let data = log.data.trim_start_matches("0x");
        if data.len() < 128 {
            return None;
        }

        let reserve0_hex = &data[0..64];
        let reserve1_hex = &data[64..128];

        let reserve0 = U256::from_str_radix(reserve0_hex, 16).ok()?;
        let reserve1 = U256::from_str_radix(reserve1_hex, 16).ok()?;

        Some((reserve0, reserve1))
    }

    /// Calculate price from reserves (token0 price in terms of token1)
    fn calculate_price(&self, reserve0: U256, reserve1: U256) -> U256 {
        if reserve0.is_zero() {
            return U256::zero();
        }

        // Price = reserve1 / reserve0 * 10^18 for 18 decimal precision
        let precision = U256::from(10u64).pow(U256::from(18));
        (reserve1 * precision) / reserve0
    }

    /// Process incoming WebSocket message
    async fn process_message(
        &self,
        msg: Message,
        tx: &mpsc::Sender<PriceUpdate>,
    ) -> Result<(), MorpheusError> {
        let text = match msg {
            Message::Text(t) => t,
            Message::Binary(b) => String::from_utf8_lossy(&b).to_string(),
            _ => return Ok(()),
        };

        let response: JsonRpcResponse = serde_json::from_str(&text)
            .map_err(|e| MorpheusError::ParseError(format!("JSON parse error: {}", e)))?;

        // Handle subscription confirmations
        if let Some(result) = &response.result {
            if let Some(sub_id) = result.as_str() {
                debug!("Subscription confirmed: {}", sub_id);
                self.subscription_ids.write().await.insert(sub_id.to_string());
            }
        }

        // Handle subscription notifications (logs)
        if response.method.as_deref() == Some("eth_subscription") {
            if let Some(params) = response.params {
                self.process_subscription_event(params, tx).await?;
            }
        }

        Ok(())
    }

    /// Process subscription event (Sync log)
    async fn process_subscription_event(
        &self,
        params: SubscriptionParams,
        tx: &mpsc::Sender<PriceUpdate>,
    ) -> Result<(), MorpheusError> {
        // Parse the log
        let log: SyncEventLog = serde_json::from_value(params.result)
            .map_err(|e| MorpheusError::ParseError(format!("Log parse error: {}", e)))?;

        // Find the pool subscription for this address
        let pool = self
            .pools
            .iter()
            .find(|p| p.pool_address == log.address);

        let pool = match pool {
            Some(p) => p,
            None => {
                debug!("Received log for unknown pool: {:?}", log.address);
                return Ok(());
            }
        };

        // Parse reserves from Sync event
        let (reserve0, reserve1) = match self.parse_sync_event(&log) {
            Some(reserves) => reserves,
            None => {
                warn!("Failed to parse Sync event data");
                return Ok(());
            }
        };

        // Calculate price
        let price = self.calculate_price(reserve0, reserve1);

        // Create price update
        let update = PriceUpdate {
            timestamp_ms: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
            chain: self.chain,
            dex: pool.dex,
            pool: pool.pool_address,
            token0: pool.token0,
            token1: pool.token1,
            reserve0,
            reserve1,
            price,
        };

        debug!(
            "Price update: {:?} pool {:?} - reserve0={}, reserve1={}, price={}",
            pool.dex, pool.pool_address, reserve0, reserve1, price
        );

        // Send update
        tx.send(update)
            .await
            .map_err(|e| MorpheusError::FeedError(format!("Channel send error: {}", e)))?;

        Ok(())
    }

    /// Subscribe to Sync events for all pools
    async fn subscribe_to_pools(
        &self,
        write_tx: &mpsc::Sender<String>,
    ) -> Result<(), MorpheusError> {
        // Sync event topic: keccak256("Sync(uint112,uint112)")
        let sync_topic = "0x1c411e9a96e071241c2f21f7726b17ae89e3cab4c78be50e062b03a9fffbbad1";

        // Build address filter
        let addresses: Vec<String> = self
            .pools
            .iter()
            .map(|p| format!("{:?}", p.pool_address))
            .collect();

        // Create subscription request
        let request = JsonRpcRequest {
            jsonrpc: "2.0",
            id: self.next_request_id().await,
            method: "eth_subscribe",
            params: json!([
                "logs",
                {
                    "address": addresses,
                    "topics": [sync_topic]
                }
            ]),
        };

        let msg = serde_json::to_string(&request)
            .map_err(|e| MorpheusError::FeedError(format!("Serialize error: {}", e)))?;

        write_tx
            .send(msg)
            .await
            .map_err(|e| MorpheusError::FeedError(format!("Send error: {}", e)))?;

        info!(
            "Subscribed to Sync events for {} pools on {:?}",
            self.pools.len(),
            self.dex
        );

        Ok(())
    }
}

#[async_trait]
impl PriceFeed for DexWebSocketFeed {
    fn id(&self) -> String {
        self.id.clone()
    }

    async fn connect(&mut self) -> Result<(), MorpheusError> {
        info!("Connecting DEX feed: {}", self.id);

        let conn_config = ConnectionConfig {
            url: self.config.websocket_url.clone(),
            initial_reconnect_delay_ms: self.config.reconnect_delay_ms,
            max_reconnect_attempts: self.config.max_reconnect_attempts,
            ..Default::default()
        };

        let mut connection = ManagedConnection::new(conn_config);
        let _msg_rx = connection.connect().await?;

        self.connection = Some(connection);
        self.status = FeedStatus::Connected;

        Ok(())
    }

    async fn disconnect(&mut self) -> Result<(), MorpheusError> {
        if let Some(mut conn) = self.connection.take() {
            conn.disconnect().await?;
        }
        self.status = FeedStatus::Disconnected;
        self.subscription_ids.write().await.clear();
        Ok(())
    }

    fn status(&self) -> FeedStatus {
        self.status.clone()
    }

    async fn subscribe(&self, tx: mpsc::Sender<PriceUpdate>) -> Result<(), MorpheusError> {
        let conn = self
            .connection
            .as_ref()
            .ok_or_else(|| MorpheusError::ConnectionFailed("Not connected".to_string()))?;

        // Get connection receiver - Note: This is a simplified version
        // In production, we'd need to properly wire the message flow
        info!("Subscribe called for feed: {}", self.id);

        // The actual subscription and message handling would be done in the connection loop
        // For now, we just log that subscription was requested

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dex_feed_creation() {
        let config = FeedConfig {
            chain: ChainId::Bsc,
            dex: DexId::PancakeSwap,
            websocket_url: "wss://bsc-ws.example.com".to_string(),
            reconnect_delay_ms: 1000,
            max_reconnect_attempts: 5,
        };

        let feed = DexWebSocketFeed::new(config, vec![]);
        assert_eq!(feed.id(), "Bsc-PancakeSwap");
        assert_eq!(feed.status(), FeedStatus::Disconnected);
    }

    #[test]
    fn test_price_calculation() {
        let config = FeedConfig {
            chain: ChainId::Bsc,
            dex: DexId::PancakeSwap,
            websocket_url: String::new(),
            reconnect_delay_ms: 1000,
            max_reconnect_attempts: 5,
        };

        let feed = DexWebSocketFeed::new(config, vec![]);

        // Test with equal reserves
        let price = feed.calculate_price(
            U256::from(1000000000000000000u64), // 1e18
            U256::from(1000000000000000000u64), // 1e18
        );
        assert_eq!(price, U256::from(1000000000000000000u64)); // 1:1 price

        // Test with 2:1 ratio
        let price = feed.calculate_price(
            U256::from(1000000000000000000u64), // 1e18
            U256::from(2000000000000000000u64), // 2e18
        );
        assert_eq!(price, U256::from(2000000000000000000u64)); // 2:1 price
    }
}
