"""
ORACLE - MMBF Arbitrage Detector

Modified Moore-Bellman-Ford algorithm with Line Graph transformation
for detecting ALL profitable arbitrage cycles.

Based on research: https://arxiv.org/html/2406.16573v1

Performance vs DFS:
- Standard DFS: ~19 paths >$1,000 profit
- MMBF: ~23,868 paths >$1,000 profit (1000x more opportunities)
- Supports paths from 3-11 hops (vs 3-4 with DFS)
- Can specify starting token
"""

import math
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Callable, Optional

from shared import AgentLogger, ChainId, Opportunity, SwapStep

from .aggregator import PriceAggregator


# ============================================================================
# DATA STRUCTURES
# ============================================================================

@dataclass
class Edge:
    """Edge in the token graph (represents a trading pair on a DEX)."""
    token_in: str
    token_out: str
    pool: str
    dex: str
    rate: float  # Exchange rate (how much token_out per token_in)
    reserve_in: int
    reserve_out: int
    fee_bps: int = 30  # Default 0.3% fee

    @property
    def log_rate(self) -> float:
        """Negative log of rate for Bellman-Ford (find negative cycles)."""
        if self.rate <= 0:
            return float('inf')
        return -math.log(self.rate)


@dataclass
class LineVertex:
    """Vertex in the line graph (represents an edge in the original graph)."""
    id: str  # Unique identifier
    edge: Edge

    def __hash__(self):
        return hash(self.id)

    def __eq__(self, other):
        return self.id == other.id


@dataclass
class LineEdge:
    """Edge in the line graph (connects two edges that share a token)."""
    from_vertex: str  # LineVertex id
    to_vertex: str    # LineVertex id
    weight: float     # -log(rate) of the destination edge


@dataclass
class ArbitragePath:
    """A detected arbitrage path with profit calculation."""
    edges: list[Edge]
    profit_ratio: float  # > 1.0 means profitable
    profit_bps: int      # Basis points profit
    start_token: str
    estimated_profit_usd: float = 0.0
    optimal_size_wei: int = 0
    gas_estimate: int = 0
    net_profit_wei: int = 0
    confidence: float = 0.0


# ============================================================================
# MMBF DETECTOR
# ============================================================================

