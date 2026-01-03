/**
 * MMBF Arbitrage Detector (TypeScript)
 *
 * Modified Moore-Bellman-Ford algorithm with Line Graph transformation
 * for detecting ALL profitable arbitrage cycles.
 *
 * Based on research: https://arxiv.org/html/2406.16573v1
 *
 * Performance vs DFS:
 * - Standard DFS: ~19 paths >$1,000 profit
 * - MMBF: ~23,868 paths >$1,000 profit (1000x more opportunities)
 */

// ============================================================================
// TYPES
// ============================================================================

export interface Edge {
  tokenIn: string;
  tokenOut: string;
  pool: string;
  dex: string;
  rate: number; // Exchange rate (token_out per token_in)
  reserveIn: bigint;
  reserveOut: bigint;
  feeBps: number; // Fee in basis points (default 30 = 0.3%)
}

interface LineVertex {
  id: string;
  edge: Edge;
}

interface LineEdge {
  fromVertex: string;
  toVertex: string;
  weight: number; // -log(rate)
}

interface LineGraph {
  vertices: Map<string, LineVertex>;
  edges: LineEdge[];
  sourceEdges: LineEdge[];
  startToken: string;
}

export interface ArbitragePath {
  edges: Edge[];
  profitRatio: number; // > 1.0 means profitable
  profitBps: number;
  startToken: string;
  estimatedProfitUsd: number;
  optimalSizeWei: bigint;
  gasEstimate: number;
  netProfitWei: bigint;
  confidence: number;
  hops: number;
}

export interface MMBFConfig {
  minProfitBps: number;
  maxPathLength: number;
  maxIterations: number;
  gasPriceGwei: number;
  minLiquidityUsd: number;
}

// ============================================================================
// TOKEN PRICES (for liquidity calculation)
// ============================================================================

const TOKEN_PRICES_USD: Record<string, number> = {
  // BSC
  '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c': 600,   // WBNB
  '0x55d398326f99059fF775485246999027B3197955': 1,     // USDT
  '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56': 1,     // BUSD
  '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d': 1,     // USDC
  '0x2170Ed0880ac9A755fd29B2688956BD959F933F8': 3400,  // ETH
  '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c': 95000, // BTCB
  '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82': 2,     // CAKE
  // Ethereum
  '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2': 3400,  // WETH
  '0xdAC17F958D2ee523a2206206994597C13D831ec7': 1,     // USDT
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48': 1,     // USDC
  '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599': 95000, // WBTC
  '0x6B175474E89094C44Da98b954EescdeCB5BE0Ba': 1,     // DAI
  '0x514910771AF9Ca656af840dff83E8264EcF986CA': 15,    // LINK
  '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984': 8,     // UNI
};

// ============================================================================
// MMBF DETECTOR CLASS
// ============================================================================

export class MMBFDetector {
  private config: MMBFConfig;
  private stats = {
    scans: 0,
    pathsFound: 0,
    profitablePaths: 0,
    totalScanTimeMs: 0,
  };

  constructor(config: Partial<MMBFConfig> = {}) {
    this.config = {
      minProfitBps: config.minProfitBps ?? 10,
      maxPathLength: config.maxPathLength ?? 8,
      maxIterations: config.maxIterations ?? 100,
      gasPriceGwei: config.gasPriceGwei ?? 30,
      minLiquidityUsd: config.minLiquidityUsd ?? 50000,
    };
  }

  /**
   * Find all profitable arbitrage paths using MMBF algorithm
   */
  findArbitrage(edges: Edge[], startTokens: string[]): ArbitragePath[] {
    const startTime = Date.now();
    this.stats.scans++;

    const allPaths: ArbitragePath[] = [];

    for (const startToken of startTokens) {
      // Build line graph
      const lineGraph = this.buildLineGraph(edges, startToken);

      if (lineGraph.vertices.size === 0) {
        continue;
      }

      // Run MMBF algorithm
      const paths = this.runMMBF(lineGraph, startToken);

      // Filter and calculate optimal trades
      for (const path of paths) {
        if (path.profitBps >= this.config.minProfitBps) {
          if (this.checkLiquidity(path)) {
            this.calculateOptimalTrade(path);

            if (path.netProfitWei > 0n) {
              allPaths.push(path);
              this.stats.profitablePaths++;
            }
          }
        }
      }
    }

    // Sort by profit
    allPaths.sort((a, b) => Number(b.netProfitWei - a.netProfitWei));

    const scanTimeMs = Date.now() - startTime;
    this.stats.pathsFound += allPaths.length;
    this.stats.totalScanTimeMs += scanTimeMs;

    console.log(
      `[MMBF] Scan complete: ${edges.length} edges, ${startTokens.length} start tokens, ` +
      `${allPaths.length} paths found in ${scanTimeMs}ms`
    );

    return allPaths;
  }

