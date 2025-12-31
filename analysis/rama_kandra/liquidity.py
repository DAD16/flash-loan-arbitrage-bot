"""
RAMA-KANDRA - Liquidity Analyzer

Analyzes liquidity depth and health across pools.
"""

from dataclasses import dataclass

from shared import AgentLogger, ChainId, DexId


@dataclass
class LiquidityDepth:
    """Liquidity depth at price levels."""
    pool_address: str
    chain: ChainId
    dex: DexId
    bid_depth_usd: dict[float, float]  # price_pct -> liquidity
    ask_depth_usd: dict[float, float]
    timestamp_ms: int


@dataclass
class LiquidityHealth:
    """Health assessment of pool liquidity."""
    pool_address: str
    chain: ChainId
    health_score: float  # 0-1
    issues: list[str]
    recommendations: list[str]


class LiquidityAnalyzer:
    """
    Analyzes liquidity depth and health.

    Identifies:
    - Deep vs shallow liquidity
    - Imbalanced pools
    - Liquidity concentration risks
    """

    def __init__(
        self,
        min_depth_usd: float = 10000,
        max_imbalance_ratio: float = 3.0,
    ):
        self.logger = AgentLogger("RAMA-KANDRA-LIQUIDITY")
        self.min_depth_usd = min_depth_usd
        self.max_imbalance_ratio = max_imbalance_ratio

        # Liquidity data
        self.depths: dict[str, LiquidityDepth] = {}

        self.logger.info(
            "Liquidity analyzer initialized",
            min_depth_usd=min_depth_usd,
        )

    def update_depth(self, depth: LiquidityDepth) -> None:
        """Update liquidity depth for a pool."""
        key = f"{depth.chain.value}_{depth.pool_address}"
        self.depths[key] = depth

    def analyze_pool_health(
        self,
        pool_address: str,
        chain: ChainId,
        reserve0: int,
        reserve1: int,
        token0_price_usd: float,
        token1_price_usd: float,
    ) -> LiquidityHealth:
        """Analyze health of a pool's liquidity."""
        issues = []
        recommendations = []

        # Calculate TVL
        tvl0 = (reserve0 / 1e18) * token0_price_usd
        tvl1 = (reserve1 / 1e18) * token1_price_usd
        total_tvl = tvl0 + tvl1

        # Check minimum depth
        if total_tvl < self.min_depth_usd:
            issues.append(f"Low TVL: ${total_tvl:.2f}")
            recommendations.append("Consider using pools with higher liquidity")

        # Check balance
        if tvl0 > 0 and tvl1 > 0:
            imbalance_ratio = max(tvl0 / tvl1, tvl1 / tvl0)
            if imbalance_ratio > self.max_imbalance_ratio:
                issues.append(f"Imbalanced: {imbalance_ratio:.1f}x ratio")
                recommendations.append("Pool may have high slippage")

        # Calculate health score
        score = 1.0

        # Penalize low TVL
        if total_tvl < self.min_depth_usd:
            score *= 0.5
        elif total_tvl < self.min_depth_usd * 10:
            score *= 0.8

        # Penalize imbalance
        if tvl0 > 0 and tvl1 > 0:
            imbalance = max(tvl0 / tvl1, tvl1 / tvl0)
            if imbalance > 2:
                score *= 0.7
            elif imbalance > 1.5:
                score *= 0.9

        return LiquidityHealth(
            pool_address=pool_address,
            chain=chain,
            health_score=score,
            issues=issues,
            recommendations=recommendations,
        )

    def estimate_slippage(
        self,
        pool_address: str,
        chain: ChainId,
        trade_size_usd: float,
        is_buy: bool,
    ) -> float | None:
        """Estimate slippage for a trade size."""
        key = f"{chain.value}_{pool_address}"
        depth = self.depths.get(key)

        if not depth:
            return None

        # Use depth data to estimate slippage
        depth_data = depth.ask_depth_usd if is_buy else depth.bid_depth_usd

        if not depth_data:
            return None

        # Simple linear interpolation
        cumulative = 0.0
        for price_pct, liquidity in sorted(depth_data.items()):
            cumulative += liquidity
            if cumulative >= trade_size_usd:
                return price_pct

        # Trade too large for available liquidity
        return max(depth_data.keys()) * 1.5 if depth_data else None

    def get_best_pools_for_trade(
        self,
        chain: ChainId,
        trade_size_usd: float,
        max_slippage_bps: int = 50,
    ) -> list[str]:
        """Get pools suitable for a trade size."""
        suitable = []

        for key, depth in self.depths.items():
            if not key.startswith(chain.value):
                continue

            slippage = self.estimate_slippage(
                depth.pool_address,
                chain,
                trade_size_usd,
                is_buy=True,
            )

            if slippage is not None and slippage * 100 <= max_slippage_bps:
                suitable.append(depth.pool_address)

        return suitable

    def get_stats(self) -> dict:
        """Get analyzer statistics."""
        return {
            "pools_tracked": len(self.depths),
            "chains": list({key.split("_")[0] for key in self.depths}),
        }