class MMBFDetector:
    """
    Modified Moore-Bellman-Ford detector for arbitrage opportunities.

    Key innovations over standard Bellman-Ford:
    1. Line Graph transformation - edges become vertices
    2. Source node connected to all edges from starting token
    3. Path tracking with cycle detection
    4. Supports arbitrary starting token
    5. Finds ALL profitable cycles, not just one
    """

    def __init__(
        self,
        aggregator: Optional[PriceAggregator] = None,
        min_profit_bps: int = 10,           # Minimum 0.1% profit
        max_path_length: int = 8,            # Up to 8 hops (vs 4 in DFS)
        max_iterations: int = 100,           # MMBF iterations
        gas_price_gwei: int = 30,
        min_liquidity_usd: float = 50000,   # $50k minimum liquidity
    ):
        self.logger = AgentLogger("ORACLE-MMBF")
        self.aggregator = aggregator
        self.min_profit_bps = min_profit_bps
        self.max_path_length = max_path_length
        self.max_iterations = max_iterations
        self.gas_price_gwei = gas_price_gwei
        self.min_liquidity_usd = min_liquidity_usd

        # Token price estimates for liquidity calculation
        self.token_prices_usd = {
            # BSC
            "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c": 600,   # WBNB
            "0x55d398326f99059fF775485246999027B3197955": 1,     # USDT
            "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56": 1,     # BUSD
            "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d": 1,     # USDC
            "0x2170Ed0880ac9A755fd29B2688956BD959F933F8": 3400,  # ETH
            "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c": 95000, # BTCB
            # Ethereum
            "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2": 3400,  # WETH
            "0xdAC17F958D2ee523a2206206994597C13D831ec7": 1,     # USDT
            "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": 1,     # USDC
            "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599": 95000, # WBTC
        }

        # Callbacks
        self.opportunity_handlers: list[Callable[[Opportunity], None]] = []

        # Statistics
        self.stats = {
            "scans": 0,
            "paths_found": 0,
            "profitable_paths": 0,
            "total_scan_time_ms": 0,
            "avg_scan_time_ms": 0,
        }

        self.logger.info(
            "MMBF Detector initialized",
            max_path_length=max_path_length,
            min_profit_bps=min_profit_bps,
        )

    def on_opportunity(self, handler: Callable[[Opportunity], None]) -> None:
        """Register opportunity handler."""
        self.opportunity_handlers.append(handler)

    # ========================================================================
    # MAIN SCANNING
    # ========================================================================

    def scan(
        self,
        chain: ChainId,
        edges: Optional[list[Edge]] = None,
    ) -> list[ArbitragePath]:
        """
        Scan for arbitrage opportunities using MMBF algorithm.

        Args:
            chain: Blockchain to scan
            edges: Optional pre-built edges (if None, builds from aggregator)

        Returns:
            List of profitable arbitrage paths
        """
        start_time = time.time()
        self.stats["scans"] += 1

        # Build edges from aggregator if not provided
        if edges is None:
            edges = self._build_edges_from_aggregator(chain)

        if not edges:
            self.logger.debug("No edges to scan")
            return []

        # Get starting tokens
        start_tokens = self._get_start_tokens(chain, edges)

        all_paths: list[ArbitragePath] = []

        for start_token in start_tokens:
            # Build line graph for this starting token
            line_graph = self._build_line_graph(edges, start_token)

            if not line_graph["vertices"]:
                continue

            # Run MMBF to find negative cycles
            paths = self._run_mmbf(line_graph, start_token, edges)

            # Filter by minimum profit and liquidity
            for path in paths:
                if path.profit_bps >= self.min_profit_bps:
                    # Check liquidity
                    if self._check_liquidity(path):
                        # Calculate optimal size and net profit
                        self._calculate_optimal_trade(path)

                        if path.net_profit_wei > 0:
                            all_paths.append(path)
                            self.stats["profitable_paths"] += 1

        # Sort by profit
        all_paths.sort(key=lambda p: p.net_profit_wei, reverse=True)

        # Update stats
        scan_time_ms = (time.time() - start_time) * 1000
        self.stats["paths_found"] += len(all_paths)
        self.stats["total_scan_time_ms"] += scan_time_ms
        self.stats["avg_scan_time_ms"] = (
            self.stats["total_scan_time_ms"] / self.stats["scans"]
        )

        self.logger.info(
            "MMBF scan complete",
            chain=chain.value if hasattr(chain, 'value') else str(chain),
            edges=len(edges),
            start_tokens=len(start_tokens),
            paths_found=len(all_paths),
            scan_time_ms=round(scan_time_ms, 2),
        )

        # Notify handlers
        for path in all_paths:
            opportunity = self._path_to_opportunity(chain, path)
            for handler in self.opportunity_handlers:
                try:
                    handler(opportunity)
                except Exception as e:
                    self.logger.error("Handler error", error=str(e))

        return all_paths

    # ========================================================================
    # LINE GRAPH CONSTRUCTION
    # ========================================================================

    def _build_line_graph(
        self,
        edges: list[Edge],
        start_token: str,
    ) -> dict:
        """
        Build line graph from token graph.

        In the line graph:
        - Each edge (trading pair) becomes a vertex
        - Vertices are connected if the out-token of one matches the in-token of another
        - A source node connects to all edges starting from start_token

        This transformation enables finding cycles that START from a specific token.
        """
        # Create line vertices (one per edge)
        vertices: dict[str, LineVertex] = {}
        for i, edge in enumerate(edges):
            vid = f"{edge.pool}:{edge.token_in}:{edge.token_out}"
            vertices[vid] = LineVertex(id=vid, edge=edge)

        # Create line edges (connect edges that share a token)
        line_edges: list[LineEdge] = []

        # Group edges by their input token
        edges_by_in_token: dict[str, list[LineVertex]] = defaultdict(list)
        for v in vertices.values():
            edges_by_in_token[v.edge.token_in].append(v)

        # Connect: if edge A ends at token X, connect to all edges starting at X
        for v1 in vertices.values():
            out_token = v1.edge.token_out
            for v2 in edges_by_in_token.get(out_token, []):
                # Don't connect to same pool (no consecutive swaps in same pool)
                if v1.edge.pool == v2.edge.pool:
                    continue

                line_edges.append(LineEdge(
                    from_vertex=v1.id,
                    to_vertex=v2.id,
                    weight=v2.edge.log_rate,
                ))

        # Add source node connected to edges from start_token
        source_edges: list[LineEdge] = []
        for v in edges_by_in_token.get(start_token, []):
            source_edges.append(LineEdge(
                from_vertex="__SOURCE__",
                to_vertex=v.id,
                weight=v.edge.log_rate,
            ))

        return {
            "vertices": vertices,
            "edges": line_edges,
            "source_edges": source_edges,
            "start_token": start_token,
        }

    # ========================================================================
    # MMBF ALGORITHM
    # ========================================================================

    def _run_mmbf(
        self,
        line_graph: dict,
        start_token: str,
        original_edges: list[Edge],
    ) -> list[ArbitragePath]:
        """
        Run Modified Moore-Bellman-Ford on the line graph.

        The algorithm finds negative cycles (arbitrage opportunities) by:
        1. Initializing distances from source
        2. Relaxing edges iteratively
        3. Tracking paths to detect cycles back to start_token
        4. Extracting profitable cycles
        """
        vertices = line_graph["vertices"]
        edges = line_graph["edges"]
        source_edges = line_graph["source_edges"]

        if not vertices:
            return []

        # Distance from source (negative log of cumulative rate)
        distance: dict[str, float] = {"__SOURCE__": 0.0}
        for vid in vertices:
            distance[vid] = float('inf')

        # Path tracking: maps vertex to the path of edges taken to reach it
        paths: dict[str, list[str]] = {"__SOURCE__": []}
        for vid in vertices:
            paths[vid] = []

        # Initialize from source
        for se in source_edges:
            if se.weight < distance[se.to_vertex]:
                distance[se.to_vertex] = se.weight
                paths[se.to_vertex] = [se.to_vertex]

        # Bellman-Ford iterations
        profitable_paths: list[ArbitragePath] = []

        for iteration in range(min(self.max_iterations, self.max_path_length)):
            updated = False

            for edge in edges:
                if distance[edge.from_vertex] == float('inf'):
                    continue

                new_dist = distance[edge.from_vertex] + edge.weight

                # Check if this creates a cycle back to start
                to_vertex = vertices[edge.to_vertex]

                if to_vertex.edge.token_out == start_token:
                    # Found a cycle! Check if profitable
                    cycle_edges = self._extract_cycle_edges(
                        paths[edge.from_vertex] + [edge.to_vertex],
                        vertices,
                    )

                    if cycle_edges and len(cycle_edges) >= 2:
                        # Calculate profit ratio
                        profit_ratio = self._calculate_profit_ratio(cycle_edges)

                        if profit_ratio > 1.0:
                            profit_bps = int((profit_ratio - 1.0) * 10000)
                            path = ArbitragePath(
                                edges=cycle_edges,
                                profit_ratio=profit_ratio,
                                profit_bps=profit_bps,
                                start_token=start_token,
                            )
                            profitable_paths.append(path)

                # Standard relaxation (only if improves and doesn't create self-loop)
                if new_dist < distance[edge.to_vertex]:
                    current_path = paths[edge.from_vertex]

                    # Prevent revisiting same vertex (avoid infinite loops)
                    if edge.to_vertex not in current_path:
                        if len(current_path) < self.max_path_length:
                            distance[edge.to_vertex] = new_dist
                            paths[edge.to_vertex] = current_path + [edge.to_vertex]
                            updated = True

            if not updated:
                break

        return profitable_paths

    def _extract_cycle_edges(
        self,
        vertex_ids: list[str],
        vertices: dict[str, LineVertex],
    ) -> list[Edge]:
        """Extract original edges from line vertex path."""
        edges = []
        for vid in vertex_ids:
            if vid in vertices:
                edges.append(vertices[vid].edge)
        return edges

    def _calculate_profit_ratio(self, edges: list[Edge]) -> float:
        """Calculate cumulative exchange rate for a path."""
        if not edges:
            return 0.0

        ratio = 1.0
        for edge in edges:
            ratio *= edge.rate
        return ratio

    # ========================================================================
    # LIQUIDITY & TRADE SIZING
    # ========================================================================

    def _check_liquidity(self, path: ArbitragePath) -> bool:
        """Check if all pools in path have sufficient liquidity."""
        for edge in path.edges:
            liquidity_usd = self._estimate_liquidity_usd(edge)
            if liquidity_usd < self.min_liquidity_usd:
                return False
        return True

    def _estimate_liquidity_usd(self, edge: Edge) -> float:
        """Estimate USD value of liquidity in a pool."""
        price_in = self.token_prices_usd.get(edge.token_in.lower(), 0)
        price_out = self.token_prices_usd.get(edge.token_out.lower(), 0)

        # Also check without lowercasing (addresses are case-sensitive sometimes)
        if price_in == 0:
            price_in = self.token_prices_usd.get(edge.token_in, 0)
        if price_out == 0:
            price_out = self.token_prices_usd.get(edge.token_out, 0)

        value_in = (edge.reserve_in / 1e18) * price_in
        value_out = (edge.reserve_out / 1e18) * price_out

        return value_in + value_out

    def _calculate_optimal_trade(self, path: ArbitragePath) -> None:
        """
        Calculate optimal trade size using bisection method.

        The profit function is concave: small trades have high percentage profit
        but low absolute profit; large trades have more slippage.
        The optimal size maximizes absolute profit.
        """
        # Find minimum liquidity in path
        min_reserve = float('inf')
        for edge in path.edges:
            min_reserve = min(min_reserve, edge.reserve_in, edge.reserve_out)

        if min_reserve == float('inf') or min_reserve == 0:
            path.optimal_size_wei = 0
            path.net_profit_wei = 0
            return

        # Bisection to find optimal size
        # Start with range: 0.01% to 10% of minimum reserve
        low = int(min_reserve * 0.0001)
        high = int(min_reserve * 0.1)

        best_profit = 0
        best_size = low

        # Binary search for optimal
        iterations = 20
        for _ in range(iterations):
            if high <= low:
                break

            mid = (low + high) // 2
            profit_mid = self._simulate_trade(path.edges, mid)
            profit_mid_plus = self._simulate_trade(path.edges, mid + 1)

            if profit_mid_plus > profit_mid:
                low = mid + 1
                if profit_mid_plus > best_profit:
                    best_profit = profit_mid_plus
                    best_size = mid + 1
            else:
                high = mid
                if profit_mid > best_profit:
                    best_profit = profit_mid
                    best_size = mid

        # Calculate gas cost
        gas_per_hop = 150000
        total_gas = gas_per_hop * len(path.edges) + 21000  # Base + per-hop
        gas_cost_wei = total_gas * self.gas_price_gwei * 10**9

        path.optimal_size_wei = best_size
        path.gas_estimate = total_gas
        path.net_profit_wei = max(0, best_profit - gas_cost_wei)

        # Estimate USD profit
        start_token_price = self.token_prices_usd.get(path.start_token, 1)
        path.estimated_profit_usd = (path.net_profit_wei / 1e18) * start_token_price

        # Confidence based on profit margin and liquidity
        if path.net_profit_wei > 0 and best_profit > 0:
            margin = path.net_profit_wei / best_profit
            path.confidence = min(0.9, margin * path.profit_bps / 100)
        else:
            path.confidence = 0.0

    def _simulate_trade(self, edges: list[Edge], amount_in: int) -> int:
        """
        Simulate a multi-hop trade with slippage.

        Uses constant product AMM formula: x * y = k
        Output for each hop: amount_out = (reserve_out * amount_in) / (reserve_in + amount_in)
        """
        current_amount = amount_in

        for edge in edges:
            if current_amount <= 0 or edge.reserve_in <= 0:
                return 0

            # Apply fee (0.3% = 997/1000)
            fee_multiplier = (10000 - edge.fee_bps) / 10000
            amount_with_fee = int(current_amount * fee_multiplier)

            # Constant product formula
            numerator = edge.reserve_out * amount_with_fee
            denominator = edge.reserve_in + amount_with_fee

            if denominator <= 0:
                return 0

            current_amount = numerator // denominator

        # Profit = output - input
        return current_amount - amount_in

    # ========================================================================
    # HELPERS
    # ========================================================================

    def _build_edges_from_aggregator(self, chain: ChainId) -> list[Edge]:
        """Build edges from price aggregator data."""
        if not self.aggregator:
            return []

        edges = []

        for key, prices in self.aggregator.prices.items():
            if key[0] != chain:
                continue

            _, token0, token1 = key

            for price_update in prices:
                # Forward edge
                if price_update.price > 0:
                    rate = price_update.price / 1e18
                    edges.append(Edge(
                        token_in=token0,
                        token_out=token1,
                        pool=price_update.pool,
                        dex=price_update.dex,
                        rate=rate,
                        reserve_in=price_update.reserve0,
                        reserve_out=price_update.reserve1,
                    ))

                    # Reverse edge
                    reverse_rate = 1e18 / price_update.price if price_update.price > 0 else 0
                    edges.append(Edge(
                        token_in=token1,
                        token_out=token0,
                        pool=price_update.pool,
                        dex=price_update.dex,
                        rate=reverse_rate,
                        reserve_in=price_update.reserve1,
                        reserve_out=price_update.reserve0,
                    ))

        return edges

    def _get_start_tokens(self, chain: ChainId, edges: list[Edge]) -> list[str]:
        """Get tokens to start arbitrage search from."""
        # Prefer high-liquidity base tokens
        base_tokens = {
            ChainId.BSC: [
                "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",  # WBNB
                "0x55d398326f99059fF775485246999027B3197955",  # USDT
                "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",  # USDC
            ],
            ChainId.ETHEREUM: [
                "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",  # WETH
                "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",  # USDC
                "0xdAC17F958D2ee523a2206206994597C13D831ec7",  # USDT
            ],
            ChainId.ARBITRUM: [
                "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",  # WETH
                "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",  # USDC
            ],
            ChainId.BASE: [
                "0x4200000000000000000000000000000000000006",  # WETH
                "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",  # USDC
            ],
        }

        # Filter to tokens that exist in edges
        available_tokens = set()
        for edge in edges:
            available_tokens.add(edge.token_in)
            available_tokens.add(edge.token_out)

        chain_tokens = base_tokens.get(chain, [])
        return [t for t in chain_tokens if t in available_tokens]

    def _path_to_opportunity(
        self,
        chain: ChainId,
        path: ArbitragePath,
    ) -> Opportunity:
        """Convert ArbitragePath to Opportunity for handlers."""
        swap_steps = []
        current_amount = path.optimal_size_wei

        for edge in path.edges:
            # Calculate expected output
            fee_mult = (10000 - edge.fee_bps) / 10000
            amount_with_fee = int(current_amount * fee_mult)
            amount_out = (edge.reserve_out * amount_with_fee) // (edge.reserve_in + amount_with_fee)

            swap_steps.append(SwapStep(
                dex=edge.dex,
                pool=edge.pool,
                token_in=edge.token_in,
                token_out=edge.token_out,
                amount_in=current_amount,
                amount_out=amount_out,
            ))
            current_amount = amount_out

        return Opportunity(
            id=int(time.time() * 1000),
            timestamp_ms=int(time.time() * 1000),
            chain=chain,
            profit_wei=path.net_profit_wei,
            gas_estimate=path.gas_estimate,
            path=swap_steps,
            flash_loan_token=path.start_token,
            flash_loan_amount=path.optimal_size_wei,
            confidence=path.confidence,
        )

    def get_stats(self) -> dict:
        """Get detector statistics."""
        return self.stats.copy()


