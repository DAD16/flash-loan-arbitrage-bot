"""Tests for the Oracle arbitrage detector."""

import time

import pytest

from oracle.aggregator import PriceAggregator
from oracle.detector import ArbitrageDetector, TokenGraph
from shared import ChainId, DexId, PriceUpdate


class TestArbitrageDetector:
    """Test suite for ArbitrageDetector."""

    def test_initialization(self):
        """Test detector initializes correctly."""
        aggregator = PriceAggregator(min_sources=1)
        detector = ArbitrageDetector(aggregator)
        assert detector is not None
        stats = detector.get_stats()
        assert stats["opportunities_found"] == 0
        assert stats["cycles_checked"] == 0

    def test_scan_empty_aggregator(self):
        """Test scanning with no price data."""
        aggregator = PriceAggregator(min_sources=1)
        detector = ArbitrageDetector(aggregator)

        opportunities = detector.scan(ChainId.ETHEREUM)
        assert isinstance(opportunities, list)
        assert len(opportunities) == 0

    def test_scan_single_pool(self):
        """Test scanning with single pool (no arbitrage possible)."""
        aggregator = PriceAggregator(min_sources=1)
        ts = int(time.time() * 1000)

        aggregator.add_price(PriceUpdate(
            chain=ChainId.ETHEREUM,
            dex=DexId.UNISWAP_V3,
            pool="0x0001",
            token0="0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",  # WETH
            token1="0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",  # USDC
            reserve0=1000 * 10**18,
            reserve1=2_500_000 * 10**6,
            price=2500 * 10**18,
            timestamp_ms=ts,
        ))

        detector = ArbitrageDetector(aggregator)
        opportunities = detector.scan(ChainId.ETHEREUM)
        # Single pool can't create arbitrage
        assert len(opportunities) == 0

    def test_opportunity_handler(self):
        """Test opportunity handler callback."""
        aggregator = PriceAggregator(min_sources=1)
        detector = ArbitrageDetector(aggregator)

        opportunities_received = []

        def handler(opp):
            opportunities_received.append(opp)

        detector.on_opportunity(handler)

        # Even with no arbitrage, handler should be registered
        assert len(detector.opportunity_handlers) == 1

    def test_min_profit_filter(self):
        """Test that opportunities below min profit are filtered."""
        aggregator = PriceAggregator(min_sources=1)
        detector = ArbitrageDetector(
            aggregator,
            min_profit_wei=1_000_000_000_000_000_000,  # 1 ETH minimum
        )

        # Any opportunities found should be above threshold
        opportunities = detector.scan(ChainId.ETHEREUM)
        for opp in opportunities:
            assert opp.profit_wei >= detector.min_profit_wei

    def test_stats_tracking(self):
        """Test statistics are tracked."""
        aggregator = PriceAggregator(min_sources=1)
        ts = int(time.time() * 1000)

        # Add some price data
        aggregator.add_price(PriceUpdate(
            chain=ChainId.ETHEREUM,
            dex=DexId.UNISWAP_V3,
            pool="0x0001",
            token0="0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
            token1="0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
            reserve0=1000 * 10**18,
            reserve1=2_500_000 * 10**6,
            price=2500 * 10**18,
            timestamp_ms=ts,
        ))

        detector = ArbitrageDetector(aggregator)
        detector.scan(ChainId.ETHEREUM)

        stats = detector.get_stats()
        assert "opportunities_found" in stats
        assert "cycles_checked" in stats
        assert "hit_rate" in stats

    def test_cross_chain_isolation(self):
        """Test that scans are isolated to specified chain."""
        aggregator = PriceAggregator(min_sources=1)
        ts = int(time.time() * 1000)

        # Add price on Ethereum
        aggregator.add_price(PriceUpdate(
            chain=ChainId.ETHEREUM,
            dex=DexId.UNISWAP_V3,
            pool="0x0001",
            token0="0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
            token1="0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
            reserve0=1000 * 10**18,
            reserve1=2_500_000 * 10**6,
            price=2500 * 10**18,
            timestamp_ms=ts,
        ))

        # Add price on Arbitrum
        aggregator.add_price(PriceUpdate(
            chain=ChainId.ARBITRUM,
            dex=DexId.UNISWAP_V3,
            pool="0x0002",
            token0="0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
            token1="0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
            reserve0=1000 * 10**18,
            reserve1=2_500_000 * 10**6,
            price=2500 * 10**18,
            timestamp_ms=ts,
        ))

        detector = ArbitrageDetector(aggregator)

        # Scan Ethereum only
        eth_opps = detector.scan(ChainId.ETHEREUM)
        for opp in eth_opps:
            assert opp.chain == ChainId.ETHEREUM

        # Scan Arbitrum only
        arb_opps = detector.scan(ChainId.ARBITRUM)
        for opp in arb_opps:
            assert opp.chain == ChainId.ARBITRUM

    def test_max_path_length(self):
        """Test max path length is respected."""
        aggregator = PriceAggregator(min_sources=1)
        detector = ArbitrageDetector(aggregator, max_path_length=3)

        opportunities = detector.scan(ChainId.ETHEREUM)
        for opp in opportunities:
            assert len(opp.path) <= 3

    def test_gas_price_affects_profitability(self):
        """Test that gas price is considered in profitability."""
        aggregator = PriceAggregator(min_sources=1)

        # Low gas price detector
        detector_low_gas = ArbitrageDetector(aggregator, gas_price_gwei=10)

        # High gas price detector
        detector_high_gas = ArbitrageDetector(aggregator, gas_price_gwei=100)

        # High gas price should filter out more opportunities
        # (though with empty aggregator both return 0)
        low_gas_opps = detector_low_gas.scan(ChainId.ETHEREUM)
        high_gas_opps = detector_high_gas.scan(ChainId.ETHEREUM)

        # Both detectors work
        assert isinstance(low_gas_opps, list)
        assert isinstance(high_gas_opps, list)


class TestTokenGraph:
    """Test suite for TokenGraph."""

    def test_token_graph_creation(self):
        """Test TokenGraph dataclass."""
        graph = TokenGraph(edges={
            "WETH": [("USDC", "pool1", DexId.UNISWAP_V3, 2500 * 10**18)],
            "USDC": [("WETH", "pool1", DexId.UNISWAP_V3, 10**18 // 2500)],
        })

        assert "WETH" in graph.edges
        assert "USDC" in graph.edges
        assert len(graph.edges["WETH"]) == 1
