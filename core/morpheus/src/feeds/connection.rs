//! WebSocket Connection Pool and Management
//!
//! Handles connection lifecycle, reconnection with exponential backoff,
//! and connection health monitoring.

use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{mpsc, RwLock};
use tokio::time::{sleep, Instant};
use tokio_tungstenite::{connect_async, tungstenite::Message, WebSocketStream, MaybeTlsStream};
use tokio::net::TcpStream;
use futures_util::{SinkExt, StreamExt};
use tracing::{info, warn, error, debug};

use crate::{MorpheusError, FeedStatus};

/// Connection configuration
#[derive(Debug, Clone)]
pub struct ConnectionConfig {
    /// WebSocket URL
    pub url: String,
    /// Initial reconnect delay in milliseconds
    pub initial_reconnect_delay_ms: u64,
    /// Maximum reconnect delay (caps exponential backoff)
    pub max_reconnect_delay_ms: u64,
    /// Maximum reconnection attempts (0 = infinite)
    pub max_reconnect_attempts: u32,
    /// Ping interval for keep-alive
    pub ping_interval_ms: u64,
    /// Connection timeout
    pub connect_timeout_ms: u64,
}

impl Default for ConnectionConfig {
    fn default() -> Self {
        Self {
            url: String::new(),
            initial_reconnect_delay_ms: 1000,
            max_reconnect_delay_ms: 30000,
            max_reconnect_attempts: 0, // infinite
            ping_interval_ms: 30000,
            connect_timeout_ms: 10000,
        }
    }
}

/// Connection statistics
#[derive(Debug, Clone, Default)]
pub struct ConnectionStats {
    pub connected_at: Option<Instant>,
    pub last_message_at: Option<Instant>,
    pub messages_received: u64,
    pub reconnect_count: u32,
    pub errors: u64,
}

/// Managed WebSocket connection with auto-reconnect
pub struct ManagedConnection {
    config: ConnectionConfig,
    status: Arc<RwLock<FeedStatus>>,
    stats: Arc<RwLock<ConnectionStats>>,
    shutdown_tx: Option<mpsc::Sender<()>>,
}

impl ManagedConnection {
    pub fn new(config: ConnectionConfig) -> Self {
        Self {
            config,
            status: Arc::new(RwLock::new(FeedStatus::Disconnected)),
            stats: Arc::new(RwLock::new(ConnectionStats::default())),
            shutdown_tx: None,
        }
    }

    /// Get current connection status
    pub async fn status(&self) -> FeedStatus {
        self.status.read().await.clone()
    }

    /// Get connection statistics
    pub async fn stats(&self) -> ConnectionStats {
        self.stats.read().await.clone()
    }

    /// Connect and start the message loop
    /// Returns a receiver for incoming messages
    pub async fn connect(&mut self) -> Result<mpsc::Receiver<Message>, MorpheusError> {
        let (msg_tx, msg_rx) = mpsc::channel::<Message>(1000);
        let (shutdown_tx, shutdown_rx) = mpsc::channel::<()>(1);

        self.shutdown_tx = Some(shutdown_tx);

        let config = self.config.clone();
        let status = Arc::clone(&self.status);
        let stats = Arc::clone(&self.stats);

        // Spawn connection manager task
        tokio::spawn(async move {
            connection_loop(config, status, stats, msg_tx, shutdown_rx).await;
        });

        Ok(msg_rx)
    }

    /// Disconnect gracefully
    pub async fn disconnect(&mut self) -> Result<(), MorpheusError> {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(()).await;
        }
        *self.status.write().await = FeedStatus::Disconnected;
        Ok(())
    }
}

/// Main connection loop with reconnection logic
async fn connection_loop(
    config: ConnectionConfig,
    status: Arc<RwLock<FeedStatus>>,
    stats: Arc<RwLock<ConnectionStats>>,
    msg_tx: mpsc::Sender<Message>,
    mut shutdown_rx: mpsc::Receiver<()>,
) {
    let mut reconnect_attempt = 0u32;
    let mut reconnect_delay = config.initial_reconnect_delay_ms;

    loop {
        // Check for shutdown
        if shutdown_rx.try_recv().is_ok() {
            info!("Connection loop received shutdown signal");
            break;
        }

        *status.write().await = if reconnect_attempt > 0 {
            FeedStatus::Reconnecting(reconnect_attempt)
        } else {
            FeedStatus::Connecting
        };

        info!("Connecting to WebSocket: {}", config.url);

        // Attempt connection with timeout
        let connect_result = tokio::time::timeout(
            Duration::from_millis(config.connect_timeout_ms),
            connect_async(&config.url),
        )
        .await;

        match connect_result {
            Ok(Ok((ws_stream, _response))) => {
                info!("WebSocket connected successfully");
                *status.write().await = FeedStatus::Connected;

                {
                    let mut s = stats.write().await;
                    s.connected_at = Some(Instant::now());
                    s.reconnect_count = reconnect_attempt;
                }

                // Reset reconnect state on successful connection
                reconnect_attempt = 0;
                reconnect_delay = config.initial_reconnect_delay_ms;

                // Run message loop
                let disconnect_reason = message_loop(
                    ws_stream,
                    &config,
                    Arc::clone(&stats),
                    msg_tx.clone(),
                    &mut shutdown_rx,
                )
                .await;

                match disconnect_reason {
                    DisconnectReason::Shutdown => {
                        info!("WebSocket disconnected by shutdown request");
                        break;
                    }
                    DisconnectReason::Error(e) => {
                        warn!("WebSocket error: {}", e);
                        stats.write().await.errors += 1;
                    }
                    DisconnectReason::ServerClosed => {
                        info!("WebSocket closed by server");
                    }
                }
            }
            Ok(Err(e)) => {
                error!("WebSocket connection failed: {}", e);
                stats.write().await.errors += 1;
            }
            Err(_) => {
                error!("WebSocket connection timed out");
                stats.write().await.errors += 1;
            }
        }

        // Check max reconnect attempts
        reconnect_attempt += 1;
        if config.max_reconnect_attempts > 0 && reconnect_attempt >= config.max_reconnect_attempts {
            error!("Max reconnection attempts reached ({})", config.max_reconnect_attempts);
            *status.write().await = FeedStatus::Failed("Max reconnection attempts reached".to_string());
            break;
        }

        // Exponential backoff
        info!(
            "Reconnecting in {}ms (attempt {})",
            reconnect_delay, reconnect_attempt
        );
        *status.write().await = FeedStatus::Reconnecting(reconnect_attempt);

        sleep(Duration::from_millis(reconnect_delay)).await;

        // Increase delay with exponential backoff, capped at max
        reconnect_delay = (reconnect_delay * 2).min(config.max_reconnect_delay_ms);
    }
}

