/**
 * MOUSE - UI/UX Research Agent
 *
 * Named after Mouse from The Matrix who designed simulations and visual experiences
 * (including the woman in the red dress). This agent researches and designs the
 * user interface for the Matrix Flash Loan Arbitrage system.
 *
 * Primary Responsibilities:
 * - Dashboard design research
 * - Token icon sourcing and cataloging
 * - Real-time progress visualization
 * - UX pattern analysis from DeFi projects
 * - System state visualization
 *
 * Task Persistence:
 * - Uses AgentBase for crash-safe task logging
 * - Call onStartup() to recover incomplete tasks
 * - Call receiveTask() when given a new research task
 */

import { Logger } from "winston";
import { z } from "zod";
import { AgentBase, AgentStartupResult } from "../../../shared/src/agentBase.js";
import type { AgentTask } from "../../../shared/src/taskQueue.js";

// ============ Types ============

export interface MouseConfig {
  /** Primary design inspiration source */
  primaryInspiration: string;
  /** Token icon API endpoints */
  tokenIconSources: TokenIconSource[];
  /** Dashboard components to research */
  dashboardComponents: string[];
  /** UI frameworks to evaluate */
  frameworkCandidates: string[];
}

export interface TokenIconSource {
  name: string;
  type: "api" | "github" | "cdn";
  url: string;
  priority: number;
}

export interface DashboardDesign {
  name: string;
  description: string;
  components: DashboardComponent[];
  colorScheme: ColorScheme;
  layout: LayoutConfig;
}

export interface DashboardComponent {
  id: string;
  name: string;
  type: ComponentType;
  description: string;
  dataSource: string;
  refreshRate: number; // milliseconds
  priority: "critical" | "high" | "medium" | "low";
}

export type ComponentType =
  | "metric_card"
  | "chart"
  | "table"
  | "status_indicator"
  | "timeline"
  | "heatmap"
  | "flow_diagram"
  | "alert_panel";

export interface ColorScheme {
  name: string;
  primary: string;
  secondary: string;
  success: string;
  warning: string;
  danger: string;
  background: string;
  surface: string;
  text: string;
}

export interface LayoutConfig {
  type: "grid" | "flex" | "dashboard";
  columns: number;
  responsive: boolean;
  breakpoints: Record<string, number>;
}

export interface TokenIcon {
  symbol: string;
  name: string;
  address: string;
  chainId: number;
  logoURI: string;
  source: string;
}

export interface DesignInspiration {
  source: string;
  url: string;
  features: string[];
  screenshots: string[];
  notes: string;
}

// ============ Configuration ============

export const DEFAULT_CONFIG: MouseConfig = {
  primaryInspiration: "https://eigenphi.io",
  tokenIconSources: [
    {
      name: "CoinGecko",
      type: "api",
      url: "https://api.coingecko.com/api/v3",
      priority: 1,
    },
    {
      name: "TrustWallet Assets",
      type: "github",
      url: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains",
      priority: 2,
    },
    {
      name: "1inch Token List",
      type: "api",
      url: "https://tokens.1inch.io/v1.2",
      priority: 3,
    },
    {
      name: "Uniswap Token List",
      type: "api",
      url: "https://tokens.uniswap.org",
      priority: 4,
    },
  ],
  dashboardComponents: [
    "profit_loss_tracker",
    "opportunity_flow",
    "agent_health_grid",
    "chain_metrics",
    "transaction_history",
    "gas_price_chart",
    "latency_histogram",
    "circuit_breaker_status",
  ],
  frameworkCandidates: ["React", "Vue 3", "Svelte", "SolidJS"],
};

// ============ Design Inspirations ============