# ============================================================================
# STANDALONE MMBF FUNCTION (for integration with other systems)
# ============================================================================

def find_arbitrage_mmbf(
    edges: list[dict],
    start_token: str,
    min_profit_bps: int = 10,
    max_path_length: int = 8,
    min_liquidity_usd: float = 50000,
) -> list[dict]:
    """
    Standalone function to find arbitrage using MMBF.

    Args:
        edges: List of edge dicts with keys:
            - token_in, token_out, pool, dex, rate, reserve_in, reserve_out
        start_token: Token address to start/end cycle
        min_profit_bps: Minimum profit in basis points
        max_path_length: Maximum hops
        min_liquidity_usd: Minimum pool liquidity

    Returns:
        List of profitable paths as dicts
    """
    # Convert dicts to Edge objects
    edge_objects = [
        Edge(
            token_in=e["token_in"],
            token_out=e["token_out"],
            pool=e["pool"],
            dex=e["dex"],
            rate=e["rate"],
            reserve_in=e["reserve_in"],
            reserve_out=e["reserve_out"],
            fee_bps=e.get("fee_bps", 30),
        )
        for e in edges
    ]

    # Create detector and scan
    detector = MMBFDetector(
        min_profit_bps=min_profit_bps,
        max_path_length=max_path_length,
        min_liquidity_usd=min_liquidity_usd,
    )

    # Build line graph and run MMBF
    line_graph = detector._build_line_graph(edge_objects, start_token)
    paths = detector._run_mmbf(line_graph, start_token, edge_objects)

    # Filter and calculate
    results = []
    for path in paths:
        if path.profit_bps >= min_profit_bps:
            if detector._check_liquidity(path):
                detector._calculate_optimal_trade(path)
                if path.net_profit_wei > 0:
                    results.append({
                        "edges": [
                            {
                                "token_in": e.token_in,
                                "token_out": e.token_out,
                                "pool": e.pool,
                                "dex": e.dex,
                                "rate": e.rate,
                            }
                            for e in path.edges
                        ],
                        "profit_ratio": path.profit_ratio,
                        "profit_bps": path.profit_bps,
                        "optimal_size_wei": path.optimal_size_wei,
                        "net_profit_wei": path.net_profit_wei,
                        "estimated_profit_usd": path.estimated_profit_usd,
                        "gas_estimate": path.gas_estimate,
                        "confidence": path.confidence,
                        "hops": len(path.edges),
                    })

    return sorted(results, key=lambda x: x["net_profit_wei"], reverse=True)