enum DisconnectReason {
    Shutdown,
    Error(String),
    ServerClosed,
}

/// Message loop - handles incoming messages and ping/pong
async fn message_loop(
    ws_stream: WebSocketStream<MaybeTlsStream<TcpStream>>,
    config: &ConnectionConfig,
    stats: Arc<RwLock<ConnectionStats>>,
    msg_tx: mpsc::Sender<Message>,
    shutdown_rx: &mut mpsc::Receiver<()>,
) -> DisconnectReason {
    let (mut write, mut read) = ws_stream.split();
    let mut ping_interval = tokio::time::interval(Duration::from_millis(config.ping_interval_ms));

    loop {
        tokio::select! {
            // Check for shutdown
            _ = shutdown_rx.recv() => {
                debug!("Message loop received shutdown");
                let _ = write.close().await;
                return DisconnectReason::Shutdown;
            }

            // Ping interval for keep-alive
            _ = ping_interval.tick() => {
                if let Err(e) = write.send(Message::Ping(vec![])).await {
                    return DisconnectReason::Error(format!("Ping failed: {}", e));
                }
            }

            // Incoming messages
            msg = read.next() => {
                match msg {
                    Some(Ok(message)) => {
                        match &message {
                            Message::Text(_) | Message::Binary(_) => {
                                stats.write().await.messages_received += 1;
                                stats.write().await.last_message_at = Some(Instant::now());

                                if msg_tx.send(message).await.is_err() {
                                    warn!("Message receiver dropped");
                                    return DisconnectReason::Error("Receiver dropped".to_string());
                                }
                            }
                            Message::Ping(data) => {
                                if let Err(e) = write.send(Message::Pong(data.clone())).await {
                                    return DisconnectReason::Error(format!("Pong failed: {}", e));
                                }
                            }
                            Message::Pong(_) => {
                                // Keep-alive confirmed
                            }
                            Message::Close(_) => {
                                return DisconnectReason::ServerClosed;
                            }
                            Message::Frame(_) => {}
                        }
                    }
                    Some(Err(e)) => {
                        return DisconnectReason::Error(format!("WebSocket error: {}", e));
                    }
                    None => {
                        return DisconnectReason::ServerClosed;
                    }
                }
            }
        }
    }
}

/// Connection pool for managing multiple WebSocket connections
pub struct ConnectionPool {
    connections: Vec<ManagedConnection>,
}

impl ConnectionPool {
    pub fn new() -> Self {
        Self {
            connections: Vec::new(),
        }
    }

    pub fn add(&mut self, config: ConnectionConfig) {
        self.connections.push(ManagedConnection::new(config));
    }

    pub async fn connect_all(&mut self) -> Result<Vec<mpsc::Receiver<Message>>, MorpheusError> {
        let mut receivers = Vec::new();
        for conn in &mut self.connections {
            receivers.push(conn.connect().await?);
        }
        Ok(receivers)
    }

    pub async fn disconnect_all(&mut self) -> Result<(), MorpheusError> {
        for conn in &mut self.connections {
            conn.disconnect().await?;
        }
        Ok(())
    }

    pub fn len(&self) -> usize {
        self.connections.len()
    }

    pub fn is_empty(&self) -> bool {
        self.connections.is_empty()
    }
}

impl Default for ConnectionPool {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_connection_config_default() {
        let config = ConnectionConfig::default();
        assert_eq!(config.initial_reconnect_delay_ms, 1000);
        assert_eq!(config.max_reconnect_delay_ms, 30000);
    }

    #[test]
    fn test_connection_pool_creation() {
        let pool = ConnectionPool::new();
        assert!(pool.is_empty());
    }
}
