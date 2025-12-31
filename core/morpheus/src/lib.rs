//! MORPHEUS - Market Data Coordinator
//!
//! Awakens the system to market reality, coordinates all data feeds.
//! Manages WebSocket connections to DEX price feeds across multiple chains.
//!
//! # Responsibilities
//! - Manage connections to all DEX price feeds
//! - Coordinate mempool monitoring
//! - Ensure data consistency across feeds
//! - Handle feed failures gracefully

pub mod feeds;
pub mod websocket;
pub mod ai_research;

use async_trait::async_trait;
use matrix_types::{ChainId, DexId, PriceUpdate};
use thiserror::Error;
use tokio::sync::mpsc;

/// Morpheus errors
#[derive(Error, Debug)]
pub enum MorpheusError {
    #[error("Connection failed: {0}")]
    ConnectionFailed(String),

    #[error("Feed error: {0}")]
    FeedError(String),

    #[error("Subscription failed: {0}")]
    SubscriptionFailed(String),

    #[error("Parse error: {0}")]
    ParseError(String),
}

/// Feed configuration
#[derive(Debug, Clone)]
pub struct FeedConfig {
    pub chain: ChainId,
    pub dex: DexId,
    pub websocket_url: String,
    pub reconnect_delay_ms: u64,
    pub max_reconnect_attempts: u32,
}

/// Feed status
#[derive(Debug, Clone, PartialEq)]
pub enum FeedStatus {
    Connecting,
    Connected,
    Reconnecting(u32), // attempt number
    Disconnected,
    Failed(String),
}

/// Price feed trait
#[async_trait]
pub trait PriceFeed: Send + Sync {
    /// Get feed identifier
    fn id(&self) -> String;

    /// Connect to the feed
    async fn connect(&mut self) -> Result<(), MorpheusError>;

    /// Disconnect from the feed
    async fn disconnect(&mut self) -> Result<(), MorpheusError>;

    /// Get current status
    fn status(&self) -> FeedStatus;

    /// Subscribe to price updates
    async fn subscribe(&self, tx: mpsc::Sender<PriceUpdate>) -> Result<(), MorpheusError>;
}

/// Morpheus market data coordinator
pub struct Morpheus {
    feeds: Vec<Box<dyn PriceFeed>>,
    status: FeedStatus,
}

impl Morpheus {
    pub fn new() -> Self {
        tracing::info!("MORPHEUS: Awakening to market reality...");
        Self {
            feeds: Vec::new(),
            status: FeedStatus::Disconnected,
        }
    }

    /// Add a price feed
    pub fn add_feed(&mut self, feed: Box<dyn PriceFeed>) {
        tracing::info!("MORPHEUS: Adding feed '{}'", feed.id());
        self.feeds.push(feed);
    }

    /// Connect all feeds
    pub async fn connect_all(&mut self) -> Result<(), MorpheusError> {
        tracing::info!("MORPHEUS: Connecting to {} feeds...", self.feeds.len());
        self.status = FeedStatus::Connecting;

        for feed in &mut self.feeds {
            feed.connect().await?;
        }

        self.status = FeedStatus::Connected;
        Ok(())
    }

    /// Disconnect all feeds
    pub async fn disconnect_all(&mut self) -> Result<(), MorpheusError> {
        tracing::info!("MORPHEUS: Disconnecting all feeds...");

        for feed in &mut self.feeds {
            feed.disconnect().await?;
        }

        self.status = FeedStatus::Disconnected;
        Ok(())
    }

    /// Get overall status
    pub fn status(&self) -> &FeedStatus {
        &self.status
    }

    /// Get number of active feeds
    pub fn active_feed_count(&self) -> usize {
        self.feeds
            .iter()
            .filter(|f| f.status() == FeedStatus::Connected)
            .count()
    }
}

impl Default for Morpheus {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_morpheus_creation() {
        let morpheus = Morpheus::new();
        assert_eq!(*morpheus.status(), FeedStatus::Disconnected);
    }
}
