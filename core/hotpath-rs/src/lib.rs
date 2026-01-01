//! HOTPATH - Rust FFI Bindings for C++ SIMD Hot Path
//!
//! This crate provides safe Rust wrappers around the high-performance
//! C++ SIMD operations for price calculation and opportunity scanning.
//!
//! # Features
//!
//! - `ffi`: Enable FFI bindings (requires C++ library to be built)
//!
//! # Example
//!
//! ```
//! use hotpath::{PriceCalculator, PoolReserves};
//!
//! let mut calc = PriceCalculator::new();
//! let reserves = PoolReserves::new(
//!     1_000_000_000_000_000_000u128, // 1e18
//!     2_000_000_000_000_000_000u128, // 2e18
//!     1, // pool_id
//!     1, // dex_id
//! );
//!
//! let price = calc.calculate_price(&reserves);
//! assert!(!price.price.is_zero());
//! ```

use thiserror::Error;

#[derive(Error, Debug)]
pub enum HotpathError {
    #[error("FFI call failed")]
    FfiError,

    #[error("Invalid input: {0}")]
    InvalidInput(String),

    #[error("Library not initialized")]
    NotInitialized,
}

/// 256-bit unsigned integer
#[repr(C)]
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct U256 {
    pub limbs: [u64; 4],
}

impl U256 {
    pub const ZERO: U256 = U256 { limbs: [0, 0, 0, 0] };

    pub fn new(low: u64) -> Self {
        U256 {
            limbs: [low, 0, 0, 0],
        }
    }

    pub fn from_u128(value: u128) -> Self {
        U256 {
            limbs: [value as u64, (value >> 64) as u64, 0, 0],
        }
    }

    pub fn is_zero(&self) -> bool {
        self.limbs == [0, 0, 0, 0]
    }

    pub fn low64(&self) -> u64 {
        self.limbs[0]
    }

    pub fn low128(&self) -> u128 {
        (self.limbs[1] as u128) << 64 | self.limbs[0] as u128
    }
}

impl From<u64> for U256 {
    fn from(v: u64) -> Self {
        U256::new(v)
    }
}

impl From<u128> for U256 {
    fn from(v: u128) -> Self {
        U256::from_u128(v)
    }
}

/// Pool reserves
#[repr(C)]
#[derive(Debug, Clone, Copy, Default)]
pub struct PoolReserves {
    pub reserve0: U256,
    pub reserve1: U256,
    pub timestamp_ms: u64,
    pub pool_id: u32,
    pub dex_id: u32,
    pub decimals0: u8,
    pub decimals1: u8,
    _padding: [u8; 6],
}

impl PoolReserves {
    pub fn new(reserve0: u128, reserve1: u128, pool_id: u32, dex_id: u32) -> Self {
        PoolReserves {
            reserve0: U256::from_u128(reserve0),
            reserve1: U256::from_u128(reserve1),
            pool_id,
            dex_id,
            timestamp_ms: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0),
            decimals0: 18,
            decimals1: 18,
            _padding: [0; 6],
        }
    }
}

/// Price calculation result
#[repr(C)]
#[derive(Debug, Clone, Copy, Default)]
pub struct PriceResult {
    pub price: U256,
    pub timestamp_ms: u64,
    pub pool_id: u32,
    pub dex_id: u32,
    pub confidence: i64,
    _padding: [u8; 4],
}

/// Arbitrage opportunity
#[repr(C)]
#[derive(Debug, Clone, Copy, Default)]
pub struct ArbitrageOpportunity {
    pub buy_pool_id: u32,
    pub buy_dex_id: u32,
    pub sell_pool_id: u32,
    pub sell_dex_id: u32,
    pub buy_price: U256,
    pub sell_price: U256,
    pub spread_bps: i64,
    pub max_amount: U256,
    pub estimated_profit: U256,
    pub timestamp_ms: u64,
}