export const DESIGN_INSPIRATIONS: DesignInspiration[] = [
  {
    source: "EigenPhi",
    url: "https://eigenphi.io",
    features: [
      "Real-time MEV transaction tracking",
      "Arbitrage opportunity visualization",
      "Profit/loss analytics",
      "Transaction flow diagrams",
      "Dark theme with neon accents",
      "Live updating tables",
      "Token pair analytics",
      "Historical performance charts",
    ],
    screenshots: [],
    notes:
      "PRIMARY INSPIRATION - Best-in-class MEV/arbitrage dashboard. Study their transaction flow visualization, profit tracking, and real-time updates.",
  },
  {
    source: "Dune Analytics",
    url: "https://dune.com",
    features: [
      "Customizable dashboards",
      "SQL-based queries",
      "Chart variety (line, bar, pie, area)",
      "Embed functionality",
      "Community sharing",
    ],
    screenshots: [],
    notes:
      "Great for data visualization patterns and chart designs. Study their query builder UX.",
  },
  {
    source: "DefiLlama",
    url: "https://defillama.com",
    features: [
      "TVL tracking across chains",
      "Protocol comparison",
      "Clean data tables",
      "Chain selector UI",
      "Historical charts",
    ],
    screenshots: [],
    notes: "Good reference for multi-chain data presentation and protocol analytics.",
  },
  {
    source: "Flashbots Protect",
    url: "https://protect.flashbots.net",
    features: [
      "Transaction status tracking",
      "MEV protection visualization",
      "Simple, focused UI",
      "Status indicators",
    ],
    screenshots: [],
    notes: "Clean UX for transaction submission and status tracking.",
  },
  {
    source: "Uniswap Analytics",
    url: "https://info.uniswap.org",
    features: [
      "Pool analytics",
      "Token pair charts",
      "Volume/TVL metrics",
      "Transaction history",
    ],
    screenshots: [],
    notes: "Reference for DEX-specific analytics and pool visualization.",
  },
];

// ============ Dashboard Design Specification ============

export const MATRIX_DASHBOARD_DESIGN: DashboardDesign = {
  name: "Matrix Command Center",
  description:
    "Real-time dashboard for monitoring the Matrix Flash Loan Arbitrage system",
  colorScheme: {
    name: "Matrix Dark",
    primary: "#00ff41", // Matrix green
    secondary: "#008f11",
    success: "#00ff41",
    warning: "#ffb800",
    danger: "#ff0040",
    background: "#0d0d0d",
    surface: "#1a1a1a",
    text: "#e0e0e0",
  },
  layout: {
    type: "dashboard",
    columns: 12,
    responsive: true,
    breakpoints: {
      sm: 640,
      md: 768,
      lg: 1024,
      xl: 1280,
      "2xl": 1536,
    },
  },
  components: [
    {
      id: "total_profit",
      name: "Total Profit",
      type: "metric_card",
      description: "Cumulative profit from all arbitrage executions",
      dataSource: "neo.metrics.total_profit",
      refreshRate: 1000,
      priority: "critical",
    },
    {
      id: "active_opportunities",
      name: "Active Opportunities",
      type: "metric_card",
      description: "Number of opportunities currently being evaluated",
      dataSource: "oracle.opportunities.active",
      refreshRate: 500,
      priority: "critical",
    },
    {
      id: "execution_success_rate",
      name: "Success Rate",
      type: "metric_card",
      description: "Percentage of successful arbitrage executions",
      dataSource: "trinity.metrics.success_rate",
      refreshRate: 5000,
      priority: "high",
    },
    {
      id: "circuit_breaker_status",
      name: "Circuit Breaker",
      type: "status_indicator",
      description: "Current state of the risk circuit breaker",
      dataSource: "cypher.circuit_breaker.status",
      refreshRate: 1000,
      priority: "critical",
    },
    {
      id: "agent_health_grid",
      name: "Agent Health",
      type: "heatmap",
      description: "Health status of all 20 Matrix agents",
      dataSource: "neo.agents.health",
      refreshRate: 5000,
      priority: "high",
    },
    {
      id: "opportunity_flow",
      name: "Opportunity Flow",
      type: "flow_diagram",
      description: "Visual flow of opportunities through the system",
      dataSource: "link.messages.flow",
      refreshRate: 1000,
      priority: "high",
    },
    {
      id: "profit_chart",
      name: "Profit Over Time",
      type: "chart",
      description: "Historical profit chart with hourly/daily/weekly views",
      dataSource: "neo.metrics.profit_history",
      refreshRate: 60000,
      priority: "medium",
    },
    {
      id: "gas_price_chart",
      name: "Gas Prices",
      type: "chart",
      description: "Real-time gas prices across all supported chains",
      dataSource: "morpheus.gas.prices",
      refreshRate: 15000,
      priority: "medium",
    },
    {
      id: "latency_histogram",
      name: "Execution Latency",
      type: "chart",
      description: "Distribution of end-to-end execution latency",
      dataSource: "trinity.metrics.latency",
      refreshRate: 30000,
      priority: "medium",
    },
    {
      id: "transaction_history",
      name: "Recent Transactions",
      type: "table",
      description: "Table of recent arbitrage executions with details",
      dataSource: "trinity.transactions.recent",
      refreshRate: 5000,
      priority: "high",
    },
    {
      id: "chain_metrics",
      name: "Chain Performance",
      type: "table",
      description: "Per-chain metrics (opportunities, success rate, profit)",
      dataSource: "neo.chains.metrics",
      refreshRate: 30000,
      priority: "medium",
    },
    {
      id: "alerts_panel",
      name: "System Alerts",
      type: "alert_panel",
      description: "Real-time alerts from all agents",
      dataSource: "tank.alerts.active",
      refreshRate: 1000,
      priority: "critical",
    },
  ],
};

