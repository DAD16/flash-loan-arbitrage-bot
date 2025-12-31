/**
 * THE ARCHITECT - Node Infrastructure & Latency Optimization Agent
 *
 * Named after The Architect from The Matrix who designed the Matrix itself,
 * understanding every aspect of its structure. This agent designs and optimizes
 * the node infrastructure for blockchain communications.
 *
 * Primary Responsibilities:
 * - Node infrastructure design and optimization
 * - Latency reduction for blockchain communications
 * - BSC/BNB Chain infrastructure (primary focus)
 * - DEX mapping and integration planning
 * - Cost calculations for infrastructure
 * - Competitor action tracking and visualization
 * - MEV relay integration (bloXroute, 48 Club)
 */

import { Logger } from "winston";

// ============ Types ============

export interface ChainInfrastructure {
  chainId: number;
  name: string;
  symbol: string;
  blockTime: number; // seconds
  gasToken: string;
  rpcEndpoints: RpcEndpoint[];
  mevRelays: MevRelay[];
  dexes: DexInfo[];
  nodeRequirements: NodeRequirements;
  costEstimate: CostEstimate;
}

export interface RpcEndpoint {
  name: string;
  url: string;
  type: "public" | "private" | "dedicated";
  latency: LatencyMetrics;
  features: string[];
  pricing?: PricingTier;
  mevProtection: boolean;
}

export interface LatencyMetrics {
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  region: string;
}

export interface MevRelay {
  name: string;
  url: string;
  validators: number;
  features: string[];
  bundleSubmission: boolean;
  pricing: string;
}

export interface DexInfo {
  name: string;
  type: "amm" | "orderbook" | "aggregator";
  version: string;
  router: string;
  factory?: string;
  fee: number; // basis points
  tvl: string;
  volume24h: string;
  pairs: number;
  features: string[];
}

export interface NodeRequirements {
  cpu: string;
  ram: string;
  storage: string;
  bandwidth: string;
  os: string;
}

export interface CostEstimate {
  selfHosted: MonthlyCost;
  dedicated: MonthlyCost;
  managed: MonthlyCost;
  optimal: string; // recommendation
}

export interface MonthlyCost {
  infrastructure: number;
  bandwidth: number;
  maintenance: number;
  total: number;
  currency: string;
}

export interface PricingTier {
  name: string;
  requestsPerSecond: number;
  monthlyPrice: number;
  currency: string;
}

export interface CompetitorBot {
  address: string;
  name?: string;
  type: "arbitrage" | "sandwich" | "liquidation" | "unknown";
  volume24h: string;
  profit24h: string;
  transactions24h: number;
  successRate: number;
  preferredDexes: string[];
  lastSeen: string;
}

// ============ BSC DEX Database ============