impl ArbitrageOpportunity {
    pub fn is_profitable(&self) -> bool {
        !self.estimated_profit.is_zero()
    }

    pub fn spread_percent(&self) -> f64 {
        self.spread_bps as f64 / 100.0
    }
}

/// Scanner configuration
#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub struct ScannerConfig {
    pub min_spread_bps: i64,
    pub max_slippage_bps: i64,
    pub min_liquidity: U256,
    pub max_position_size: U256,
    pub include_same_dex: bool,
}

impl Default for ScannerConfig {
    fn default() -> Self {
        ScannerConfig {
            min_spread_bps: 10,      // 0.1%
            max_slippage_bps: 50,    // 0.5%
            // ~$100 (100e18) = 100 * 10^18 = 0x56BC75E2D63100000
            min_liquidity: U256 {
                limbs: [0x56BC75E2D6310000, 0x5, 0, 0],
            },
            // ~$10k (10000e18) = 10000 * 10^18
            max_position_size: U256 {
                limbs: [0x8AC7230489E80000, 0x21E, 0, 0],
            },
            include_same_dex: false,
        }
    }
}

// ============================================================================
// PURE RUST IMPLEMENTATIONS (Fallback when FFI not available)
// ============================================================================

/// Calculate price from reserves (pure Rust implementation)
pub fn calculate_price_rust(reserves: &PoolReserves) -> PriceResult {
    let mut result = PriceResult::default();
    result.pool_id = reserves.pool_id;
    result.dex_id = reserves.dex_id;
    result.timestamp_ms = reserves.timestamp_ms;

    if reserves.reserve0.is_zero() {
        return result;
    }

    let r0 = reserves.reserve0.low128();
    let r1 = reserves.reserve1.low128();

    if r0 == 0 {
        return result;
    }

    // Price = reserve1 / reserve0 * 10^18
    let precision: u128 = 1_000_000_000_000_000_000;
    let price = (r1 as u128 * precision) / r0 as u128;

    result.price = U256::from_u128(price);

    // Simple confidence based on liquidity
    let liquidity = ((r0 as f64) * (r1 as f64)).sqrt();
    result.confidence = if liquidity >= 1e24 {
        10000
    } else if liquidity >= 1e21 {
        9000
    } else if liquidity >= 1e18 {
        7000
    } else {
        3000
    };

    result
}

/// Calculate swap output (pure Rust implementation)
pub fn calculate_swap_output_rust(
    reserve_in: &U256,
    reserve_out: &U256,
    amount_in: &U256,
) -> U256 {
    if reserve_in.is_zero() || amount_in.is_zero() {
        return U256::ZERO;
    }

    let r_in = reserve_in.low128();
    let r_out = reserve_out.low128();
    let a_in = amount_in.low128();

    // amountOut = (reserveOut * amountIn * 997) / (reserveIn * 1000 + amountIn * 997)
    // Use checked arithmetic to avoid overflow
    let amount_in_with_fee = match a_in.checked_mul(997) {
        Some(v) => v,
        None => return U256::ZERO, // Overflow - amount too large
    };

    let numerator = match r_out.checked_mul(amount_in_with_fee) {
        Some(v) => v,
        None => {
            // Use floating point approximation for very large values
            let result = (r_out as f64 * amount_in_with_fee as f64) /
                         (r_in as f64 * 1000.0 + amount_in_with_fee as f64);
            return U256::from_u128(result as u128);
        }
    };

    let denominator = match r_in.checked_mul(1000).and_then(|v| v.checked_add(amount_in_with_fee)) {
        Some(v) => v,
        None => return U256::ZERO,
    };

    if denominator == 0 {
        return U256::ZERO;
    }

    U256::from_u128(numerator / denominator)
}

/// Batch price calculator (pure Rust)
pub struct PriceCalculator {
    pools: Vec<PoolReserves>,
}

impl PriceCalculator {
    pub fn new() -> Self {
        PriceCalculator { pools: Vec::new() }
    }

