"""Tests for the Rama-Kandra TVL tracker."""

import time

import pytest

from rama_kandra.tvl import TVLTracker, ProtocolTVL, PoolTVL
from shared import ChainId, DexId


class TestTVLTracker:
    """Test suite for TVLTracker."""

    def test_initialization(self):
        """Test tracker initializes correctly."""
        tracker = TVLTracker()
        assert tracker is not None
        stats = tracker.get_stats()
        assert stats["protocols_tracked"] == 0
        assert stats["pools_tracked"] == 0

    def test_update_protocol_tvl(self):
        """Test updating TVL for a protocol."""
        tracker = TVLTracker()
        ts = int(time.time() * 1000)

        tvl = ProtocolTVL(
            protocol="uniswap-v3",
            chain=ChainId.ETHEREUM,
            tvl_usd=5_000_000_000,
            tvl_change_24h=2.5,
            timestamp_ms=ts,
        )
        tracker.update_protocol_tvl(tvl)

        stats = tracker.get_stats()
        assert stats["protocols_tracked"] == 1

    def test_get_protocol_tvl(self):
        """Test getting TVL for a protocol."""
        tracker = TVLTracker()
        ts = int(time.time() * 1000)

        tvl = ProtocolTVL(
            protocol="uniswap-v3",
            chain=ChainId.ETHEREUM,
            tvl_usd=5_000_000_000,
            tvl_change_24h=2.5,
            timestamp_ms=ts,
        )
        tracker.update_protocol_tvl(tvl)

        result = tracker.get_protocol_tvl("uniswap-v3", ChainId.ETHEREUM)
        assert result is not None
        assert isinstance(result, ProtocolTVL)
        assert result.tvl_usd == 5_000_000_000

    def test_get_protocol_tvl_not_found(self):
        """Test getting TVL for unknown protocol."""
        tracker = TVLTracker()

        result = tracker.get_protocol_tvl("unknown-protocol", ChainId.ETHEREUM)
        assert result is None

    def test_track_multiple_protocols(self):
        """Test tracking multiple protocols."""
        tracker = TVLTracker()
        ts = int(time.time() * 1000)

        protocols = [
            ("uniswap-v3", ChainId.ETHEREUM, 5_000_000_000),
            ("aave-v3", ChainId.ETHEREUM, 10_000_000_000),
            ("curve", ChainId.ETHEREUM, 3_000_000_000),
        ]

        for name, chain, tvl_usd in protocols:
            tvl = ProtocolTVL(
                protocol=name,
                chain=chain,
                tvl_usd=tvl_usd,
                tvl_change_24h=0.0,
                timestamp_ms=ts,
            )
            tracker.update_protocol_tvl(tvl)

        stats = tracker.get_stats()
        assert stats["protocols_tracked"] == 3

    def test_tvl_update(self):
        """Test updating TVL values."""
        tracker = TVLTracker()
        ts = int(time.time() * 1000)

        # Initial TVL
        tvl1 = ProtocolTVL(
            protocol="aave-v3",
            chain=ChainId.ETHEREUM,
            tvl_usd=10_000_000_000,
            tvl_change_24h=0.0,
            timestamp_ms=ts,
        )
        tracker.update_protocol_tvl(tvl1)

        # Updated TVL
        tvl2 = ProtocolTVL(
            protocol="aave-v3",
            chain=ChainId.ETHEREUM,
            tvl_usd=11_000_000_000,
            tvl_change_24h=10.0,
            timestamp_ms=ts + 1000,
        )
        tracker.update_protocol_tvl(tvl2)

        result = tracker.get_protocol_tvl("aave-v3", ChainId.ETHEREUM)
        assert result.tvl_usd == 11_000_000_000

    def test_cross_chain_tvl(self):
        """Test TVL tracking across chains."""
        tracker = TVLTracker()
        ts = int(time.time() * 1000)

        chains_tvl = [
            (ChainId.ETHEREUM, 10_000_000_000),
            (ChainId.ARBITRUM, 1_000_000_000),
            (ChainId.OPTIMISM, 500_000_000),
        ]

        for chain, tvl_usd in chains_tvl:
            tvl = ProtocolTVL(
                protocol="aave-v3",
                chain=chain,
                tvl_usd=tvl_usd,
                tvl_change_24h=0.0,
                timestamp_ms=ts,
            )
            tracker.update_protocol_tvl(tvl)

        eth_tvl = tracker.get_protocol_tvl("aave-v3", ChainId.ETHEREUM)
        arb_tvl = tracker.get_protocol_tvl("aave-v3", ChainId.ARBITRUM)
        op_tvl = tracker.get_protocol_tvl("aave-v3", ChainId.OPTIMISM)

        assert eth_tvl.tvl_usd == 10_000_000_000
        assert arb_tvl.tvl_usd == 1_000_000_000
        assert op_tvl.tvl_usd == 500_000_000

    def test_get_chain_tvl(self):
        """Test getting total TVL on a chain."""
        tracker = TVLTracker()
        ts = int(time.time() * 1000)

        protocols = [
            ("uniswap-v3", 5_000_000_000),
            ("aave-v3", 10_000_000_000),
            ("curve", 3_000_000_000),
        ]

        for name, tvl_usd in protocols:
            tvl = ProtocolTVL(
                protocol=name,
                chain=ChainId.ETHEREUM,
                tvl_usd=tvl_usd,
                tvl_change_24h=0.0,
                timestamp_ms=ts,
            )
            tracker.update_protocol_tvl(tvl)

        total = tracker.get_chain_tvl(ChainId.ETHEREUM)
        assert total == 18_000_000_000

    def test_update_pool_tvl(self):
        """Test updating pool TVL."""
        tracker = TVLTracker()
        ts = int(time.time() * 1000)

        pool = PoolTVL(
            pool_address="0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8",
            chain=ChainId.ETHEREUM,
            dex=DexId.UNISWAP_V3,
            token0="USDC",
            token1="WETH",
            tvl_usd=500_000_000,
            volume_24h_usd=100_000_000,
            fee_24h_usd=300_000,
            timestamp_ms=ts,
        )
        tracker.update_pool_tvl(pool)

        stats = tracker.get_stats()
        assert stats["pools_tracked"] == 1

    def test_get_top_pools(self):
        """Test getting top pools by TVL."""
        tracker = TVLTracker()
        ts = int(time.time() * 1000)

        pools = [
            ("0x0001", 100_000_000),
            ("0x0002", 500_000_000),
            ("0x0003", 250_000_000),
            ("0x0004", 1_000_000_000),
        ]

        for addr, tvl_usd in pools:
            pool = PoolTVL(
                pool_address=addr,
                chain=ChainId.ETHEREUM,
                dex=DexId.UNISWAP_V3,
                token0="USDC",
                token1="WETH",
                tvl_usd=tvl_usd,
                volume_24h_usd=0,
                fee_24h_usd=0,
                timestamp_ms=ts,
            )
            tracker.update_pool_tvl(pool)

        top = tracker.get_top_pools(ChainId.ETHEREUM, limit=3)

        assert len(top) == 3
        assert top[0].pool_address == "0x0004"  # Highest TVL
        assert top[1].pool_address == "0x0002"
        assert top[2].pool_address == "0x0003"

    def test_get_growing_protocols(self):
        """Test getting protocols with TVL growth."""
        tracker = TVLTracker()
        ts = int(time.time() * 1000)

        protocols = [
            ("growing", 10.0),
            ("stable", 0.5),
            ("declining", -8.0),
        ]

        for name, change in protocols:
            tvl = ProtocolTVL(
                protocol=name,
                chain=ChainId.ETHEREUM,
                tvl_usd=1_000_000_000,
                tvl_change_24h=change,
                timestamp_ms=ts,
            )
            tracker.update_protocol_tvl(tvl)

        growing = tracker.get_growing_protocols(min_growth_pct=5.0)
        assert len(growing) == 1
        assert growing[0].protocol == "growing"

    def test_get_declining_protocols(self):
        """Test getting protocols with TVL decline."""
        tracker = TVLTracker()
        ts = int(time.time() * 1000)

        protocols = [
            ("growing", 10.0),
            ("stable", 0.5),
            ("declining", -8.0),
        ]

        for name, change in protocols:
            tvl = ProtocolTVL(
                protocol=name,
                chain=ChainId.ETHEREUM,
                tvl_usd=1_000_000_000,
                tvl_change_24h=change,
                timestamp_ms=ts,
            )
            tracker.update_protocol_tvl(tvl)

        declining = tracker.get_declining_protocols(max_decline_pct=-5.0)
        assert len(declining) == 1
        assert declining[0].protocol == "declining"

    def test_stats(self):
        """Test statistics tracking."""
        tracker = TVLTracker()
        ts = int(time.time() * 1000)

        tracker.update_protocol_tvl(ProtocolTVL(
            protocol="protocol-1",
            chain=ChainId.ETHEREUM,
            tvl_usd=1_000_000_000,
            tvl_change_24h=0.0,
            timestamp_ms=ts,
        ))
        tracker.update_protocol_tvl(ProtocolTVL(
            protocol="protocol-2",
            chain=ChainId.ARBITRUM,
            tvl_usd=500_000_000,
            tvl_change_24h=0.0,
            timestamp_ms=ts,
        ))

        stats = tracker.get_stats()

        assert stats["protocols_tracked"] == 2
        assert "total_tvl_usd" in stats
        assert stats["total_tvl_usd"] == 1_500_000_000

    def test_protocol_tvl_dataclass(self):
        """Test ProtocolTVL dataclass."""
        ts = int(time.time() * 1000)

        tvl = ProtocolTVL(
            protocol="test-protocol",
            chain=ChainId.ETHEREUM,
            tvl_usd=1_000_000_000,
            tvl_change_24h=5.0,
            timestamp_ms=ts,
        )

        assert tvl.protocol == "test-protocol"
        assert tvl.chain == ChainId.ETHEREUM
        assert tvl.tvl_usd == 1_000_000_000
        assert tvl.tvl_change_24h == 5.0
        assert tvl.timestamp_ms == ts

    def test_snapshot_tvl(self):
        """Test TVL snapshot functionality."""
        tracker = TVLTracker()
        ts = int(time.time() * 1000)

        tracker.update_protocol_tvl(ProtocolTVL(
            protocol="test",
            chain=ChainId.ETHEREUM,
            tvl_usd=1_000_000_000,
            tvl_change_24h=0.0,
            timestamp_ms=ts,
        ))

        tracker.snapshot_tvl()

        stats = tracker.get_stats()
        assert stats["history_snapshots"] == 1