export const BSC_DEXES: DexInfo[] = [
  {
    name: "PancakeSwap V3",
    type: "amm",
    version: "3.0",
    router: "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4",
    factory: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
    fee: 25, // 0.25% (varies by pool: 0.01%, 0.05%, 0.25%, 1%)
    tvl: "$1.7B+",
    volume24h: "$600M+",
    pairs: 1301,
    features: [
      "Concentrated liquidity",
      "Multiple fee tiers",
      "Flash loans",
      "CAKE rewards",
      "Limit orders",
    ],
  },
  {
    name: "PancakeSwap V2",
    type: "amm",
    version: "2.0",
    router: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
    factory: "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73",
    fee: 25, // 0.25%
    tvl: "$500M+",
    volume24h: "$200M+",
    pairs: 5000,
    features: ["Yield farming", "Syrup pools", "Lottery", "NFT marketplace"],
  },
  {
    name: "BiSwap",
    type: "amm",
    version: "2.0",
    router: "0x3a6d8cA21D1CF76F653A67577FA0D27453350dD8",
    factory: "0x858E3312ed3A876947EA49d572A7C42DE08af7EE",
    fee: 10, // 0.1% - Lowest on BSC
    tvl: "$100M+",
    volume24h: "$50M+",
    pairs: 500,
    features: [
      "Lowest fees on BSC",
      "3-tier referral system",
      "BSW token rewards",
      "Launchpad",
    ],
  },
  {
    name: "Thena",
    type: "amm",
    version: "2.0",
    router: "0xd4ae6eCA985340Dd434D38F470aCCce4DC78D109",
    factory: "0xAFD89d21BdB66d00817d4153E055830B1c2B3970",
    fee: 20, // 0.2%
    tvl: "$80M+",
    volume24h: "$30M+",
    pairs: 200,
    features: [
      "ve(3,3) model",
      "Concentrated liquidity",
      "Governance",
      "Partner gauges",
    ],
  },
  {
    name: "MDEX",
    type: "amm",
    version: "2.0",
    router: "0x7DAe51BD3E3376B8c7c4900E9107f12Be3AF1bA8",
    factory: "0x3CD1C46068dAEa5Ebb0d3f55F6915B10648062B8",
    fee: 30, // 0.3%
    tvl: "$50M+",
    volume24h: "$20M+",
    pairs: 300,
    features: ["Dual mining", "MDX rewards", "Cross-chain"],
  },
  {
    name: "ApeSwap",
    type: "amm",
    version: "2.0",
    router: "0xcF0feBd3f17CEf5b47b0cD257aCf6025c5BFf3b7",
    factory: "0x0841BD0B734E4F5853f0dD8d7Ea041c241fb0Da6",
    fee: 20, // 0.2%
    tvl: "$30M+",
    volume24h: "$10M+",
    pairs: 400,
    features: ["BANANA token", "IAO launchpad", "NFTs", "Lending"],
  },
  {
    name: "BabySwap",
    type: "amm",
    version: "2.0",
    router: "0x325E343f1dE602396E256B67eFd1F61C3A6B38Bd",
    factory: "0x86407bEa2078ea5f5EB5A52B2caA963bC1F889Da",
    fee: 30, // 0.3%
    tvl: "$20M+",
    volume24h: "$5M+",
    pairs: 200,
    features: ["Baby token", "NFT game", "Metaverse"],
  },
  {
    name: "1inch",
    type: "aggregator",
    version: "5.0",
    router: "0x1111111254EEB25477B68fb85Ed929f73A960582",
    fee: 0, // No extra fee, uses DEX fees
    tvl: "N/A",
    volume24h: "$100M+",
    pairs: 0, // Aggregator
    features: [
      "Multi-DEX routing",
      "Best price discovery",
      "Gas optimization",
      "Limit orders",
      "Fusion mode",
    ],
  },
  {
    name: "ParaSwap",
    type: "aggregator",
    version: "5.0",
    router: "0xDEF171Fe48CF0115B1d80b88dc8eAB59176FEe57",
    fee: 0,
    tvl: "N/A",
    volume24h: "$30M+",
    pairs: 0,
    features: ["Multi-DEX routing", "Gas rebates", "MEV protection"],
  },
  {
    name: "OpenOcean",
    type: "aggregator",
    version: "3.0",
    router: "0x6352a56caadC4F1E25CD6c75970Fa768A3304e64",
    fee: 0,
    tvl: "N/A",
    volume24h: "$20M+",
    pairs: 0,
    features: ["Cross-chain", "Limit orders", "Best routing"],
  },
];

// ============ BSC RPC Endpoints ============

