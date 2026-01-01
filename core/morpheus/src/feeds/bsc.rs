//! BSC-Specific Price Feeds
//!
//! WebSocket feeds for PancakeSwap, Biswap, and other BSC DEXs.
//! Pre-configured with known pool addresses and DEX routers.

use ethers::core::types::Address;
use std::str::FromStr;

use matrix_types::{ChainId, DexId};
use crate::PriceFeed;
use crate::FeedConfig;
use super::dex_feed::{DexWebSocketFeed, PoolSubscription};

// ============================================================================
// BSC TOKEN ADDRESSES
// ============================================================================

/// Well-known BSC token addresses
pub mod tokens {
    use ethers::core::types::Address;
    use std::str::FromStr;

    lazy_static::lazy_static! {
        pub static ref WBNB: Address = Address::from_str("0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c").unwrap();
        pub static ref USDT: Address = Address::from_str("0x55d398326f99059fF775485246999027B3197955").unwrap();
        pub static ref BUSD: Address = Address::from_str("0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56").unwrap();
        pub static ref USDC: Address = Address::from_str("0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d").unwrap();
        pub static ref ETH: Address = Address::from_str("0x2170Ed0880ac9A755fd29B2688956BD959F933F8").unwrap();
        pub static ref BTCB: Address = Address::from_str("0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c").unwrap();
        pub static ref CAKE: Address = Address::from_str("0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82").unwrap();
    }
}

// ============================================================================
// PANCAKESWAP
// ============================================================================

/// PancakeSwap V2 pool addresses
pub mod pancakeswap_pools {
    use ethers::core::types::Address;
    use std::str::FromStr;

    lazy_static::lazy_static! {
        /// WBNB-USDT pool
        pub static ref WBNB_USDT: Address = Address::from_str("0x16b9a82891338f9bA80E2D6970FddA79D1eb0daE").unwrap();
        /// WBNB-BUSD pool
        pub static ref WBNB_BUSD: Address = Address::from_str("0x58F876857a02D6762E0101bb5C46A8c1ED44Dc16").unwrap();
        /// WBNB-USDC pool
        pub static ref WBNB_USDC: Address = Address::from_str("0xd99c7F6C65857AC913a8f880A4cb84032AB2FC5b").unwrap();
        /// USDT-BUSD pool
        pub static ref USDT_BUSD: Address = Address::from_str("0x7EFaEf62fDdCCa950418312c6C91Aef321375A00").unwrap();
        /// ETH-WBNB pool
        pub static ref ETH_WBNB: Address = Address::from_str("0x74E4716E431f45807DCF19f284c7aA99F18a4fbc").unwrap();
        /// BTCB-WBNB pool
        pub static ref BTCB_WBNB: Address = Address::from_str("0x61EB789d75A95CAa3fF50ed7E47b96c132fEc082").unwrap();
    }
}

/// Create a PancakeSwap price feed with default pools
pub struct PancakeSwapFeed;

impl PancakeSwapFeed {
    /// Create feed with BSC WebSocket URL
    pub fn new(ws_url: String) -> DexWebSocketFeed {
        let config = FeedConfig {
            chain: ChainId::Bsc,
            dex: DexId::PancakeSwap,
            websocket_url: ws_url,
            reconnect_delay_ms: 1000,
            max_reconnect_attempts: 10,
        };

        let pools = vec![
            PoolSubscription {
                pool_address: *pancakeswap_pools::WBNB_USDT,
                token0: *tokens::WBNB,
                token1: *tokens::USDT,
                dex: DexId::PancakeSwap,
            },
            PoolSubscription {
                pool_address: *pancakeswap_pools::WBNB_BUSD,
                token0: *tokens::WBNB,
                token1: *tokens::BUSD,
                dex: DexId::PancakeSwap,
            },
            PoolSubscription {
                pool_address: *pancakeswap_pools::WBNB_USDC,
                token0: *tokens::WBNB,
                token1: *tokens::USDC,
                dex: DexId::PancakeSwap,
            },
            PoolSubscription {
                pool_address: *pancakeswap_pools::USDT_BUSD,
                token0: *tokens::USDT,
                token1: *tokens::BUSD,
                dex: DexId::PancakeSwap,
            },
            PoolSubscription {
                pool_address: *pancakeswap_pools::ETH_WBNB,
                token0: *tokens::ETH,
                token1: *tokens::WBNB,
                dex: DexId::PancakeSwap,
            },
            PoolSubscription {
                pool_address: *pancakeswap_pools::BTCB_WBNB,
                token0: *tokens::BTCB,
                token1: *tokens::WBNB,
                dex: DexId::PancakeSwap,
            },
        ];

        DexWebSocketFeed::new(config, pools)
    }

