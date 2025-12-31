"""
RAMA-KANDRA - TVL Tracker

Tracks Total Value Locked across protocols and chains.
"""

from dataclasses import dataclass

from shared import AgentLogger, ChainId, DexId


@dataclass
class ProtocolTVL:
    """TVL for a single protocol."""
    protocol: str
    chain: ChainId
    tvl_usd: float
    tvl_change_24h: float  # Percentage
    timestamp_ms: int


@dataclass
class PoolTVL:
    """TVL for a single pool."""
    pool_address: str
    chain: ChainId
    dex: DexId
    token0: str
    token1: str
    tvl_usd: float
    volume_24h_usd: float
    fee_24h_usd: float
    timestamp_ms: int


class TVLTracker:
    """
    Tracks TVL across protocols and pools.

    Monitors changes to identify:
    - Growing protocols (opportunity)
    - Declining protocols (risk)
    - Liquidity migrations
    """

    def __init__(self):
        self.logger = AgentLogger("RAMA-KANDRA-TVL")

        # TVL storage
        self.protocol_tvl: dict[str, ProtocolTVL] = {}
        self.pool_tvl: dict[str, PoolTVL] = {}

        # Historical snapshots (hourly)
        self.tvl_history: list[dict[str, float]] = []
        self.max_history = 168  # 1 week hourly

        self.logger.info("TVL tracker initialized")

    def update_protocol_tvl(self, tvl: ProtocolTVL) -> None:
        """Update TVL for a protocol."""
        key = f"{tvl.protocol}_{tvl.chain.value}"
        old_tvl = self.protocol_tvl.get(key)

        self.protocol_tvl[key] = tvl

        # Log significant changes
        if old_tvl:
            change_pct = ((tvl.tvl_usd - old_tvl.tvl_usd) / old_tvl.tvl_usd) * 100
            if abs(change_pct) > 5:
                self.logger.info(
                    "Significant TVL change",
                    protocol=tvl.protocol,
                    chain=tvl.chain.value,
                    change_pct=round(change_pct, 2),
                )

    def update_pool_tvl(self, tvl: PoolTVL) -> None:
        """Update TVL for a pool."""
        key = f"{tvl.chain.value}_{tvl.pool_address}"
        self.pool_tvl[key] = tvl

    def get_protocol_tvl(self, protocol: str, chain: ChainId) -> ProtocolTVL | None:
        """Get TVL for a specific protocol."""
        key = f"{protocol}_{chain.value}"
        return self.protocol_tvl.get(key)

    def get_chain_tvl(self, chain: ChainId) -> float:
        """Get total TVL for a chain."""
        return sum(
            tvl.tvl_usd
            for key, tvl in self.protocol_tvl.items()
            if tvl.chain == chain
        )

    def get_dex_tvl(self, dex: DexId, chain: ChainId) -> float:
        """Get total TVL for a DEX on a chain."""
        return sum(
            tvl.tvl_usd
            for tvl in self.pool_tvl.values()
            if tvl.dex == dex and tvl.chain == chain
        )

    def get_top_pools(
        self,
        chain: ChainId,
        limit: int = 10,
    ) -> list[PoolTVL]:
        """Get top pools by TVL on a chain."""
        chain_pools = [
            tvl for tvl in self.pool_tvl.values()
            if tvl.chain == chain
        ]
        return sorted(chain_pools, key=lambda p: p.tvl_usd, reverse=True)[:limit]

    def get_growing_protocols(
        self,
        min_growth_pct: float = 5.0,
    ) -> list[ProtocolTVL]:
        """Get protocols with significant TVL growth."""
        return [
            tvl for tvl in self.protocol_tvl.values()
            if tvl.tvl_change_24h >= min_growth_pct
        ]

    def get_declining_protocols(
        self,
        max_decline_pct: float = -5.0,
    ) -> list[ProtocolTVL]:
        """Get protocols with significant TVL decline."""
        return [
            tvl for tvl in self.protocol_tvl.values()
            if tvl.tvl_change_24h <= max_decline_pct
        ]

    def snapshot_tvl(self) -> None:
        """Take a snapshot of current TVL for history."""
        import time

        snapshot = {
            "timestamp_ms": int(time.time() * 1000),
            "total_tvl": sum(tvl.tvl_usd for tvl in self.protocol_tvl.values()),
        }

        for chain in ChainId:
            snapshot[f"chain_{chain.value}"] = self.get_chain_tvl(chain)

        self.tvl_history.append(snapshot)

        # Trim history
        if len(self.tvl_history) > self.max_history:
            self.tvl_history = self.tvl_history[-self.max_history:]

    def get_stats(self) -> dict:
        """Get tracker statistics."""
        return {
            "protocols_tracked": len(self.protocol_tvl),
            "pools_tracked": len(self.pool_tvl),
            "total_tvl_usd": sum(tvl.tvl_usd for tvl in self.protocol_tvl.values()),
            "history_snapshots": len(self.tvl_history),
        }
