# Multi-Hop Arbitrage Optimization Project

## Project Status: PLANNED (Research Required)
**Created**: January 2, 2026
**Priority**: High
**Type**: Research & Development

---

## 1. PROBLEM STATEMENT

### Current Limitation
Our current arbitrage detection only finds simple 2-hop opportunities:
```
Token A -> Token B -> Token A
```

### Opportunity
Multi-hop paths can yield significantly higher returns:
```
Token A -> Token B -> Token C -> Token A           (3-hop)
Token A -> Token B -> Token C -> Token D -> Token A (4-hop)
```

**Why this matters:**
- Direct A↔B arbitrage is highly competitive (bots compete in milliseconds)
- Multi-hop paths are less crowded (complexity barrier)
- Can extract value from multiple pool inefficiencies in single transaction
- Gas cost amortized across larger profit potential

---

## 2. RESEARCH OBJECTIVES

### 2.1 Path Finding Algorithms
- [ ] Research graph-based path finding for token pairs
- [ ] Evaluate Bellman-Ford for negative cycle detection (arbitrage)
- [ ] Evaluate Dijkstra variants for weighted graphs
- [ ] Research A* with custom heuristics for token graphs
- [ ] Investigate Floyd-Warshall for all-pairs analysis
- [ ] Study Johnson's algorithm for sparse graphs

### 2.2 Speed Optimizations
- [ ] Research parallel path computation (WebWorkers/Worker Threads)
- [ ] Evaluate WASM for hot path calculations
- [ ] Study incremental graph updates (vs full rebuild)
- [ ] Research priority queue optimizations
- [ ] Investigate memory-mapped price data structures
- [ ] Study SIMD operations for batch calculations

### 2.3 Return Calculation
- [ ] Research optimal path length vs gas cost tradeoffs
- [ ] Study slippage modeling across multiple hops
- [ ] Investigate dynamic programming for optimal amounts
- [ ] Research convex optimization for multi-pool routing
- [ ] Study constant product/sum AMM math optimizations

### 2.4 Real-Time Updates
- [ ] Research efficient graph updates on price changes
- [ ] Study WebSocket feed processing optimization
- [ ] Investigate delta-based recalculation strategies
- [ ] Research priority-based opportunity scoring

---

## 3. TECHNICAL APPROACHES TO INVESTIGATE

### 3.1 Graph Representation

**Option A: Adjacency List**
```typescript
// Fast for sparse graphs (most token pairs don't have pools)
interface TokenGraph {
  [tokenAddress: string]: Edge[];
}
interface Edge {
  target: string;
  pool: string;
  reserve0: bigint;
  reserve1: bigint;
  fee: number;
}
```

**Option B: Adjacency Matrix**
```typescript
// Fast lookups, memory intensive
// Best for dense subgraphs (top 100 tokens)
type PriceMatrix = Map<string, Map<string, PoolInfo>>;
```

**Option C: Compressed Sparse Row (CSR)**
```typescript
// Memory efficient, cache friendly
// Best for large static graphs
interface CSRGraph {
  rowPtr: Uint32Array;    // Start index for each node
  colIdx: Uint32Array;    // Target node indices
  values: Float64Array;   // Edge weights (prices)
}
```

### 3.2 Arbitrage Detection Algorithms

**Bellman-Ford Negative Cycle**
```
Concept: Convert prices to log space, find negative cycles
- log(price_AB) + log(price_BC) + log(price_CA) < 0 means profit
- Time: O(V * E)
- Pros: Finds all negative cycles
- Cons: Slow for large graphs
```

**SPFA (Shortest Path Faster Algorithm)**
```
Concept: Optimized Bellman-Ford with queue
- Average case much faster
- Good for sparse graphs
- Can detect negative cycles
```

**Johnson's Algorithm**
```
Concept: All-pairs shortest paths
- Reweights graph to remove negative edges
- Then runs Dijkstra from each node
- Time: O(V² log V + VE)
- Best for finding ALL opportunities
```

**Custom DFS with Pruning**
```
Concept: Depth-limited search with early termination
- Set max path length (3-5 hops)
- Prune paths below profit threshold
- Use memoization for subpaths
- Can be parallelized per starting token
```

### 3.3 Amount Optimization

**Binary Search**
```
Simple approach for single pool
- Find optimal input amount
- O(log n) iterations
```

**Convex Optimization**
```
For multi-pool routing:
- Problem is convex for constant product AMMs
- Can use gradient descent
- Or Newton's method for faster convergence
```

**Dynamic Programming**
```
For discrete amount steps:
- Precompute outputs at fixed input levels
- Find optimal path through DP table
- Trade accuracy for speed
```

---

## 4. SPEED OPTIMIZATION STRATEGIES

### 4.1 Computation Layer

| Strategy | Speedup | Complexity | Notes |
|----------|---------|------------|-------|
| WebAssembly (Rust) | 10-50x | High | Best for math-heavy code |
| Worker Threads | 4-8x | Medium | Parallel path search |
| SIMD.js | 2-4x | Medium | Batch price calculations |
| Native Addon (C++) | 20-100x | Very High | Maximum performance |
| GPU (WebGL/Compute) | 50-200x | Very High | Massive parallelism |

### 4.2 Data Structure Optimizations

| Structure | Use Case | Benefit |
|-----------|----------|---------|
| TypedArrays | Price storage | 2-3x memory, faster iteration |
| SharedArrayBuffer | Multi-thread | Zero-copy between workers |
| LRU Cache | Path memoization | Avoid recalculation |
| Bloom Filter | Quick negative check | Skip impossible paths |
| Fibonacci Heap | Priority queue | O(1) decrease-key |

### 4.3 Incremental Updates