export const BSC_RPC_ENDPOINTS: RpcEndpoint[] = [
  {
    name: "Binance Official",
    url: "https://bsc-dataseed.binance.org",
    type: "public",
    latency: { avgMs: 50, p50Ms: 45, p95Ms: 100, p99Ms: 150, region: "Global" },
    features: ["Free", "Official", "Load balanced"],
    mevProtection: false,
  },
  {
    name: "Binance Official 2",
    url: "https://bsc-dataseed1.binance.org",
    type: "public",
    latency: { avgMs: 55, p50Ms: 50, p95Ms: 110, p99Ms: 160, region: "Global" },
    features: ["Free", "Official", "Backup"],
    mevProtection: false,
  },
  {
    name: "QuickNode",
    url: "https://bsc.quiknode.pro",
    type: "dedicated",
    latency: { avgMs: 30, p50Ms: 25, p95Ms: 60, p99Ms: 100, region: "Global" },
    features: [
      "Low latency",
      "WebSocket",
      "Archive data",
      "Trace API",
      "66 chains",
    ],
    pricing: { name: "Build", requestsPerSecond: 25, monthlyPrice: 49, currency: "USD" },
    mevProtection: false, // Note: QuickNode doesn't offer MEV protection
  },
  {
    name: "Alchemy",
    url: "https://bnb-mainnet.g.alchemy.com/v2",
    type: "dedicated",
    latency: { avgMs: 35, p50Ms: 30, p95Ms: 70, p99Ms: 120, region: "Global" },
    features: ["Enhanced APIs", "WebSocket", "Webhooks", "NFT APIs"],
    pricing: { name: "Growth", requestsPerSecond: 330, monthlyPrice: 199, currency: "USD" },
    mevProtection: false, // Note: Alchemy doesn't offer MEV protection
  },
  {
    name: "bloXroute BDN",
    url: "https://bsc.blxrbdn.com",
    type: "dedicated",
    latency: { avgMs: 20, p50Ms: 15, p95Ms: 40, p99Ms: 70, region: "Global" },
    features: [
      "Ultra-low latency",
      "MEV bundles",
      "Private transactions",
      "~200ms faster mempool",
      "350+ DeFi firms",
    ],
    pricing: { name: "Professional", requestsPerSecond: 1000, monthlyPrice: 1250, currency: "USD" },
    mevProtection: true,
  },
  {
    name: "Chainstack",
    url: "https://bsc-mainnet.core.chainstack.com",
    type: "dedicated",
    latency: { avgMs: 40, p50Ms: 35, p95Ms: 80, p99Ms: 130, region: "Global" },
    features: ["Dedicated nodes", "Archive", "Elastic APIs"],
    pricing: { name: "Business", requestsPerSecond: 100, monthlyPrice: 349, currency: "USD" },
    mevProtection: false,
  },
  {
    name: "GetBlock",
    url: "https://bsc.getblock.io/mainnet",
    type: "dedicated",
    latency: { avgMs: 45, p50Ms: 40, p95Ms: 90, p99Ms: 140, region: "Global" },
    features: ["Shared nodes", "Dedicated option", "40+ chains"],
    pricing: { name: "Shared", requestsPerSecond: 60, monthlyPrice: 29, currency: "USD" },
    mevProtection: false,
  },
  {
    name: "NodeReal MegaNode",
    url: "https://bsc-mainnet.nodereal.io/v1",
    type: "dedicated",
    latency: { avgMs: 25, p50Ms: 20, p95Ms: 50, p99Ms: 80, region: "Asia" },
    features: ["Archive data", "Trace API", "High rate limits", "BSC focused"],
    pricing: { name: "Growth", requestsPerSecond: 300, monthlyPrice: 300, currency: "USD" },
    mevProtection: false,
  },
];

// ============ BSC MEV Relays ============

export const BSC_MEV_RELAYS: MevRelay[] = [
  {
    name: "bloXroute MEV Relay",
    url: "https://mev.api.blxrbdn.com",
    validators: 9,
    features: [
      "Bundle submission",
      "Block building",
      "Profit sharing",
      "~200ms faster mempool",
      "Guaranteed ordering",
      "No failed TX fees",
    ],
    bundleSubmission: true,
    pricing: "Professional tier: $1,250/month",
  },
  {
    name: "48 Club (Deprecated)",
    url: "https://puissant-bsc.48.club",
    validators: 0,
    features: ["Deprecated - use bloXroute instead"],
    bundleSubmission: false,
    pricing: "N/A - Deprecated",
  },
];

// ============ Node Requirements ============

export const BSC_NODE_REQUIREMENTS: NodeRequirements = {
  cpu: "16+ cores (AMD EPYC or Intel Xeon recommended)",
  ram: "64GB minimum, 128GB recommended",
  storage: "3TB+ NVMe SSD (grows ~1TB/year)",
  bandwidth: "1Gbps dedicated, 10TB+/month",
  os: "Ubuntu 22.04 LTS",
};

// ============ Cost Estimates ============

export const BSC_COST_ESTIMATE: CostEstimate = {
  selfHosted: {
    infrastructure: 500, // Dedicated server rental
    bandwidth: 100, // 10TB+ bandwidth
    maintenance: 200, // DevOps time
    total: 800,
    currency: "USD",
  },
  dedicated: {
    infrastructure: 1250, // bloXroute Professional
    bandwidth: 0, // Included
    maintenance: 50, // Monitoring only
    total: 1300,
    currency: "USD",
  },
  managed: {
    infrastructure: 349, // Chainstack Business
    bandwidth: 0,
    maintenance: 0,
    total: 349,
    currency: "USD",
  },
  optimal:
    "For MEV arbitrage: bloXroute BDN ($1,250/mo) - 200ms faster mempool access is critical for competitive advantage. For development/testing: Chainstack ($349/mo) or QuickNode ($49/mo).",
};