  /**
   * Build line graph from token graph
   * In line graph: edges become vertices, connected if they share a token
   */
  private buildLineGraph(edges: Edge[], startToken: string): LineGraph {
    // Create line vertices (one per edge)
    const vertices = new Map<string, LineVertex>();

    for (const edge of edges) {
      const vid = `${edge.pool}:${edge.tokenIn}:${edge.tokenOut}`;
      vertices.set(vid, { id: vid, edge });
    }

    // Group edges by input token
    const edgesByInToken = new Map<string, LineVertex[]>();
    for (const v of vertices.values()) {
      const inToken = v.edge.tokenIn;
      if (!edgesByInToken.has(inToken)) {
        edgesByInToken.set(inToken, []);
      }
      edgesByInToken.get(inToken)!.push(v);
    }

    // Create line edges (connect edges that share a token)
    const lineEdges: LineEdge[] = [];

    for (const v1 of vertices.values()) {
      const outToken = v1.edge.tokenOut;

      for (const v2 of edgesByInToken.get(outToken) || []) {
        // Don't connect same pool (no consecutive swaps in same pool)
        if (v1.edge.pool === v2.edge.pool) {
          continue;
        }

        lineEdges.push({
          fromVertex: v1.id,
          toVertex: v2.id,
          weight: this.logRate(v2.edge.rate),
        });
      }
    }

    // Source edges: connect source to all edges from startToken
    const sourceEdges: LineEdge[] = [];
    for (const v of edgesByInToken.get(startToken) || []) {
      sourceEdges.push({
        fromVertex: '__SOURCE__',
        toVertex: v.id,
        weight: this.logRate(v.edge.rate),
      });
    }

    return {
      vertices,
      edges: lineEdges,
      sourceEdges,
      startToken,
    };
  }

  /**
   * Run Modified Moore-Bellman-Ford algorithm
   */
  private runMMBF(lineGraph: LineGraph, startToken: string): ArbitragePath[] {
    const { vertices, edges, sourceEdges } = lineGraph;

    if (vertices.size === 0) {
      return [];
    }

    // Initialize distances
    const distance = new Map<string, number>();
    distance.set('__SOURCE__', 0);
    for (const vid of vertices.keys()) {
      distance.set(vid, Infinity);
    }

    // Path tracking
    const paths = new Map<string, string[]>();
    paths.set('__SOURCE__', []);
    for (const vid of vertices.keys()) {
      paths.set(vid, []);
    }

    // Initialize from source
    for (const se of sourceEdges) {
      const currentDist = distance.get(se.toVertex)!;
      if (se.weight < currentDist) {
        distance.set(se.toVertex, se.weight);
        paths.set(se.toVertex, [se.toVertex]);
      }
    }

    const profitablePaths: ArbitragePath[] = [];

    // Bellman-Ford iterations
    for (let iter = 0; iter < Math.min(this.config.maxIterations, this.config.maxPathLength); iter++) {
      let updated = false;

      for (const edge of edges) {
        const fromDist = distance.get(edge.fromVertex)!;
        if (fromDist === Infinity) {
          continue;
        }

        const newDist = fromDist + edge.weight;
        const toVertex = vertices.get(edge.toVertex)!;

        // Check if this creates a cycle back to start
        if (toVertex.edge.tokenOut === startToken) {
          const currentPath = paths.get(edge.fromVertex)!;
          const cycleEdges = this.extractCycleEdges(
            [...currentPath, edge.toVertex],
            vertices
          );

          if (cycleEdges.length >= 2) {
            const profitRatio = this.calculateProfitRatio(cycleEdges);

            if (profitRatio > 1.0) {
              const profitBps = Math.floor((profitRatio - 1.0) * 10000);

              profitablePaths.push({
                edges: cycleEdges,
                profitRatio,
                profitBps,
                startToken,
                estimatedProfitUsd: 0,
                optimalSizeWei: 0n,
                gasEstimate: 0,
                netProfitWei: 0n,
                confidence: 0,
                hops: cycleEdges.length,
              });
            }
          }
        }

        // Standard relaxation
        const currentDist = distance.get(edge.toVertex)!;
        if (newDist < currentDist) {
          const currentPath = paths.get(edge.fromVertex)!;

          // Prevent revisiting same vertex
          if (!currentPath.includes(edge.toVertex)) {
            if (currentPath.length < this.config.maxPathLength) {
              distance.set(edge.toVertex, newDist);
              paths.set(edge.toVertex, [...currentPath, edge.toVertex]);
              updated = true;
            }
          }
        }
      }

      if (!updated) {
        break;
      }
    }

    return profitablePaths;
  }

  /**
   * Extract original edges from line vertex path
   */
  private extractCycleEdges(
    vertexIds: string[],
    vertices: Map<string, LineVertex>
  ): Edge[] {
    const edges: Edge[] = [];
    for (const vid of vertexIds) {
      const v = vertices.get(vid);
      if (v) {
        edges.push(v.edge);
      }
    }
    return edges;
  }

