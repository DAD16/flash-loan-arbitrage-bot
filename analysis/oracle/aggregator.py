"""
ORACLE - Price Aggregator

Aggregates prices from multiple DEXs and data sources.
"""

import asyncio
from collections import defaultdict
from dataclasses import dataclass
from typing import Dict, List, Optional, Set

from shared import AgentLogger, ChainId, DexId, PriceUpdate


@dataclass
class AggregatedPrice:
    """Aggregated price from multiple sources."""
    chain: ChainId
    token0: str
    token1: str
    price: int  # Weighted average price (18 decimals)
    confidence: float  # 0-1 based on source count and agreement
    sources: List[PriceUpdate]
    timestamp_ms: int


class PriceAggregator:
    """
    Aggregates prices from multiple DEXs for accurate pricing.

    Uses volume-weighted averaging and detects price anomalies.
    """

    def __init__(
        self,
        staleness_threshold_ms: int = 5000,
        min_sources: int = 2,
    ):
        self.logger = AgentLogger("ORACLE-AGGREGATOR")
        self.staleness_threshold_ms = staleness_threshold_ms
        self.min_sources = min_sources

        # Price storage: (chain, token0, token1) -> list of updates
        self.prices: Dict[tuple, List[PriceUpdate]] = defaultdict(list)

        # Known pools for fast lookup
        self.known_pools: Set[str] = set()

        self.logger.info("Price aggregator initialized")

    def add_price(self, update: PriceUpdate) -> None:
        """Add a price update."""
        key = (update.chain, update.token0, update.token1)

        # Remove stale prices
        current_time = update.timestamp_ms
        self.prices[key] = [
            p for p in self.prices[key]
            if current_time - p.timestamp_ms < self.staleness_threshold_ms
        ]

        # Add new price
        self.prices[key].append(update)
        self.known_pools.add(update.pool)

    def get_aggregated_price(
        self,
        chain: ChainId,
        token0: str,
        token1: str,
    ) -> Optional[AggregatedPrice]:
        """Get aggregated price for a token pair."""
        key = (chain, token0, token1)
        sources = self.prices.get(key, [])

        if len(sources) < self.min_sources:
            return None

        # Calculate volume-weighted average
        total_liquidity = sum(
            (p.reserve0 * p.reserve1) ** 0.5 for p in sources
        )

        if total_liquidity == 0:
            return None

        weighted_price = sum(
            p.price * ((p.reserve0 * p.reserve1) ** 0.5) / total_liquidity
            for p in sources
        )

        # Calculate confidence based on source agreement
        prices = [p.price for p in sources]
        mean_price = sum(prices) / len(prices)
        variance = sum((p - mean_price) ** 2 for p in prices) / len(prices)
        std_dev = variance ** 0.5

        # Lower variance = higher confidence
        coefficient_of_variation = std_dev / mean_price if mean_price > 0 else 1
        confidence = max(0, 1 - coefficient_of_variation)

        return AggregatedPrice(
            chain=chain,
            token0=token0,
            token1=token1,
            price=int(weighted_price),
            confidence=confidence,
            sources=sources,
            timestamp_ms=max(p.timestamp_ms for p in sources),
        )

    def get_best_price(
        self,
        chain: ChainId,
        token_in: str,
        token_out: str,
        is_buy: bool,
    ) -> Optional[PriceUpdate]:
        """Get best price for a swap direction."""
        key = (chain, token_in, token_out)
        sources = self.prices.get(key, [])

        if not sources:
            # Try reverse pair
            key = (chain, token_out, token_in)
            sources = self.prices.get(key, [])

        if not sources:
            return None

        # For buy: want lowest price (best rate for buyer)
        # For sell: want highest price (best rate for seller)
        if is_buy:
            return min(sources, key=lambda p: p.price)
        else:
            return max(sources, key=lambda p: p.price)

    def get_price_spread(
        self,
        chain: ChainId,
        token0: str,
        token1: str,
    ) -> Optional[Dict]:
        """Get price spread across DEXs."""
        key = (chain, token0, token1)
        sources = self.prices.get(key, [])

        if len(sources) < 2:
            return None

        prices = [p.price for p in sources]
        min_price = min(prices)
        max_price = max(prices)

        spread_bps = ((max_price - min_price) * 10000) // min_price if min_price > 0 else 0

        return {
            "chain": chain,
            "token0": token0,
            "token1": token1,
            "min_price": min_price,
            "max_price": max_price,
            "spread_bps": int(spread_bps),
            "sources": len(sources),
        }

    def get_all_spreads(
        self,
        chain: ChainId,
        min_spread_bps: int = 10,
    ) -> List[Dict]:
        """Get all pairs with significant spreads."""
        spreads = []

        for key, sources in self.prices.items():
            if key[0] != chain or len(sources) < 2:
                continue

            spread = self.get_price_spread(chain, key[1], key[2])
            if spread and spread["spread_bps"] >= min_spread_bps:
                spreads.append(spread)

        return sorted(spreads, key=lambda s: s["spread_bps"], reverse=True)

    def clear_stale_prices(self, current_time_ms: int) -> int:
        """Remove stale prices. Returns count removed."""
        removed = 0

        for key in list(self.prices.keys()):
            before = len(self.prices[key])
            self.prices[key] = [
                p for p in self.prices[key]
                if current_time_ms - p.timestamp_ms < self.staleness_threshold_ms
            ]
            removed += before - len(self.prices[key])

            if not self.prices[key]:
                del self.prices[key]

        return removed

    def get_stats(self) -> Dict:
        """Get aggregator statistics."""
        total_prices = sum(len(v) for v in self.prices.values())
        unique_pairs = len(self.prices)

        return {
            "total_prices": total_prices,
            "unique_pairs": unique_pairs,
            "known_pools": len(self.known_pools),
        }
