//! Feed Processor - MORPHEUS to DOZER Integration
//!
//! Bridges MORPHEUS price feeds into DOZER's processing pipeline.
//! Handles async message routing and feed coordination.

use std::sync::Arc;
use tokio::sync::mpsc;
use tracing::{info, warn, error, debug};

use matrix_types::PriceUpdate;
use morpheus::{DexWebSocketFeed, PriceFeed, FeedStatus, MorpheusError};
use crate::{Dozer, DozerError, NormalizedPrice, SpreadInfo};
use crossbeam::channel::Sender as CrossbeamSender;

/// Feed processor configuration
#[derive(Debug, Clone)]
pub struct ProcessorConfig {
    /// Maximum updates to buffer
    pub buffer_size: usize,
    /// Update batch size for processing
    pub batch_size: usize,
    /// Processing interval in milliseconds
    pub interval_ms: u64,
}

impl Default for ProcessorConfig {
    fn default() -> Self {
        Self {
            buffer_size: 10000,
            batch_size: 100,
            interval_ms: 1, // 1ms for low latency
        }
    }
}

/// Feed processor statistics
#[derive(Debug, Clone, Default)]
pub struct ProcessorStats {
    pub updates_received: u64,
    pub updates_processed: u64,
    pub updates_dropped: u64,
    pub processing_errors: u64,
    pub last_update_ms: u64,
}

/// Feed processor bridging MORPHEUS feeds to DOZER pipeline
pub struct FeedProcessor {
    config: ProcessorConfig,
    stats: ProcessorStats,
    feeds: Vec<Box<dyn PriceFeed>>,
    update_rx: Option<mpsc::Receiver<PriceUpdate>>,
    update_tx: mpsc::Sender<PriceUpdate>,
    shutdown_tx: Option<mpsc::Sender<()>>,
}

impl FeedProcessor {
    /// Create new feed processor
    pub fn new(config: ProcessorConfig) -> Self {
        let (update_tx, update_rx) = mpsc::channel(config.buffer_size);

        info!("DOZER FeedProcessor: Initializing with buffer_size={}", config.buffer_size);

        Self {
            config,
            stats: ProcessorStats::default(),
            feeds: Vec::new(),
            update_rx: Some(update_rx),
            update_tx,
            shutdown_tx: None,
        }
    }

    /// Add a price feed to process
    pub fn add_feed(&mut self, feed: Box<dyn PriceFeed>) {
        info!("FeedProcessor: Adding feed '{}'", feed.id());
        self.feeds.push(feed);
    }

    /// Get sender for external updates
    pub fn get_update_sender(&self) -> mpsc::Sender<PriceUpdate> {
        self.update_tx.clone()
    }

    /// Get processor statistics
    pub fn stats(&self) -> &ProcessorStats {
        &self.stats
    }

    /// Connect all feeds
    pub async fn connect_feeds(&mut self) -> Result<(), MorpheusError> {
        info!("FeedProcessor: Connecting {} feeds...", self.feeds.len());

        for feed in &mut self.feeds {
            match feed.connect().await {
                Ok(()) => info!("Connected feed: {}", feed.id()),
                Err(e) => {
                    error!("Failed to connect feed {}: {}", feed.id(), e);
                    return Err(e);
                }
            }
        }

        Ok(())
    }

    /// Start processing loop
    pub async fn start_processing(
        &mut self,
        price_tx: CrossbeamSender<NormalizedPrice>,
        spread_tx: CrossbeamSender<SpreadInfo>,
    ) -> Result<(), DozerError> {
        let (shutdown_tx, mut shutdown_rx) = mpsc::channel::<()>(1);
        self.shutdown_tx = Some(shutdown_tx);

        // Take ownership of the receiver
        let mut update_rx = self.update_rx.take()
            .ok_or_else(|| DozerError::StateError("Processor already started".to_string()))?;

        // Create DOZER instance for processing
        let mut dozer = Dozer::new();
        dozer.set_price_output(price_tx);
        dozer.set_spread_output(spread_tx);

        info!("FeedProcessor: Starting processing loop...");

        // Processing loop
        loop {
            tokio::select! {
                // Check for shutdown
                _ = shutdown_rx.recv() => {
                    info!("FeedProcessor: Shutdown signal received");
                    break;
                }

                // Process incoming updates
                Some(update) = update_rx.recv() => {
                    self.stats.updates_received += 1;
                    self.stats.last_update_ms = update.timestamp_ms;

                    match dozer.process_update(update) {
                        Ok(()) => {
                            self.stats.updates_processed += 1;
                        }
                        Err(e) => {
                            warn!("Processing error: {}", e);
                            self.stats.processing_errors += 1;
                        }
                    }
                }
            }
        }

        Ok(())
    }

    /// Stop processing
    pub async fn stop(&mut self) -> Result<(), DozerError> {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(()).await;
        }

        // Disconnect all feeds
        for feed in &mut self.feeds {
            if let Err(e) = feed.disconnect().await {
                warn!("Error disconnecting feed {}: {}", feed.id(), e);
            }
        }

        info!("FeedProcessor: Stopped");
        Ok(())
    }

    /// Get active feed count
    pub fn active_feed_count(&self) -> usize {
        self.feeds
            .iter()
            .filter(|f| f.status() == FeedStatus::Connected)
            .count()
    }
}

/// Builder for creating feed processor with feeds
pub struct FeedProcessorBuilder {
    config: ProcessorConfig,
    feeds: Vec<Box<dyn PriceFeed>>,
}

impl FeedProcessorBuilder {
    pub fn new() -> Self {
        Self {
            config: ProcessorConfig::default(),
            feeds: Vec::new(),
        }
    }

    pub fn with_config(mut self, config: ProcessorConfig) -> Self {
        self.config = config;
        self
    }

    pub fn add_feed(mut self, feed: Box<dyn PriceFeed>) -> Self {
        self.feeds.push(feed);
        self
    }

    pub fn build(self) -> FeedProcessor {
        let mut processor = FeedProcessor::new(self.config);
        for feed in self.feeds {
            processor.add_feed(feed);
        }
        processor
    }
}

impl Default for FeedProcessorBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_processor_creation() {
        let processor = FeedProcessor::new(ProcessorConfig::default());
        assert_eq!(processor.stats().updates_received, 0);
    }

    #[test]
    fn test_builder() {
        let processor = FeedProcessorBuilder::new()
            .with_config(ProcessorConfig {
                buffer_size: 5000,
                ..Default::default()
            })
            .build();

        assert_eq!(processor.config.buffer_size, 5000);
    }
}