  /**
   * Calculate cumulative exchange rate for a path
   */
  private calculateProfitRatio(edges: Edge[]): number {
    if (edges.length === 0) return 0;

    let ratio = 1.0;
    for (const edge of edges) {
      ratio *= edge.rate;
    }
    return ratio;
  }

  /**
   * Negative log of rate for Bellman-Ford
   */
  private logRate(rate: number): number {
    if (rate <= 0) return Infinity;
    return -Math.log(rate);
  }

  /**
   * Check if all pools have sufficient liquidity
   */
  private checkLiquidity(path: ArbitragePath): boolean {
    for (const edge of path.edges) {
      const liquidityUsd = this.estimateLiquidityUsd(edge);
      if (liquidityUsd < this.config.minLiquidityUsd) {
        return false;
      }
    }
    return true;
  }

  /**
   * Estimate USD liquidity in a pool
   */
  private estimateLiquidityUsd(edge: Edge): number {
    const priceIn = TOKEN_PRICES_USD[edge.tokenIn] || 0;
    const priceOut = TOKEN_PRICES_USD[edge.tokenOut] || 0;

    const valueIn = Number(edge.reserveIn) / 1e18 * priceIn;
    const valueOut = Number(edge.reserveOut) / 1e18 * priceOut;

    return valueIn + valueOut;
  }

  /**
   * Calculate optimal trade size using bisection
   */
  private calculateOptimalTrade(path: ArbitragePath): void {
    // Find minimum reserve
    let minReserve = BigInt(Number.MAX_SAFE_INTEGER);
    for (const edge of path.edges) {
      if (edge.reserveIn < minReserve) minReserve = edge.reserveIn;
      if (edge.reserveOut < minReserve) minReserve = edge.reserveOut;
    }

    if (minReserve === 0n) {
      path.optimalSizeWei = 0n;
      path.netProfitWei = 0n;
      return;
    }

    // Bisection search for optimal size
    let low = minReserve / 10000n; // 0.01%
    let high = minReserve / 10n;   // 10%

    let bestProfit = 0n;
    let bestSize = low;

    for (let i = 0; i < 20; i++) {
      if (high <= low) break;

      const mid = (low + high) / 2n;
      const profitMid = this.simulateTrade(path.edges, mid);
      const profitMidPlus = this.simulateTrade(path.edges, mid + 1n);

      if (profitMidPlus > profitMid) {
        low = mid + 1n;
        if (profitMidPlus > bestProfit) {
          bestProfit = profitMidPlus;
          bestSize = mid + 1n;
        }
      } else {
        high = mid;
        if (profitMid > bestProfit) {
          bestProfit = profitMid;
          bestSize = mid;
        }
      }
    }

    // Calculate gas cost
    const gasPerHop = 150000;
    const totalGas = gasPerHop * path.edges.length + 21000;
    const gasCostWei = BigInt(totalGas) * BigInt(this.config.gasPriceGwei) * 10n ** 9n;

    path.optimalSizeWei = bestSize;
    path.gasEstimate = totalGas;
    path.netProfitWei = bestProfit > gasCostWei ? bestProfit - gasCostWei : 0n;

    // Estimate USD profit
    const startTokenPrice = TOKEN_PRICES_USD[path.startToken] || 1;
    path.estimatedProfitUsd = Number(path.netProfitWei) / 1e18 * startTokenPrice;

    // Confidence
    if (path.netProfitWei > 0n && bestProfit > 0n) {
      const margin = Number(path.netProfitWei) / Number(bestProfit);
      path.confidence = Math.min(0.9, margin * path.profitBps / 100);
    }
  }

  /**
   * Simulate multi-hop trade with slippage
   */
  private simulateTrade(edges: Edge[], amountIn: bigint): bigint {
    let currentAmount = amountIn;

    for (const edge of edges) {
      if (currentAmount <= 0n || edge.reserveIn <= 0n) {
        return 0n;
      }

      // Apply fee
      const feeMult = BigInt(10000 - edge.feeBps);
      const amountWithFee = currentAmount * feeMult / 10000n;

      // Constant product formula
      const numerator = edge.reserveOut * amountWithFee;
      const denominator = edge.reserveIn + amountWithFee;

      if (denominator <= 0n) {
        return 0n;
      }

      currentAmount = numerator / denominator;
    }

    // Profit = output - input
    return currentAmount > amountIn ? currentAmount - amountIn : 0n;
  }

  getStats() {
    return { ...this.stats };
  }
}

// ============================================================================
// CONVENIENCE FUNCTION
// ============================================================================

/**
 * Find arbitrage opportunities using MMBF algorithm
 */
export function findArbitrageMMBF(
  edges: Edge[],
  startTokens: string[],
  config?: Partial<MMBFConfig>
): ArbitragePath[] {
  const detector = new MMBFDetector(config);
  return detector.findArbitrage(edges, startTokens);
}