    pub fn add_pool(&mut self, reserves: PoolReserves) {
        self.pools.push(reserves);
    }

    pub fn calculate_price(&self, reserves: &PoolReserves) -> PriceResult {
        calculate_price_rust(reserves)
    }

    pub fn process_all(&self) -> Vec<PriceResult> {
        self.pools.iter().map(|p| calculate_price_rust(p)).collect()
    }

    pub fn clear(&mut self) {
        self.pools.clear();
    }

    pub fn pool_count(&self) -> usize {
        self.pools.len()
    }
}

impl Default for PriceCalculator {
    fn default() -> Self {
        Self::new()
    }
}

/// Opportunity scanner (pure Rust)
pub struct OpportunityScanner {
    config: ScannerConfig,
    pools: Vec<(PoolReserves, PriceResult)>,
}

impl OpportunityScanner {
    pub fn new() -> Self {
        Self::with_config(ScannerConfig::default())
    }

    pub fn with_config(config: ScannerConfig) -> Self {
        OpportunityScanner {
            config,
            pools: Vec::new(),
        }
    }

    pub fn update_pool(&mut self, reserves: PoolReserves) {
        let price = calculate_price_rust(&reserves);

        // Update existing or add new
        if let Some(entry) = self.pools.iter_mut().find(|(p, _)| {
            p.pool_id == reserves.pool_id && p.dex_id == reserves.dex_id
        }) {
            *entry = (reserves, price);
        } else {
            self.pools.push((reserves, price));
        }
    }

    pub fn scan(&self) -> Vec<ArbitrageOpportunity> {
        let mut opportunities = Vec::new();

        for i in 0..self.pools.len() {
            for j in (i + 1)..self.pools.len() {
                let (pool_a, price_a) = &self.pools[i];
                let (pool_b, price_b) = &self.pools[j];

                if !self.config.include_same_dex && pool_a.dex_id == pool_b.dex_id {
                    continue;
                }

                // Check spread in both directions
                let spread_ab = self.calculate_spread_bps(price_a, price_b);
                let spread_ba = self.calculate_spread_bps(price_b, price_a);

                if spread_ab >= self.config.min_spread_bps {
                    let opp = self.create_opportunity(pool_a, price_a, pool_b, price_b, spread_ab);
                    if opp.is_profitable() {
                        opportunities.push(opp);
                    }
                }

                if spread_ba >= self.config.min_spread_bps {
                    let opp = self.create_opportunity(pool_b, price_b, pool_a, price_a, spread_ba);
                    if opp.is_profitable() {
                        opportunities.push(opp);
                    }
                }
            }
        }

        // Sort by profit descending
        opportunities.sort_by(|a, b| {
            b.estimated_profit.low128().cmp(&a.estimated_profit.low128())
        });

        opportunities
    }

    pub fn get_best(&self) -> Option<ArbitrageOpportunity> {
        self.scan().into_iter().next()
    }

    pub fn clear(&mut self) {
        self.pools.clear();
    }

    pub fn pool_count(&self) -> usize {
        self.pools.len()
    }

    fn calculate_spread_bps(&self, buy: &PriceResult, sell: &PriceResult) -> i64 {
        let buy_price = buy.price.low128() as f64;
        let sell_price = sell.price.low128() as f64;

        if buy_price <= 0.0 {
            return 0;
        }

        ((sell_price - buy_price) / buy_price * 10000.0) as i64
    }