```
Instead of rebuilding graph on every price update:
1. Track which edges changed
2. Only recalculate affected paths
3. Use versioned graph structure
4. Invalidate cached paths selectively
```

---

## 5. EXISTING SOLUTIONS TO STUDY

### 5.1 Open Source References

| Project | Language | Approach | Link |
|---------|----------|----------|------|
| 1inch Pathfinder | TypeScript | Split routing | github.com/1inch |
| Uniswap Auto Router | TypeScript | Alpha router | github.com/Uniswap |
| 0x API | TypeScript | RFQ + AMM routing | github.com/0xProject |
| Paraswap | TypeScript | Multi-DEX aggregation | github.com/paraswap |
| Rango Exchange | TypeScript | Cross-chain routing | github.com/rango-exchange |

### 5.2 Academic Papers

| Paper | Concept | Relevance |
|-------|---------|-----------|
| "Cyclic Arbitrage in DEXs" | Formal analysis of cycles | Theory foundation |
| "High-Frequency Trading on DEXs" | Latency optimization | Speed strategies |
| "Optimal Routing for AMMs" | Convex optimization | Amount calculation |
| "Flash Boys 2.0" | MEV extraction | Competition analysis |

### 5.3 MEV Bot Analysis

| Bot | Known Techniques |
|-----|------------------|
| jaredfromsubway | Multi-path, high gas |
| Wintermute | Market making + arb |
| Jump Crypto | Cross-chain, ultra low latency |

---

## 6. IMPLEMENTATION PHASES

### Phase 1: Research & Prototyping
- [ ] Implement basic graph structure for token pairs
- [ ] Prototype Bellman-Ford negative cycle detection
- [ ] Benchmark against current simple detection
- [ ] Measure opportunity discovery improvement

### Phase 2: Algorithm Selection
- [ ] Compare algorithm performance on real data
- [ ] Select best approach for our use case
- [ ] Optimize selected algorithm
- [ ] Implement path caching

### Phase 3: Speed Optimization
- [ ] Profile hot paths
- [ ] Implement WASM for critical sections
- [ ] Add worker thread parallelization
- [ ] Optimize memory layout

### Phase 4: Integration
- [ ] Integrate with existing opportunity scanner
- [ ] Add multi-hop execution to contracts
- [ ] Test on testnet
- [ ] Deploy to production

---

## 7. SUCCESS METRICS

| Metric | Current | Target |
|--------|---------|--------|
| Path discovery time | N/A | <10ms for 1000 tokens |
| Opportunities found | 2-hop only | 2-5 hop paths |
| Profit per opportunity | Baseline | +50% average |
| False positive rate | Unknown | <5% |
| Memory usage | Unknown | <500MB for full graph |

---

## 8. QUESTIONS TO ANSWER

### Algorithm Questions
1. What is the optimal max path length? (3, 4, or 5 hops?)
2. How does gas cost scale with path length?
3. Can we predict which paths are worth exploring?
4. How do we handle price staleness in longer paths?

### Speed Questions
1. What's the bottleneck: graph building or path finding?
2. Can we use incremental updates effectively?
3. Is WASM worth the development overhead?
4. How many paths can we evaluate per second?

### Business Questions
1. Are multi-hop opportunities actually more profitable?
2. What's the competition like for 3+ hop paths?
3. Does latency matter less for complex paths?
4. Can we run this profitably on BSC given lower margins?

---

## 9. INITIAL CODE SKETCHES

### Graph Builder
```typescript
interface TokenGraph {
  addPool(pool: PoolInfo): void;
  updatePrice(pool: string, reserve0: bigint, reserve1: bigint): void;
  findArbitrage(startToken: string, maxHops: number): ArbitragePath[];
  getOptimalAmount(path: ArbitragePath): bigint;
}
```

### Path Finder
```typescript
interface PathFinder {
  // Find all profitable cycles starting from token
  findCycles(
    graph: TokenGraph,
    startToken: string,
    maxHops: number,
    minProfitBps: number
  ): Path[];

  // Optimize input amount for a path
  optimizeAmount(
    path: Path,
    maxInput: bigint
  ): { amount: bigint; profit: bigint };
}
```

### Worker Pool
```typescript
interface ArbitrageWorkerPool {
  // Distribute path finding across workers
  findAllArbitrage(
    tokens: string[],
    maxHops: number
  ): Promise<ArbitragePath[]>;

  // Update prices in all workers
  broadcastPriceUpdate(pool: string, prices: PriceUpdate): void;
}
```

---

## 10. RESOURCES & REFERENCES

### Documentation
- Uniswap V2 Math: https://docs.uniswap.org/
- Uniswap V3 Math: https://uniswap.org/whitepaper-v3.pdf
- Curve Finance Math: https://curve.fi/whitepaper

### Tools
- Graph visualization: Cytoscape.js, D3.js
- Benchmarking: Benchmark.js, clinic.js
- Profiling: Chrome DevTools, 0x

### Libraries to Evaluate
- graphlib (JavaScript graphs)
- ngraph (Fast graph algorithms)
- sigma.js (Graph visualization)
- assemblyscript (TypeScript to WASM)

---

## 11. NOTES

### Ideas to Explore
- Can we use machine learning to predict profitable paths?
- Should we focus on specific token clusters (stablecoins, ETH pairs)?
- Can we partner with DEXs for preferential routing?
- Is there value in cross-DEX path finding (Uni -> Sushi -> Curve)?

### Risks
- Increased complexity = more bugs
- Longer paths = more slippage uncertainty
- Gas costs may eat profits on longer paths
- Competition may already be doing this better

---

*Last Updated: January 2, 2026*
*Author: Agent Mouse*
*Status: Awaiting Research Start*
