"""Tests for the Rama-Kandra liquidity analyzer."""

import time

import pytest

from rama_kandra.liquidity import (
    LiquidityAnalyzer,
    LiquidityDepth,
    LiquidityHealth,
)
from shared import ChainId, DexId


class TestLiquidityAnalyzer:
    """Test suite for LiquidityAnalyzer."""

    def test_initialization(self):
        """Test analyzer initializes correctly."""
        analyzer = LiquidityAnalyzer()
        assert analyzer is not None
        stats = analyzer.get_stats()
        assert stats["pools_tracked"] == 0

    def test_initialization_custom_params(self):
        """Test initialization with custom parameters."""
        analyzer = LiquidityAnalyzer(
            min_depth_usd=50000,
            max_imbalance_ratio=2.0,
        )
        assert analyzer.min_depth_usd == 50000
        assert analyzer.max_imbalance_ratio == 2.0

    def test_update_depth(self):
        """Test updating liquidity depth."""
        analyzer = LiquidityAnalyzer()

        depth = LiquidityDepth(
            pool_address="0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8",
            chain=ChainId.ETHEREUM,
            dex=DexId.UNISWAP_V3,
            bid_depth_usd={0.5: 100000, 1.0: 200000, 2.0: 500000},
            ask_depth_usd={0.5: 100000, 1.0: 200000, 2.0: 500000},
            timestamp_ms=int(time.time() * 1000),
        )

        analyzer.update_depth(depth)
        stats = analyzer.get_stats()
        assert stats["pools_tracked"] == 1

    def test_analyze_pool_health_good(self):
        """Test analyzing a healthy pool."""
        analyzer = LiquidityAnalyzer(min_depth_usd=10000)

        # Use 18-decimal format for both tokens (analyzer assumes 1e18 for all)
        # 500k token0 at $1 = $500k, 200 token1 at $2500 = $500k (balanced)
        health = analyzer.analyze_pool_health(
            pool_address="0x0001",
            chain=ChainId.ETHEREUM,
            reserve0=500_000 * 10**18,  # 500k tokens (18 decimals)
            reserve1=200 * 10**18,  # 200 tokens (18 decimals)
            token0_price_usd=1.0,  # $1 per token
            token1_price_usd=2500.0,  # $2500 per token
        )

        assert isinstance(health, LiquidityHealth)
        assert health.health_score > 0.8  # Should be healthy
        assert len(health.issues) == 0
        assert health.pool_address == "0x0001"

    def test_analyze_pool_health_low_tvl(self):
        """Test analyzing a pool with low TVL."""
        analyzer = LiquidityAnalyzer(min_depth_usd=100000)

        health = analyzer.analyze_pool_health(
            pool_address="0x0002",
            chain=ChainId.ETHEREUM,
            reserve0=1000 * 10**6,  # 1k USDC (low)
            reserve1=int(0.4 * 10**18),  # 0.4 ETH
            token0_price_usd=1.0,
            token1_price_usd=2500.0,
        )

        assert health.health_score < 0.8
        assert len(health.issues) > 0
        assert len(health.recommendations) > 0

    def test_analyze_pool_health_imbalanced(self):
        """Test analyzing an imbalanced pool."""
        analyzer = LiquidityAnalyzer(max_imbalance_ratio=2.0)

        health = analyzer.analyze_pool_health(
            pool_address="0x0003",
            chain=ChainId.ETHEREUM,
            reserve0=1_000_000 * 10**6,  # 1M USDC
            reserve1=50 * 10**18,  # 50 ETH (worth ~125k, 8x imbalance)
            token0_price_usd=1.0,
            token1_price_usd=2500.0,
        )

        assert health.health_score < 1.0
        assert len(health.issues) > 0

    def test_estimate_slippage(self):
        """Test slippage estimation."""
        analyzer = LiquidityAnalyzer()

        # Add depth data
        depth = LiquidityDepth(
            pool_address="0x0001",
            chain=ChainId.ETHEREUM,
            dex=DexId.UNISWAP_V3,
            bid_depth_usd={0.1: 50000, 0.5: 200000, 1.0: 500000},
            ask_depth_usd={0.1: 50000, 0.5: 200000, 1.0: 500000},
            timestamp_ms=int(time.time() * 1000),
        )
        analyzer.update_depth(depth)

        # Small trade should have low slippage
        slippage = analyzer.estimate_slippage(
            pool_address="0x0001",
            chain=ChainId.ETHEREUM,
            trade_size_usd=10000,
            is_buy=True,
        )

        assert slippage is not None
        assert slippage < 0.5  # Less than 0.5%

    def test_estimate_slippage_large_trade(self):
        """Test slippage estimation for large trade."""
        analyzer = LiquidityAnalyzer()

        depth = LiquidityDepth(
            pool_address="0x0001",
            chain=ChainId.ETHEREUM,
            dex=DexId.UNISWAP_V3,
            bid_depth_usd={0.1: 10000, 0.5: 50000, 1.0: 100000},
            ask_depth_usd={0.1: 10000, 0.5: 50000, 1.0: 100000},
            timestamp_ms=int(time.time() * 1000),
        )
        analyzer.update_depth(depth)

        # Large trade should have higher slippage
        slippage = analyzer.estimate_slippage(
            pool_address="0x0001",
            chain=ChainId.ETHEREUM,
            trade_size_usd=80000,
            is_buy=True,
        )

        assert slippage is not None
        assert slippage >= 0.5  # At least 0.5%

    def test_estimate_slippage_unknown_pool(self):
        """Test slippage estimation for unknown pool."""
        analyzer = LiquidityAnalyzer()

        slippage = analyzer.estimate_slippage(
            pool_address="0xunknown",
            chain=ChainId.ETHEREUM,
            trade_size_usd=10000,
            is_buy=True,
        )

        assert slippage is None

    def test_get_best_pools_for_trade(self):
        """Test finding best pools for a trade."""
        analyzer = LiquidityAnalyzer()
        ts = int(time.time() * 1000)

        # Add multiple pools with different depth
        for i, depth_multiplier in enumerate([1, 2, 0.5]):
            depth = LiquidityDepth(
                pool_address=f"0x000{i}",
                chain=ChainId.ETHEREUM,
                dex=DexId.UNISWAP_V3,
                bid_depth_usd={0.1: 50000 * depth_multiplier, 0.5: 200000 * depth_multiplier},
                ask_depth_usd={0.1: 50000 * depth_multiplier, 0.5: 200000 * depth_multiplier},
                timestamp_ms=ts,
            )
            analyzer.update_depth(depth)

        suitable_pools = analyzer.get_best_pools_for_trade(
            chain=ChainId.ETHEREUM,
            trade_size_usd=30000,
            max_slippage_bps=50,  # 0.5%
        )

        assert isinstance(suitable_pools, list)

    def test_cross_chain_isolation(self):
        """Test that pools on different chains are tracked separately."""
        analyzer = LiquidityAnalyzer()
        ts = int(time.time() * 1000)

        # Add pool on Ethereum
        depth_eth = LiquidityDepth(
            pool_address="0x0001",
            chain=ChainId.ETHEREUM,
            dex=DexId.UNISWAP_V3,
            bid_depth_usd={0.1: 100000},
            ask_depth_usd={0.1: 100000},
            timestamp_ms=ts,
        )

        # Add pool on Arbitrum
        depth_arb = LiquidityDepth(
            pool_address="0x0002",
            chain=ChainId.ARBITRUM,
            dex=DexId.UNISWAP_V3,
            bid_depth_usd={0.1: 100000},
            ask_depth_usd={0.1: 100000},
            timestamp_ms=ts,
        )

        analyzer.update_depth(depth_eth)
        analyzer.update_depth(depth_arb)

        stats = analyzer.get_stats()
        assert stats["pools_tracked"] == 2
        assert len(stats["chains"]) == 2

    def test_stats(self):
        """Test statistics tracking."""
        analyzer = LiquidityAnalyzer()
        ts = int(time.time() * 1000)

        depth1 = LiquidityDepth(
            pool_address="0x0001",
            chain=ChainId.ETHEREUM,
            dex=DexId.UNISWAP_V3,
            bid_depth_usd={0.1: 100000},
            ask_depth_usd={0.1: 100000},
            timestamp_ms=ts,
        )

        depth2 = LiquidityDepth(
            pool_address="0x0002",
            chain=ChainId.ARBITRUM,
            dex=DexId.CAMELOT,
            bid_depth_usd={0.1: 100000},
            ask_depth_usd={0.1: 100000},
            timestamp_ms=ts,
        )

        analyzer.update_depth(depth1)
        analyzer.update_depth(depth2)

        stats = analyzer.get_stats()
        assert stats["pools_tracked"] == 2
        assert len(stats["chains"]) == 2
