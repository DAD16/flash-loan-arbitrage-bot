/**
 * Matrix Command Center - Type Definitions
 * Designed by: THE ARCHITECT + MOUSE
 */

// ============================================================================
// ENUMS
// ============================================================================

export type Chain = 'bsc' | 'ethereum' | 'arbitrum' | 'optimism' | 'base';

export type TxStatus = 'pending' | 'success' | 'failed' | 'reverted';

export type OpportunityStatus =
  | 'detected'
  | 'evaluating'
  | 'executing'
  | 'completed'
  | 'skipped'
  | 'failed';

export type ConfidenceLevel = 'low' | 'medium' | 'high' | 'very_high';

export type RecommendationStatus = 'pending' | 'applied' | 'dismissed' | 'expired';

export type SeverityLevel = 'info' | 'warning' | 'critical';

// ============================================================================
// COMPETITORS
// ============================================================================

export interface Competitor {
  id: string;
  address: string;
  chain: Chain;
  label?: string;
  isWatched: boolean;
  firstSeenAt: Date;
  lastActiveAt?: Date;
  totalProfitWei: bigint;
  totalTransactions: number;
  successRate: number;
  avgProfitPerTxWei: bigint;
  rank?: number;
  notes?: string;
}

export interface CompetitorTransaction {
  id: string;
  competitorId: string;
  chain: Chain;
  txHash: string;
  blockNumber: number;
  blockTimestamp: Date;
  routeTokens: string[];
  routeDexes: string[];
  profitWei: bigint;
  profitUsd: number;
  gasUsed: number;
  gasPriceWei: bigint;
  gasCostWei: bigint;
  netProfitWei: bigint;
  status: TxStatus;
  revertReason?: string;
  opportunityType?: string;
  isFlashloan: boolean;
}

export interface CompetitorStrategy {
  competitorId: string;
  analysisPeriodStart: Date;
  analysisPeriodEnd: Date;
  topTokenPairs: Array<{
    pair: string;
    count: number;
    profit: string;
    percentage: number;
  }>;
  dexUsage: Record<string, number>;
  avgGasPriceGwei: number;
  maxGasPriceGwei: number;
  minGasPriceGwei: number;
  activeHours: Record<string, number>;
  successRate: number;
  avgProfitPerTxWei: bigint;
}

// ============================================================================
// OPPORTUNITIES
// ============================================================================

export interface Opportunity {
  id: string;
  chain: Chain;
  routeTokens: string[];
  routeTokenSymbols: string[];
  routeDexes: string[];
  expectedProfitWei: bigint;
  expectedProfitUsd: number;
  expectedGasWei: bigint;
  expectedNetProfitWei: bigint;
  confidence: ConfidenceLevel;
  confidenceScore: number;
  detectedAt: Date;
  validUntil?: Date;
  status: OpportunityStatus;
  executionId?: string;
  skipReason?: string;
  priceData?: Record<string, number>;
  liquidityData?: Record<string, number>;
}

export interface Execution {
  id: string;
  opportunityId?: string;
  chain: Chain;
  txHash?: string;
  blockNumber?: number;
  blockTimestamp?: Date;
  routeTokens: string[];
  routeTokenSymbols: string[];
  routeDexes: string[];
  expectedProfitWei: bigint;
  actualProfitWei?: bigint;
  gasUsed?: number;
  gasPriceWei?: bigint;
  gasCostWei?: bigint;
  netProfitWei?: bigint;
  netProfitUsd?: number;
  expectedSlippageBps: number;
  actualSlippageBps?: number;
  status: TxStatus;
  revertReason?: string;
  errorMessage?: string;
  submittedAt?: Date;
  confirmedAt?: Date;
  executionTimeMs?: number;
  competingTxHashes?: string[];
  wasFrontrun: boolean;
  frontrunnerAddress?: string;
}

// ============================================================================
// STRATEGY
// ============================================================================

export interface StrategyConfig {
  chain: Chain;

  // Profit thresholds
  minProfitWei: bigint;
  targetProfitWei: bigint;
  maxPositionWei: bigint;

  // Gas strategy
  baseGasGwei: number;
  maxGasGwei: number;
  priorityFeeGwei: number;

  // Automation rules
  autoExecuteThresholdWei: bigint;
  minConfidenceForAutoExecute: number;
  requireManualApproval: boolean;