    /// Create feed with custom pools
    pub fn with_pools(ws_url: String, pools: Vec<PoolSubscription>) -> DexWebSocketFeed {
        let config = FeedConfig {
            chain: ChainId::Bsc,
            dex: DexId::PancakeSwap,
            websocket_url: ws_url,
            reconnect_delay_ms: 1000,
            max_reconnect_attempts: 10,
        };

        DexWebSocketFeed::new(config, pools)
    }
}

// ============================================================================
// BISWAP
// ============================================================================

/// Biswap pool addresses
pub mod biswap_pools {
    use ethers::core::types::Address;
    use std::str::FromStr;

    lazy_static::lazy_static! {
        /// WBNB-USDT pool
        pub static ref WBNB_USDT: Address = Address::from_str("0x8840C6252e2e86e545deFb6da98B2a0E26d8C1BA").unwrap();
        /// WBNB-BUSD pool
        pub static ref WBNB_BUSD: Address = Address::from_str("0xaCAac9311b0096E04Dfe96b6D87dec867d3883Dc").unwrap();
        /// USDT-BUSD pool
        pub static ref USDT_BUSD: Address = Address::from_str("0xDA8ceb724A06819c0A5cDb4304ea0cB27F8304cF").unwrap();
    }
}

/// Create a Biswap price feed with default pools
pub struct BiswapFeed;

impl BiswapFeed {
    /// Create feed with BSC WebSocket URL
    pub fn new(ws_url: String) -> DexWebSocketFeed {
        let config = FeedConfig {
            chain: ChainId::Bsc,
            dex: DexId::SushiSwap, // Using SushiSwap as placeholder since Biswap not in DexId
            websocket_url: ws_url,
            reconnect_delay_ms: 1000,
            max_reconnect_attempts: 10,
        };

        let pools = vec![
            PoolSubscription {
                pool_address: *biswap_pools::WBNB_USDT,
                token0: *tokens::WBNB,
                token1: *tokens::USDT,
                dex: DexId::SushiSwap,
            },
            PoolSubscription {
                pool_address: *biswap_pools::WBNB_BUSD,
                token0: *tokens::WBNB,
                token1: *tokens::BUSD,
                dex: DexId::SushiSwap,
            },
            PoolSubscription {
                pool_address: *biswap_pools::USDT_BUSD,
                token0: *tokens::USDT,
                token1: *tokens::BUSD,
                dex: DexId::SushiSwap,
            },
        ];

        DexWebSocketFeed::new(config, pools)
    }
}

// ============================================================================
// BSC PRICE FEED (Aggregate)
// ============================================================================

/// Aggregate BSC price feed that monitors multiple DEXs
pub struct BscPriceFeed {
    feeds: Vec<DexWebSocketFeed>,
}

impl BscPriceFeed {
    /// Create with default configuration for all major BSC DEXs
    pub fn new(ws_url: String) -> Self {
        let feeds = vec![
            PancakeSwapFeed::new(ws_url.clone()),
            BiswapFeed::new(ws_url),
        ];

        Self { feeds }
    }

    /// Get all feeds
    pub fn feeds(&self) -> &[DexWebSocketFeed] {
        &self.feeds
    }

    /// Get mutable feeds
    pub fn feeds_mut(&mut self) -> &mut Vec<DexWebSocketFeed> {
        &mut self.feeds
    }

    /// Total number of pools being monitored
    pub fn pool_count(&self) -> usize {
        self.feeds.iter().map(|f| f.id().len()).sum() // Placeholder - would need access to pools
    }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/// Get default BSC WebSocket URL from environment or use public endpoint
pub fn get_bsc_ws_url() -> String {
    std::env::var("BSC_WS_URL").unwrap_or_else(|_| {
        // Public BSC WebSocket endpoint (rate limited)
        "wss://bsc-ws-node.nariox.org:443".to_string()
    })
}

/// Create a pool subscription from addresses
pub fn create_pool_subscription(
    pool_address: &str,
    token0: &str,
    token1: &str,
    dex: DexId,
) -> Option<PoolSubscription> {
    Some(PoolSubscription {
        pool_address: Address::from_str(pool_address).ok()?,
        token0: Address::from_str(token0).ok()?,
        token1: Address::from_str(token1).ok()?,
        dex,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_token_addresses() {
        assert!(!tokens::WBNB.is_zero());
        assert!(!tokens::USDT.is_zero());
        assert!(!tokens::BUSD.is_zero());
    }

    #[test]
    fn test_pancakeswap_pools() {
        assert!(!pancakeswap_pools::WBNB_USDT.is_zero());
        assert!(!pancakeswap_pools::WBNB_BUSD.is_zero());
    }

    #[test]
    fn test_create_pancakeswap_feed() {
        let feed = PancakeSwapFeed::new("wss://test.example.com".to_string());
        assert_eq!(feed.id(), "Bsc-PancakeSwap");
    }

    #[test]
    fn test_create_biswap_feed() {
        let feed = BiswapFeed::new("wss://test.example.com".to_string());
        assert!(feed.id().contains("Bsc"));
    }
}