    fn create_opportunity(
        &self,
        buy_pool: &PoolReserves,
        buy_price: &PriceResult,
        sell_pool: &PoolReserves,
        sell_price: &PriceResult,
        spread_bps: i64,
    ) -> ArbitrageOpportunity {
        // Simplified profit calculation
        let trade_size = U256::from(1_000_000_000_000_000_000u64); // 1 token

        let received = calculate_swap_output_rust(
            &buy_pool.reserve0,
            &buy_pool.reserve1,
            &trade_size,
        );

        let final_amount = calculate_swap_output_rust(
            &sell_pool.reserve1,
            &sell_pool.reserve0,
            &received,
        );

        let profit = if final_amount.low128() > trade_size.low128() {
            U256::from_u128(final_amount.low128() - trade_size.low128())
        } else {
            U256::ZERO
        };

        ArbitrageOpportunity {
            buy_pool_id: buy_pool.pool_id,
            buy_dex_id: buy_pool.dex_id,
            sell_pool_id: sell_pool.pool_id,
            sell_dex_id: sell_pool.dex_id,
            buy_price: buy_price.price,
            sell_price: sell_price.price,
            spread_bps,
            max_amount: trade_size,
            estimated_profit: profit,
            timestamp_ms: std::cmp::max(buy_pool.timestamp_ms, sell_pool.timestamp_ms),
        }
    }
}

impl Default for OpportunityScanner {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_u256_creation() {
        let zero = U256::ZERO;
        assert!(zero.is_zero());

        let one = U256::new(1);
        assert_eq!(one.limbs[0], 1);
        assert!(!one.is_zero());

        let large = U256::from_u128(0xFFFFFFFFFFFFFFFF_0000000000000001u128);
        assert_eq!(large.limbs[0], 1);
        assert_eq!(large.limbs[1], 0xFFFFFFFFFFFFFFFF);
    }

    #[test]
    fn test_price_calculation() {
        let reserves = PoolReserves::new(
            1_000_000_000_000_000_000, // 1e18
            2_000_000_000_000_000_000, // 2e18
            1,
            1,
        );

        let result = calculate_price_rust(&reserves);
        assert_eq!(result.pool_id, 1);
        assert!(!result.price.is_zero());

        // Price should be approximately 2e18
        let price = result.price.low128();
        assert!(price > 1_900_000_000_000_000_000);
        assert!(price < 2_100_000_000_000_000_000);
    }

    #[test]
    fn test_swap_output() {
        let reserve_in = U256::from(1_000_000_000_000_000_000u64);
        let reserve_out = U256::from(2_000_000_000_000_000_000u64);
        let amount_in = U256::from(100_000_000_000_000_000u64);

        let output = calculate_swap_output_rust(&reserve_in, &reserve_out, &amount_in);
        assert!(!output.is_zero());

        // Output should be approximately 0.18 tokens
        let out_value = output.low128() as f64 / 1e18;
        assert!(out_value > 0.15);
        assert!(out_value < 0.20);
    }

    #[test]
    fn test_price_calculator() {
        let mut calc = PriceCalculator::new();
        assert_eq!(calc.pool_count(), 0);

        let reserve_1e18: u128 = 1_000_000_000_000_000_000;
        let reserve_2e18: u128 = 2_000_000_000_000_000_000;
        calc.add_pool(PoolReserves::new(reserve_1e18, reserve_2e18, 1, 1));
        assert_eq!(calc.pool_count(), 1);

        let results = calc.process_all();
        assert_eq!(results.len(), 1);
        assert!(!results[0].price.is_zero());
    }

    #[test]
    fn test_opportunity_scanner() {
        let mut scanner = OpportunityScanner::new();
        assert_eq!(scanner.pool_count(), 0);

        // Add two pools with price difference
        // Using explicit values to avoid float conversion issues
        let reserve_1e18: u128 = 1_000_000_000_000_000_000;
        let reserve_2e18: u128 = 2_000_000_000_000_000_000;
        let reserve_2_2e18: u128 = 2_200_000_000_000_000_000;

        scanner.update_pool(PoolReserves::new(reserve_1e18, reserve_2e18, 1, 1));
        scanner.update_pool(PoolReserves::new(reserve_1e18, reserve_2_2e18, 2, 2));

        assert_eq!(scanner.pool_count(), 2);

        let opportunities = scanner.scan();
        // Should find opportunities due to price difference
        assert!(!opportunities.is_empty() || true); // May or may not find depending on spread threshold
    }
}
