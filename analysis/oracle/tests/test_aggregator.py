"""Tests for the Oracle price aggregator."""

import time

import pytest

from oracle.aggregator import PriceAggregator, AggregatedPrice
from shared import ChainId, DexId, PriceUpdate


class TestPriceAggregator:
    """Test suite for PriceAggregator."""

    def test_initialization(self):
        """Test aggregator initializes correctly."""
        aggregator = PriceAggregator()
        assert aggregator is not None
        stats = aggregator.get_stats()
        assert stats["total_prices"] == 0
        assert stats["unique_pairs"] == 0

    def test_add_price(self):
        """Test adding a price to the aggregator."""
        aggregator = PriceAggregator(min_sources=1)

        update = PriceUpdate(
            chain=ChainId.ETHEREUM,
            dex=DexId.UNISWAP_V3,
            pool="0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8",
            token0="WETH",
            token1="USDC",
            reserve0=1000 * 10**18,
            reserve1=2_500_000 * 10**6,
            price=2500 * 10**18,
            timestamp_ms=int(time.time() * 1000),
        )
        aggregator.add_price(update)

        stats = aggregator.get_stats()
        assert stats["total_prices"] == 1
        assert stats["known_pools"] == 1

    def test_get_aggregated_price(self):
        """Test getting aggregated price."""
        aggregator = PriceAggregator(min_sources=2)
        ts = int(time.time() * 1000)

        # Add prices from two sources
        update1 = PriceUpdate(
            chain=ChainId.ETHEREUM,
            dex=DexId.UNISWAP_V3,
            pool="0x0001",
            token0="WETH",
            token1="USDC",
            reserve0=1000 * 10**18,
            reserve1=2_500_000 * 10**6,
            price=2500 * 10**18,
            timestamp_ms=ts,
        )
        update2 = PriceUpdate(
            chain=ChainId.ETHEREUM,
            dex=DexId.SUSHISWAP,
            pool="0x0002",
            token0="WETH",
            token1="USDC",
            reserve0=500 * 10**18,
            reserve1=1_250_000 * 10**6,
            price=2500 * 10**18,
            timestamp_ms=ts,
        )

        aggregator.add_price(update1)
        aggregator.add_price(update2)

        price = aggregator.get_aggregated_price(ChainId.ETHEREUM, "WETH", "USDC")
        assert price is not None
        assert isinstance(price, AggregatedPrice)
        assert price.chain == ChainId.ETHEREUM

    def test_get_aggregated_price_not_enough_sources(self):
        """Test getting price with insufficient sources."""
        aggregator = PriceAggregator(min_sources=2)

        update = PriceUpdate(
            chain=ChainId.ETHEREUM,
            dex=DexId.UNISWAP_V3,
            pool="0x0001",
            token0="WETH",
            token1="USDC",
            reserve0=1000 * 10**18,
            reserve1=2_500_000 * 10**6,
            price=2500 * 10**18,
            timestamp_ms=int(time.time() * 1000),
        )
        aggregator.add_price(update)

        # Should return None because only 1 source
        price = aggregator.get_aggregated_price(ChainId.ETHEREUM, "WETH", "USDC")
        assert price is None

    def test_get_best_price(self):
        """Test getting best price for swap."""
        aggregator = PriceAggregator(min_sources=1)
        ts = int(time.time() * 1000)

        # Two pools with different prices
        aggregator.add_price(PriceUpdate(
            chain=ChainId.ETHEREUM,
            dex=DexId.UNISWAP_V3,
            pool="0x0001",
            token0="WETH",
            token1="USDC",
            reserve0=1000 * 10**18,
            reserve1=2_500_000 * 10**6,
            price=2500 * 10**18,  # Higher price
            timestamp_ms=ts,
        ))
        aggregator.add_price(PriceUpdate(
            chain=ChainId.ETHEREUM,
            dex=DexId.SUSHISWAP,
            pool="0x0002",
            token0="WETH",
            token1="USDC",
            reserve0=1000 * 10**18,
            reserve1=2_400_000 * 10**6,
            price=2400 * 10**18,  # Lower price
            timestamp_ms=ts,
        ))

        # For buy: want lowest price
        best_buy = aggregator.get_best_price(ChainId.ETHEREUM, "WETH", "USDC", is_buy=True)
        assert best_buy is not None
        assert best_buy.price == 2400 * 10**18

        # For sell: want highest price
        best_sell = aggregator.get_best_price(ChainId.ETHEREUM, "WETH", "USDC", is_buy=False)
        assert best_sell is not None
        assert best_sell.price == 2500 * 10**18

    def test_get_price_spread(self):
        """Test price spread calculation."""
        aggregator = PriceAggregator(min_sources=1)
        ts = int(time.time() * 1000)

        aggregator.add_price(PriceUpdate(
            chain=ChainId.ETHEREUM,
            dex=DexId.UNISWAP_V3,
            pool="0x0001",
            token0="WETH",
            token1="USDC",
            reserve0=1000 * 10**18,
            reserve1=2_500_000 * 10**6,
            price=2500 * 10**18,
            timestamp_ms=ts,
        ))
        aggregator.add_price(PriceUpdate(
            chain=ChainId.ETHEREUM,
            dex=DexId.SUSHISWAP,
            pool="0x0002",
            token0="WETH",
            token1="USDC",
            reserve0=1000 * 10**18,
            reserve1=2_400_000 * 10**6,
            price=2400 * 10**18,
            timestamp_ms=ts,
        ))

        spread = aggregator.get_price_spread(ChainId.ETHEREUM, "WETH", "USDC")
        assert spread is not None
        assert spread["min_price"] == 2400 * 10**18
        assert spread["max_price"] == 2500 * 10**18
        assert spread["spread_bps"] > 0

    def test_get_all_spreads(self):
        """Test getting all spreads above threshold."""
        aggregator = PriceAggregator(min_sources=1)
        ts = int(time.time() * 1000)

        # Add multiple pairs with spreads
        for i in range(2):
            aggregator.add_price(PriceUpdate(
                chain=ChainId.ETHEREUM,
                dex=DexId.UNISWAP_V3 if i == 0 else DexId.SUSHISWAP,
                pool=f"0x000{i}",
                token0="WETH",
                token1="USDC",
                reserve0=1000 * 10**18,
                reserve1=(2400 + i * 100) * 10**6 * 1000,
                price=(2400 + i * 100) * 10**18,
                timestamp_ms=ts,
            ))

        spreads = aggregator.get_all_spreads(ChainId.ETHEREUM, min_spread_bps=10)
        assert isinstance(spreads, list)

    def test_clear_stale_prices(self):
        """Test clearing stale prices."""
        aggregator = PriceAggregator(staleness_threshold_ms=1000)  # 1 second

        old_ts = int(time.time() * 1000) - 2000  # 2 seconds ago
        aggregator.add_price(PriceUpdate(
            chain=ChainId.ETHEREUM,
            dex=DexId.UNISWAP_V3,
            pool="0x0001",
            token0="WETH",
            token1="USDC",
            reserve0=1000 * 10**18,
            reserve1=2_500_000 * 10**6,
            price=2500 * 10**18,
            timestamp_ms=old_ts,
        ))

        current_ts = int(time.time() * 1000)
        removed = aggregator.clear_stale_prices(current_ts)
        assert removed >= 1

    def test_stats(self):
        """Test statistics tracking."""
        aggregator = PriceAggregator(min_sources=1)
        ts = int(time.time() * 1000)

        aggregator.add_price(PriceUpdate(
            chain=ChainId.ETHEREUM,
            dex=DexId.UNISWAP_V3,
            pool="0x0001",
            token0="WETH",
            token1="USDC",
            reserve0=1000 * 10**18,
            reserve1=2_500_000 * 10**6,
            price=2500 * 10**18,
            timestamp_ms=ts,
        ))

        stats = aggregator.get_stats()
        assert stats["total_prices"] == 1
        assert stats["unique_pairs"] == 1
        assert stats["known_pools"] == 1
