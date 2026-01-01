//! WebSocket Feed Implementations
//!
//! Concrete implementations of the PriceFeed trait for various DEXs and chains.

pub mod connection;
pub mod dex_feed;
pub mod bsc;

pub use connection::{ConnectionPool, ConnectionConfig, ManagedConnection, ConnectionStats};
pub use dex_feed::{DexWebSocketFeed, PoolSubscription};
pub use bsc::{BscPriceFeed, PancakeSwapFeed, BiswapFeed};
