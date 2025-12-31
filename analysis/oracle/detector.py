"""
ORACLE - Arbitrage Detector

Detects arbitrage opportunities across DEXs.
"""

import time
from collections.abc import Callable
from dataclasses import dataclass

from shared import AgentLogger, ChainId, Opportunity, SwapStep

from .aggregator import PriceAggregator


@dataclass
class TokenGraph:
    """Graph of tokens and their swap paths."""
    edges: dict[str, list[tuple]]  # token -> [(other_token, pool, dex, price)]


class ArbitrageDetector:
    """
    Detects arbitrage opportunities using graph-based cycle detection.

    Finds profitable cycles: A -> B -> C -> A where the product of
    exchange rates exceeds 1.
    """

    def __init__(
        self,
        aggregator: PriceAggregator,
        min_profit_wei: int = 1_000_000_000_000_000,  # 0.001 ETH
        max_path_length: int = 4,
        gas_price_gwei: int = 30,
    ):
        self.logger = AgentLogger("ORACLE-DETECTOR")
        self.aggregator = aggregator
        self.min_profit_wei = min_profit_wei
        self.max_path_length = max_path_length
        self.gas_price_gwei = gas_price_gwei

        # Callback for detected opportunities
        self.opportunity_handlers: list[Callable[[Opportunity], None]] = []

        # Statistics
        self.opportunities_found = 0
        self.cycles_checked = 0

        self.logger.info(
            "Arbitrage detector initialized",
            min_profit_wei=min_profit_wei,
            max_path_length=max_path_length,
        )

    def on_opportunity(self, handler: Callable[[Opportunity], None]) -> None:
        """Register opportunity handler."""
        self.opportunity_handlers.append(handler)

    def scan(self, chain: ChainId) -> list[Opportunity]:
        """Scan for arbitrage opportunities on a chain."""
        start_time = time.time()
        opportunities = []

        # Build token graph from current prices
        graph = self._build_graph(chain)

        # Find cycles starting from major tokens (ETH, USDC, etc.)
        base_tokens = self._get_base_tokens(chain)

        for start_token in base_tokens:
            cycles = self._find_cycles(graph, start_token)
            self.cycles_checked += len(cycles)

            for cycle in cycles:
                opportunity = self._evaluate_cycle(chain, cycle)
                if opportunity and opportunity.profit_wei >= self.min_profit_wei:
                    opportunities.append(opportunity)
                    self.opportunities_found += 1

                    # Notify handlers
                    for handler in self.opportunity_handlers:
                        try:
                            handler(opportunity)
                        except Exception as e:
                            self.logger.error("Handler error", error=str(e))

        scan_time_ms = (time.time() - start_time) * 1000
        self.logger.debug(
            "Scan completed",
            chain=chain.value,
            cycles_checked=len(cycles) if 'cycles' in dir() else 0,
            opportunities_found=len(opportunities),
            scan_time_ms=round(scan_time_ms, 2),
        )

        return opportunities

    def _build_graph(self, chain: ChainId) -> TokenGraph:
        """Build token graph from aggregator prices."""
        edges: dict[str, list[tuple]] = {}

        for key, prices in self.aggregator.prices.items():
            if key[0] != chain:
                continue

            _, token0, token1 = key

            for price_update in prices:
                # Add edge token0 -> token1
                if token0 not in edges:
                    edges[token0] = []
                edges[token0].append((
                    token1,
                    price_update.pool,
                    price_update.dex,
                    price_update.price,
                    price_update.reserve0,
                    price_update.reserve1,
                ))

                # Add reverse edge token1 -> token0
                if token1 not in edges:
                    edges[token1] = []
                reverse_price = (10**36) // price_update.price if price_update.price > 0 else 0
                edges[token1].append((
                    token0,
                    price_update.pool,
                    price_update.dex,
                    reverse_price,
                    price_update.reserve1,
                    price_update.reserve0,
                ))

        return TokenGraph(edges=edges)

    def _get_base_tokens(self, chain: ChainId) -> list[str]:
        """Get base tokens to start cycle search from."""
        # These should be loaded from config, using placeholders
        base_tokens = {
            ChainId.ETHEREUM: [
                "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",  # WETH
                "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",  # USDC
                "0xdAC17F958D2ee523a2206206994597C13D831ec7",  # USDT
            ],
            ChainId.ARBITRUM: [
                "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",  # WETH
                "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",  # USDC
            ],
            ChainId.OPTIMISM: [
                "0x4200000000000000000000000000000000000006",  # WETH
                "0x7F5c764cBc14f9669B88837ca1490cCa17c31607",  # USDC
            ],
            ChainId.BASE: [
                "0x4200000000000000000000000000000000000006",  # WETH
                "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",  # USDC
            ],
            ChainId.BSC: [
                "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",  # WBNB
                "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",  # USDC
            ],
        }
        return base_tokens.get(chain, [])

    def _find_cycles(
        self,
        graph: TokenGraph,
        start_token: str,
    ) -> list[list[tuple]]:
        """Find all cycles starting and ending at start_token."""
        cycles = []

        def dfs(
            current: str,
            path: list[tuple],
            visited_pools: set[str],
        ):
            if len(path) > self.max_path_length:
                return

            for edge in graph.edges.get(current, []):
                next_token, pool, dex, price, reserve0, reserve1 = edge

                # Skip if pool already used
                if pool in visited_pools:
                    continue

                new_path = path + [(current, next_token, pool, dex, price, reserve0, reserve1)]

                # Found cycle back to start
                if next_token == start_token and len(new_path) >= 2:
                    cycles.append(new_path)
                    continue

                # Continue search
                dfs(next_token, new_path, visited_pools | {pool})

        dfs(start_token, [], set())
        return cycles

    def _evaluate_cycle(
        self,
        chain: ChainId,
        cycle: list[tuple],
    ) -> Opportunity | None:
        """Evaluate if a cycle is profitable."""
        if not cycle:
            return None

        # Calculate product of exchange rates
        # For a profitable cycle: product > 1
        rate_product = 10**18  # Start with 1 (18 decimals)

        path = []
        min_liquidity = float('inf')

        for step in cycle:
            token_in, token_out, pool, dex, price, reserve0, reserve1 = step

            # Multiply by exchange rate
            rate_product = (rate_product * price) // (10**18)

            # Track minimum liquidity for sizing
            liquidity = (reserve0 * reserve1) ** 0.5
            min_liquidity = min(min_liquidity, liquidity)

            path.append(SwapStep(
                dex=dex,
                pool=pool,
                token_in=token_in,
                token_out=token_out,
                amount_in=0,  # Will be calculated
                amount_out=0,
            ))

        # Check if profitable (rate_product > 1.0 in 18 decimals)
        if rate_product <= 10**18:
            return None

        # Calculate profit percentage
        profit_bps = ((rate_product - 10**18) * 10000) // 10**18

        # Estimate gas cost
        gas_per_swap = 150000
        total_gas = gas_per_swap * len(cycle)
        gas_cost_wei = total_gas * self.gas_price_gwei * 10**9

        # Calculate optimal trade size (simplified)
        # In practice, would use calculus to optimize
        optimal_size = int(min_liquidity * 0.01)  # 1% of min liquidity
        gross_profit = (optimal_size * (rate_product - 10**18)) // 10**18
        net_profit = gross_profit - gas_cost_wei

        if net_profit < self.min_profit_wei:
            return None

        # Update path with amounts
        current_amount = optimal_size
        for step in path:
            step.amount_in = current_amount
            # Simplified output calculation
            step.amount_out = (current_amount * rate_product) // 10**18
            current_amount = step.amount_out

        return Opportunity(
            id=int(time.time() * 1000),
            timestamp_ms=int(time.time() * 1000),
            chain=chain,
            profit_wei=net_profit,
            gas_estimate=total_gas,
            path=path,
            flash_loan_token=cycle[0][0],
            flash_loan_amount=optimal_size,
            confidence=min(1.0, profit_bps / 100),  # Higher profit = higher confidence
        )

    def get_stats(self) -> dict:
        """Get detector statistics."""
        return {
            "opportunities_found": self.opportunities_found,
            "cycles_checked": self.cycles_checked,
            "hit_rate": self.opportunities_found / max(1, self.cycles_checked),
        }