// ============ BSC Chain Configuration ============

export const BSC_INFRASTRUCTURE: ChainInfrastructure = {
  chainId: 56,
  name: "BNB Smart Chain",
  symbol: "BNB",
  blockTime: 3, // 3 seconds
  gasToken: "BNB",
  rpcEndpoints: BSC_RPC_ENDPOINTS,
  mevRelays: BSC_MEV_RELAYS,
  dexes: BSC_DEXES,
  nodeRequirements: BSC_NODE_REQUIREMENTS,
  costEstimate: BSC_COST_ESTIMATE,
};

// ============ Latency Optimization Strategies ============

export const LATENCY_OPTIMIZATION = {
  strategies: [
    {
      name: "Geographic Colocation",
      description:
        "Host infrastructure close to BSC validators (primarily Asia)",
      impact: "50-100ms reduction",
      cost: "High - requires Asia-based servers",
      implementation: [
        "Use Singapore/Hong Kong data centers",
        "NodeReal has strong Asia presence",
        "Hetzner Finland for EU fallback",
      ],
    },
    {
      name: "bloXroute BDN Integration",
      description:
        "Use bloXroute's Blockchain Distribution Network for faster propagation",
      impact: "~200ms faster than local nodes",
      cost: "$1,250/month Professional tier",
      implementation: [
        "Subscribe to bloXroute Professional",
        "Integrate their streaming API",
        "Use bundle submission for MEV",
      ],
    },
    {
      name: "Multiple RPC Fallback",
      description: "Race multiple RPCs and use fastest response",
      impact: "10-20ms reduction via parallelization",
      cost: "Low - multiple providers",
      implementation: [
        "Parallel requests to 3-5 endpoints",
        "Use fastest successful response",
        "Track latency metrics per provider",
      ],
    },
    {
      name: "WebSocket Subscriptions",
      description: "Use WebSocket for real-time block/tx updates vs polling",
      impact: "100-500ms reduction vs polling",
      cost: "None - same providers",
      implementation: [
        "Subscribe to newPendingTransactions",
        "Subscribe to newHeads for blocks",
        "Process in parallel streams",
      ],
    },
    {
      name: "Local Mempool",
      description: "Run full node for direct mempool access",
      impact: "20-50ms for mempool txs",
      cost: "$500-800/month self-hosted",
      implementation: [
        "Run BSC Geth or Erigon node",
        "Subscribe to pending transactions",
        "Combine with bloXroute for best of both",
      ],
    },
    {
      name: "Transaction Precomputation",
      description: "Pre-build transactions for known opportunities",
      impact: "50-100ms on execution",
      cost: "None - code optimization",
      implementation: [
        "Pre-compute swap calldata",
        "Maintain nonce tracking",
        "Use flashbots-style bundles",
      ],
    },
  ],
  priorityOrder: [
    "bloXroute BDN Integration (highest ROI)",
    "WebSocket Subscriptions",
    "Multiple RPC Fallback",
    "Transaction Precomputation",
    "Geographic Colocation",
    "Local Mempool (advanced)",
  ],
};

// ============ Competitor Tracking ============

export const COMPETITOR_TRACKING = {
  methods: [
    {
      name: "Mempool Monitoring",
      description: "Track pending transactions from known bot addresses",
      dataSource: "bloXroute mempool stream",
    },
    {
      name: "Block Analysis",
      description: "Analyze executed transactions for MEV patterns",
      dataSource: "BSC blocks via RPC",
    },
    {
      name: "EigenPhi Integration",
      description: "Use EigenPhi's MEV database for historical analysis",
      dataSource: "https://eigenphi.io/mev/bsc",
    },
    {
      name: "Address Labeling",
      description: "Maintain database of known bot addresses",
      dataSource: "Etherscan labels + manual research",
    },
  ],
  visualizationForMouse: {
    description: "Competitor dashboard components for MOUSE to design",
    components: [
      {
        name: "Competitor Leaderboard",
        description: "Top MEV bots by 24h profit",
        data: "Address, profit, volume, success rate",
      },
      {
        name: "Real-time Bot Activity",
        description: "Live feed of competitor transactions",
        data: "TX hash, type, profit, gas used",
      },
      {
        name: "Market Share Pie Chart",
        description: "MEV profit distribution by bot",
        data: "Bot address -> % of total MEV",
      },
      {
        name: "Strategy Heatmap",
        description: "Which DEXes each bot targets",
        data: "Bot -> DEX -> frequency",
      },
      {
        name: "Gas Price Analysis",
        description: "Competitor gas bidding patterns",
        data: "Bot -> avg gas premium -> time",
      },
    ],
  },
};