// ============ Token Icon Research ============

export const TOKEN_ICON_RESEARCH = {
  primarySources: [
    {
      name: "CoinGecko API",
      url: "https://api.coingecko.com/api/v3/coins/{id}",
      pros: ["Comprehensive", "Free tier available", "Regular updates"],
      cons: ["Rate limited", "Requires coin ID mapping"],
      implementation: `
// Example: Fetch token icon from CoinGecko
const response = await axios.get(
  'https://api.coingecko.com/api/v3/coins/ethereum'
);
const iconUrl = response.data.image.large;
      `,
    },
    {
      name: "TrustWallet Assets",
      url: "https://github.com/trustwallet/assets",
      pros: ["Open source", "Direct CDN access", "Chain-organized"],
      cons: ["May not have all tokens", "Manual updates"],
      implementation: `
// Example: Direct CDN URL for token icon
const chainName = 'ethereum';
const tokenAddress = '0x...';
const iconUrl = \`https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/\${chainName}/assets/\${tokenAddress}/logo.png\`;
      `,
    },
    {
      name: "1inch Token List",
      url: "https://tokens.1inch.io/v1.2/{chainId}",
      pros: ["Per-chain lists", "Includes logoURI", "Well-maintained"],
      cons: ["Limited to 1inch supported tokens"],
      implementation: `
// Example: Fetch all tokens for a chain
const chainId = 1; // Ethereum
const response = await axios.get(
  \`https://tokens.1inch.io/v1.2/\${chainId}\`
);
// Returns map of address -> token info including logoURI
      `,
    },
  ],
  fallbackStrategy: `
// Token icon fallback chain:
// 1. Check local cache
// 2. Try CoinGecko
// 3. Try TrustWallet CDN
// 4. Try 1inch token list
// 5. Generate identicon from address
// 6. Use generic token placeholder
  `,
  cachingStrategy: `
// Cache token icons locally:
// - Store in IndexedDB for browser
// - Store in Redis for server
// - CDN for production deployment
// - TTL: 24 hours for known tokens, 1 hour for new tokens
  `,
};

// ============ UI Framework Evaluation ============

export const FRAMEWORK_EVALUATION = {
  React: {
    pros: [
      "Largest ecosystem",
      "Most DeFi dashboards use React",
      "Excellent charting libraries (Recharts, Victory)",
      "TradingView integration available",
      "Strong TypeScript support",
    ],
    cons: ["Bundle size", "Boilerplate for state management"],
    recommended: true,
    libraries: [
      "Recharts - for charts",
      "TanStack Table - for data tables",
      "Framer Motion - for animations",
      "Tailwind CSS - for styling",
      "Zustand - for state management",
      "React Query - for data fetching",
    ],
  },
  Vue3: {
    pros: ["Smaller bundle", "Composition API", "Good performance"],
    cons: ["Smaller DeFi ecosystem", "Fewer pre-built components"],
    recommended: false,
    libraries: [],
  },
  Svelte: {
    pros: ["Smallest bundle", "No virtual DOM", "Great performance"],
    cons: ["Smallest ecosystem", "Limited charting options"],
    recommended: false,
    libraries: [],
  },
  SolidJS: {
    pros: ["Best performance", "React-like syntax"],
    cons: ["Very small ecosystem", "Limited tooling"],
    recommended: false,
    libraries: [],
  },
};

// ============ MOUSE Agent Class ============

export class Mouse extends AgentBase {
  private config: MouseConfig;
  private logger?: Logger;