  // Dynamic gas rules
  increaseGasOnCompetitor: boolean;
  useMinGasWhenLowCongestion: boolean;
  matchTopCompetitorGas: boolean;

  // Token pairs
  enabledPairs: TokenPairConfig[];
  autoDiscoverPairs: boolean;
  alertOnCompetitorPair: boolean;

  // DEX routing
  dexConfigs: DexConfig[];

  // Risk controls
  hourlyLossLimitWei: bigint;
  dailyLossLimitWei: bigint;
  circuitBreakerEnabled: boolean;
  maxConsecutiveFailures: number;
  pauseOnLowSuccessRate: boolean;
  minSuccessRateThreshold: number;
}

export interface TokenPairConfig {
  baseToken: string;
  quoteToken: string;
  symbol: string;
  enabled: boolean;
  priority: 'high' | 'medium' | 'low';
  minLiquidityUsd: number;
  maxSlippageBps: number;
}

export interface DexConfig {
  name: string;
  routerAddress: string;
  enabled: boolean;
  priority: number;
  maxSlippageBps: number;
}

// ============================================================================
// AI INSIGHTS
// ============================================================================

export interface Recommendation {
  id: string;
  chain?: Chain;
  category: string;
  priority: SeverityLevel;
  title: string;
  description: string;
  evidence?: Record<string, unknown>;
  suggestedAction?: Record<string, unknown>;
  expectedImpact: string;
  expectedProfitIncreasePct?: number;
  status: RecommendationStatus;
  appliedAt?: Date;
  dismissedAt?: Date;
  dismissedReason?: string;
  wasValidated?: boolean;
  validationResult?: Record<string, unknown>;
  actualImpactPct?: number;
  createdAt: Date;
  expiresAt?: Date;
}

export interface Pattern {
  id: string;
  chain?: Chain;
  patternType: string;
  name: string;
  description?: string;
  patternData: Record<string, unknown>;
  confidenceScore: number;
  analysisStart?: Date;
  analysisEnd?: Date;
  isActive: boolean;
  lastValidatedAt?: Date;
}

export interface FailureAnalysis {
  category: string;
  count: number;
  percentage: number;
  suggestion: string;
}

// ============================================================================
// METRICS & AGGREGATES
// ============================================================================

export interface DailyPerformance {
  date: Date;
  chain: Chain;
  totalOpportunities: number;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  skippedOpportunities: number;
  grossProfitWei: bigint;
  gasSpentWei: bigint;
  netProfitWei: bigint;
  netProfitUsd: number;
  successRate: number;
  avgProfitPerTxWei: bigint;
  ourRank?: number;
  topCompetitorProfitWei?: bigint;
  profitByPair?: Record<string, number>;
  profitByDex?: Record<string, number>;
}

export interface HourlyMetrics {
  hourStart: Date;
  chain: Chain;
  opportunitiesDetected: number;
  executionsAttempted: number;
  executionsSuccessful: number;
  grossProfitWei: bigint;
  netProfitWei: bigint;
  avgGasPriceGwei: number;
  avgExecutionTimeMs: number;
  competitorActivityCount: number;
}

// ============================================================================
// DASHBOARD STATE
// ============================================================================

export interface DashboardState {
  selectedChain: Chain;
  isLiveMode: boolean;
  lastUpdated: Date;

  // Key metrics
  totalProfitWei: bigint;
  profit24hWei: bigint;
  successRate: number;
  activeExecutionCount: number;
  ourRank: number;

  // Agent health
  agentHealth: Record<string, 'online' | 'offline' | 'syncing'>;

  // Current opportunities
  pendingOpportunities: Opportunity[];
  activeExecutions: Execution[];

  // Competitor snapshot
  topCompetitors: Competitor[];
}

// ============================================================================
// API RESPONSES
// ============================================================================

export interface LeaderboardResponse {
  competitors: Competitor[];
  ourRank: number;
  totalCompetitors: number;
  timeframe: string;
}

export interface OpportunityFeedResponse {
  opportunities: Opportunity[];
  hasMore: boolean;
  cursor?: string;
}

export interface AIInsightsResponse {
  recommendations: Recommendation[];
  patterns: Pattern[];
  failureAnalysis: FailureAnalysis[];
  lastAnalyzedAt: Date;
}