// ============ Implementation Roadmap ============

export const IMPLEMENTATION_ROADMAP = {
  phase1: {
    name: "Foundation",
    duration: "Week 1",
    tasks: [
      "Set up QuickNode/Chainstack for development ($49-349/mo)",
      "Implement multi-RPC fallback system",
      "Configure WebSocket subscriptions",
      "Deploy to Singapore-based server",
    ],
    cost: "$400-700",
  },
  phase2: {
    name: "MEV Infrastructure",
    duration: "Week 2",
    tasks: [
      "Subscribe to bloXroute Professional ($1,250/mo)",
      "Integrate bloXroute mempool stream",
      "Implement bundle submission",
      "Set up transaction precomputation",
    ],
    cost: "$1,250",
  },
  phase3: {
    name: "Optimization",
    duration: "Week 3",
    tasks: [
      "Benchmark latency across all endpoints",
      "Implement adaptive routing",
      "Set up Prometheus/Grafana monitoring",
      "Fine-tune gas strategies",
    ],
    cost: "$0 (engineering time)",
  },
  phase4: {
    name: "Production",
    duration: "Week 4+",
    tasks: [
      "Deploy to production infrastructure",
      "Enable automatic failover",
      "Set up 24/7 monitoring/alerting",
      "Begin live trading with small amounts",
    ],
    cost: "Ongoing: ~$1,600/month",
  },
  totalMonthlyBudget: {
    minimum: "$400/month (development only)",
    recommended: "$1,600/month (competitive MEV)",
    optimal: "$2,500/month (full infrastructure with redundancy)",
  },
};

// ============ THE ARCHITECT Agent Class ============

export class Architect {
  private logger?: Logger;

  constructor(logger?: Logger) {
    this.logger = logger;
  }

  /**
   * Get BSC infrastructure configuration
   */
  getBscInfrastructure(): ChainInfrastructure {
    return BSC_INFRASTRUCTURE;
  }

  /**
   * Get all BSC DEXes
   */
  getBscDexes(): DexInfo[] {
    return BSC_DEXES;
  }

  /**
   * Get DEXes by type
   */
  getDexesByType(type: "amm" | "orderbook" | "aggregator"): DexInfo[] {
    return BSC_DEXES.filter((d) => d.type === type);
  }

  /**
   * Get top DEXes by volume
   */
  getTopDexesByVolume(limit: number = 5): DexInfo[] {
    // Sort by extracting numeric value from volume string
    return [...BSC_DEXES]
      .filter((d) => d.type === "amm") // Only AMMs have TVL
      .sort((a, b) => {
        const aVol = parseFloat(a.volume24h.replace(/[^0-9.]/g, "")) || 0;
        const bVol = parseFloat(b.volume24h.replace(/[^0-9.]/g, "")) || 0;
        return bVol - aVol;
      })
      .slice(0, limit);
  }

  /**
   * Get RPC endpoints sorted by latency
   */
  getRpcEndpointsByLatency(): RpcEndpoint[] {
    return [...BSC_RPC_ENDPOINTS].sort(
      (a, b) => a.latency.avgMs - b.latency.avgMs
    );
  }

  /**
   * Get MEV-enabled endpoints
   */
  getMevEndpoints(): RpcEndpoint[] {
    return BSC_RPC_ENDPOINTS.filter((e) => e.mevProtection);
  }

  /**
   * Get latency optimization strategies
   */
  getLatencyOptimizations(): typeof LATENCY_OPTIMIZATION {
    return LATENCY_OPTIMIZATION;
  }

  /**
   * Get cost estimate
   */
  getCostEstimate(): CostEstimate {
    return BSC_COST_ESTIMATE;
  }

  /**
   * Get implementation roadmap
   */
  getImplementationRoadmap(): typeof IMPLEMENTATION_ROADMAP {
    return IMPLEMENTATION_ROADMAP;
  }