  constructor(config: Partial<MouseConfig> = {}, logger?: Logger) {
    super('MOUSE');
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  /**
   * Initialize MOUSE and recover any incomplete tasks from previous session.
   * Call this on startup before doing any work.
   *
   * @returns Startup result with crashed/pending tasks and current task
   */
  async initialize(): Promise<AgentStartupResult> {
    const result = await this.onStartup();

    if (result.currentTask) {
      this.logger?.info(`MOUSE resuming task: ${result.currentTask.taskDescription}`);
    }

    return result;
  }

  /**
   * Start a new research task. The task is saved IMMEDIATELY to disk
   * before this method returns, ensuring crash recovery.
   *
   * @param description - What to research
   * @param rawInput - The original user request (optional)
   * @returns The created task with ID
   */
  async startResearch(
    description: string,
    rawInput?: string
  ): Promise<AgentTask> {
    const task = await this.receiveTask(description, {
      rawInput: rawInput || description,
      priority: 'normal',
      metadata: { type: 'research' },
    });

    // Mark as in progress
    await this.startTask(task.id);

    return task;
  }

  /**
   * Complete the current research task with findings.
   *
   * @param findings - Summary of research findings
   */
  async finishResearch(findings: string): Promise<void> {
    await this.completeTask(undefined, findings);
  }

  /**
   * Get what MOUSE is currently working on.
   * Reads from TaskQueue, NOT from memory file.
   */
  async whatAmIWorkingOn(): Promise<string | null> {
    const task = await this.getCurrentTask();
    if (task) {
      return task.taskDescription;
    }
    return null;
  }

  /**
   * Get the primary design inspiration
   */
  getPrimaryInspiration(): DesignInspiration {
    return DESIGN_INSPIRATIONS.find((d) => d.url === this.config.primaryInspiration)!;
  }

  /**
   * Get all design inspirations
   */
  getAllInspirations(): DesignInspiration[] {
    return DESIGN_INSPIRATIONS;
  }

  /**
   * Get the recommended dashboard design
   */
  getDashboardDesign(): DashboardDesign {
    return MATRIX_DASHBOARD_DESIGN;
  }

  /**
   * Get token icon sources in priority order
   */
  getTokenIconSources(): TokenIconSource[] {
    return [...this.config.tokenIconSources].sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get framework recommendation
   */
  getFrameworkRecommendation(): {
    recommended: string;
    evaluation: typeof FRAMEWORK_EVALUATION;
  } {
    return {
      recommended: "React",
      evaluation: FRAMEWORK_EVALUATION,
    };
  }

  /**
   * Generate a research report
   */
  generateResearchReport(): string {
    const inspiration = this.getPrimaryInspiration();
    const design = this.getDashboardDesign();
    const framework = this.getFrameworkRecommendation();

    return `
# MOUSE UI/UX Research Report

## Primary Inspiration: ${inspiration.source}
URL: ${inspiration.url}

### Key Features to Implement:
${inspiration.features.map((f) => `- ${f}`).join("\n")}

### Notes:
${inspiration.notes}

## Dashboard Design: ${design.name}

### Color Scheme: ${design.colorScheme.name}
- Primary: ${design.colorScheme.primary}
- Background: ${design.colorScheme.background}
- Success: ${design.colorScheme.success}
- Danger: ${design.colorScheme.danger}

### Components (${design.components.length} total):
${design.components.map((c) => `- [${c.priority.toUpperCase()}] ${c.name}: ${c.description}`).join("\n")}

## Recommended Framework: ${framework.recommended}

### Why ${framework.recommended}:
${FRAMEWORK_EVALUATION[framework.recommended as keyof typeof FRAMEWORK_EVALUATION].pros.map((p) => `- ${p}`).join("\n")}

### Recommended Libraries:
${FRAMEWORK_EVALUATION[framework.recommended as keyof typeof FRAMEWORK_EVALUATION].libraries.map((l) => `- ${l}`).join("\n")}

## Token Icon Strategy:
${this.getTokenIconSources()
  .map((s) => `${s.priority}. ${s.name} (${s.type})`)
  .join("\n")}

## Next Steps:
1. Study EigenPhi.io dashboard in detail
2. Set up React + TypeScript project structure
3. Implement token icon fetching with fallback chain
4. Build core dashboard components
5. Integrate with agent metrics endpoints
6. Add real-time WebSocket updates
7. Implement dark Matrix theme
    `.trim();
  }
}

// ============ Export ============

export default Mouse;