  /**
   * Get competitor tracking methods
   */
  getCompetitorTracking(): typeof COMPETITOR_TRACKING {
    return COMPETITOR_TRACKING;
  }

  /**
   * Generate infrastructure report
   */
  generateInfrastructureReport(): string {
    const dexes = this.getBscDexes();
    const rpcs = this.getRpcEndpointsByLatency();
    const costs = this.getCostEstimate();
    const roadmap = this.getImplementationRoadmap();

    return `
# THE ARCHITECT - BSC Infrastructure Report

## Executive Summary

BSC (BNB Smart Chain) is the recommended starting chain due to:
- **Low gas fees**: ~$0.05 per transaction vs $5-50 on Ethereum
- **Fast blocks**: 3-second block time
- **High volume**: $13B+ daily DEX volume
- **MEV opportunity**: Higher profits than Ethereum per bloXroute research

---

## DEX Landscape (${dexes.length} DEXes)

### Top AMMs by Volume

| DEX | Fee | TVL | 24h Volume | Pairs |
|-----|-----|-----|------------|-------|
${this.getTopDexesByVolume(5)
  .map((d) => `| ${d.name} | ${d.fee / 100}% | ${d.tvl} | ${d.volume24h} | ${d.pairs} |`)
  .join("\n")}

### Aggregators (Best Price Routing)

${dexes
  .filter((d) => d.type === "aggregator")
  .map((d) => `- **${d.name}**: ${d.features.join(", ")}`)
  .join("\n")}

---

## RPC Endpoints (by Latency)

| Provider | Type | Avg Latency | MEV | Price |
|----------|------|-------------|-----|-------|
${rpcs
  .slice(0, 6)
  .map(
    (r) =>
      `| ${r.name} | ${r.type} | ${r.latency.avgMs}ms | ${r.mevProtection ? "Yes" : "No"} | ${r.pricing ? `$${r.pricing.monthlyPrice}/mo` : "Free"} |`
  )
  .join("\n")}

### Recommended: bloXroute BDN
- **200ms faster** mempool access than local nodes
- Bundle submission for MEV
- 9 integrated validators
- $1,250/month Professional tier

---

## MEV Infrastructure

### Available Relays

| Relay | Validators | Bundle Support | Status |
|-------|------------|----------------|--------|
| bloXroute MEV Relay | 9 | Yes | Active |
| 48 Club Puissant | 0 | No | Deprecated |

### MEV Advantages on BSC
- Sandwich attacks yield higher profits than arbitrage
- Less competition than Ethereum
- bloXroute integration provides significant edge

---

## Cost Analysis

| Tier | Monthly Cost | Best For |
|------|--------------|----------|
| Development | $${costs.managed.total} | Testing, learning |
| Competitive | $${costs.dedicated.total} | Active arbitrage |
| Optimal | $2,500 | Maximum edge |

**Recommendation**: ${costs.optimal}

---

## Implementation Roadmap

### ${roadmap.phase1.name} (${roadmap.phase1.duration})
${roadmap.phase1.tasks.map((t) => `- ${t}`).join("\n")}
Cost: ${roadmap.phase1.cost}

### ${roadmap.phase2.name} (${roadmap.phase2.duration})
${roadmap.phase2.tasks.map((t) => `- ${t}`).join("\n")}
Cost: ${roadmap.phase2.cost}

### ${roadmap.phase3.name} (${roadmap.phase3.duration})
${roadmap.phase3.tasks.map((t) => `- ${t}`).join("\n")}
Cost: ${roadmap.phase3.cost}

### ${roadmap.phase4.name} (${roadmap.phase4.duration})
${roadmap.phase4.tasks.map((t) => `- ${t}`).join("\n")}
Cost: ${roadmap.phase4.cost}

---

## Latency Optimization Priority

${LATENCY_OPTIMIZATION.priorityOrder.map((s, i) => `${i + 1}. ${s}`).join("\n")}

---

## Competitor Visualization (for MOUSE)

Components to build:
${COMPETITOR_TRACKING.visualizationForMouse.components.map((c) => `- **${c.name}**: ${c.description}`).join("\n")}

---

*Generated by THE ARCHITECT - Node Infrastructure Agent*
    `.trim();
  }
}

// ============ Export ============

export default Architect;
