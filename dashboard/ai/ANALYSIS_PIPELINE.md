# AI Analysis Pipeline

**Designed by**: THE ARCHITECT + SATI (ML Agent)
**Version**: 1.0.0

---

## Overview

The AI analysis pipeline processes historical data to generate actionable insights and recommendations.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AI ANALYSIS PIPELINE                                 │
└─────────────────────────────────────────────────────────────────────────────┘

    DATA SOURCES                ANALYSIS                    OUTPUT
    ────────────                ────────                    ──────

 ┌──────────────┐          ┌──────────────┐          ┌──────────────┐
 │ Competitor   │          │   Pattern    │          │  Strategy    │
 │ Transactions │────────► │  Detection   │────────► │ Recommend.   │
 └──────────────┘          └──────────────┘          └──────────────┘
        │                         │                         │
        ▼                         ▼                         ▼
 ┌──────────────┐          ┌──────────────┐          ┌──────────────┐
 │     Our      │          │  Competitor  │          │   Alerts &   │
 │  Executions  │────────► │   Analysis   │────────► │   Warnings   │
 └──────────────┘          └──────────────┘          └──────────────┘
        │                         │                         │
        ▼                         ▼                         ▼
 ┌──────────────┐          ┌──────────────┐          ┌──────────────┐
 │   Market     │          │   Failure    │          │   Learning   │
 │    Data      │────────► │   Analysis   │────────► │   Insights   │
 └──────────────┘          └──────────────┘          └──────────────┘
```

---

## Analysis Types

### 1. Competitor Strategy Analysis

**Frequency**: Every 4 hours
**Purpose**: Understand what successful bots are doing

```python
class CompetitorAnalyzer:
    """
    Analyzes competitor behavior to extract strategy insights.
    """

    def analyze_competitor(self, address: str, period_days: int = 7) -> CompetitorStrategy:
        """
        Extract strategy patterns from a competitor's transactions.

        Returns:
        - Token pair preferences (which pairs they trade most)
        - DEX usage distribution (which DEXes they prefer)
        - Gas strategy (avg/max/min gas prices)
        - Timing patterns (active hours)
        - Success rate and avg profit
        """
        pass

    def compare_with_us(self, competitor_strategy: CompetitorStrategy) -> Comparison:
        """
        Compare competitor strategy with our current strategy.

        Returns gaps and opportunities:
        - Pairs they trade that we don't
        - DEXes they use more effectively
        - Gas strategy differences
        - Timing alignment
        """
        pass
```

**Output**: `ai_recommendations` table entries

### 2. Pattern Detection

**Frequency**: Daily
**Purpose**: Identify recurring patterns in market behavior

```python
class PatternDetector:
    """
    Detects patterns in historical data.
    """

    PATTERN_TYPES = [
        'timing_pattern',      # Peak activity hours
        'gas_pattern',         # Optimal gas prices
        'liquidity_pattern',   # Liquidity fluctuations
        'competitor_pattern',  # When competitors are active
        'success_pattern',     # What makes trades succeed
        'failure_pattern',     # What causes failures
    ]

    def detect_timing_pattern(self, period_days: int = 30) -> TimingPattern:
        """
        Find optimal trading hours.

        Analyzes:
        - Hourly opportunity distribution
        - Success rate by hour
        - Competitor activity by hour
        - Net profit by hour

        Returns:
        - Peak hours (high opportunity, high success)
        - Off-peak hours (less competition)
        - Avoid hours (high competition, low success)
        """
        pass

    def detect_gas_pattern(self, period_days: int = 7) -> GasPattern:
        """
        Find optimal gas strategy.

        Analyzes:
        - Gas price vs success rate correlation
        - Gas price vs net profit correlation
        - Competitor gas behavior
        - Network congestion patterns

        Returns:
        - Optimal base gas range
        - When to increase gas
        - When to decrease gas
        - Competition response strategy
        """
        pass

    def detect_token_pattern(self, period_days: int = 14) -> TokenPattern:
        """
        Find optimal token pairs.

        Analyzes:
        - Pair profitability over time
        - Pair liquidity trends
        - Competitor focus on pairs
        - New emerging pairs

        Returns:
        - High-value stable pairs
        - Emerging opportunity pairs
        - Pairs to avoid (too competitive)
        """
        pass
```

**Output**: `patterns` table entries

### 3. Failure Analysis

**Frequency**: Real-time (after each failure) + Daily summary
**Purpose**: Learn from mistakes

```python
class FailureAnalyzer:
    """
    Analyzes failed transactions to understand root causes.
    """

    FAILURE_CATEGORIES = [
        'slippage_exceeded',    # Price moved too much
        'outbid',               # Competitor won
        'insufficient_liquidity', # Not enough liquidity
        'contract_revert',      # Contract error
        'gas_too_low',          # Ran out of gas
        'timeout',              # Took too long
        'frontrun',             # We were frontrun
    ]

    def categorize_failure(self, execution: Execution) -> FailureCategory:
        """
        Determine the root cause of a failure.

        Analyzes:
        - Revert reason
        - Block analysis (other txs)
        - Price movement during execution
        - Gas comparison with competitors
        """
        pass

    def generate_fix_recommendation(self, failures: List[Failure]) -> Recommendation:
        """
        Generate recommendation to fix recurring failures.

        Example outputs:
        - "Reduce slippage tolerance from 0.5% to 0.3% on BiSwap"
        - "Increase gas by 20% for opportunities > 0.05 BNB"
        - "Add liquidity depth check before execution"
        """
        pass
```

**Output**: `ai_recommendations` table entries

### 4. Real-Time Opportunity Scoring

**Frequency**: Real-time (for each opportunity)
**Purpose**: Score opportunities for execution decision

```python
class OpportunityScorer:
    """
    Scores opportunities in real-time for execution decisions.
    """

    def score_opportunity(self, opportunity: Opportunity) -> Score:
        """
        Calculate confidence score (0-100) for an opportunity.

        Factors:
        - Historical success rate for similar trades
        - Current liquidity depth
        - Recent price volatility
        - Competitor activity in mempool
        - Gas price environment
        - Time since detection

        Returns:
        - confidence_score: 0-100
        - confidence_level: low/medium/high/very_high
        - risk_factors: list of concerns
        - recommendation: execute/skip/manual_review
        """
        pass
```

**Output**: Enriches `opportunities` table

---

## LLM Integration

### Strategy Recommendation Generation

```python
class LLMAdvisor:
    """
    Uses LLM to generate human-readable recommendations.
    """

    def generate_recommendation(
        self,
        analysis_data: AnalysisData,
        our_strategy: Strategy,
        competitor_strategies: List[CompetitorStrategy]
    ) -> Recommendation:
        """
        Generate a strategic recommendation using LLM.

        Prompt structure:
        1. Current performance summary
        2. Competitor comparison
        3. Detected patterns
        4. Recent failures

        LLM generates:
        - Clear recommendation title
        - Detailed explanation
        - Expected impact
        - Implementation steps
        """

        prompt = f"""
        You are an MEV strategy advisor for a flash loan arbitrage bot on BSC.

        ## Current Performance (Last 7 Days)
        - Total Profit: {analysis_data.total_profit} BNB
        - Success Rate: {analysis_data.success_rate}%
        - Our Rank: #{analysis_data.our_rank}

        ## Top Competitor Analysis
        {self._format_competitor_analysis(competitor_strategies)}

        ## Detected Patterns
        {self._format_patterns(analysis_data.patterns)}

        ## Recent Failures
        {self._format_failures(analysis_data.failures)}

        ## Current Strategy
        {self._format_strategy(our_strategy)}

        Based on this analysis, provide ONE specific, actionable recommendation
        to improve our performance. Focus on the highest-impact change.

        Format your response as:
        TITLE: [Short title]
        PRIORITY: [high/medium/low]
        DESCRIPTION: [Detailed explanation]
        ACTION: [Specific change to make]
        EXPECTED_IMPACT: [Quantified impact if possible]
        """

        return self._call_llm(prompt)
```

### Natural Language Queries

```python
class NLQueryHandler:
    """
    Handle natural language questions about performance.
    """

    def answer_question(self, question: str) -> Answer:
        """
        Answer questions like:
        - "Why did we lose money yesterday?"
        - "Which competitor should we watch?"
        - "What's our best performing pair?"
        - "Should we increase gas prices?"
        """
        pass
```

---

## Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ANALYSIS SCHEDULER                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
            ┌───────────────────────┼───────────────────────┐
            ▼                       ▼                       ▼
    ┌───────────────┐       ┌───────────────┐       ┌───────────────┐
    │   Real-Time   │       │    Hourly     │       │    Daily      │
    │   Scoring     │       │   Analysis    │       │   Analysis    │
    └───────────────┘       └───────────────┘       └───────────────┘
            │                       │                       │
            ▼                       ▼                       ▼
    ┌───────────────┐       ┌───────────────┐       ┌───────────────┐
    │  Opportunity  │       │  Competitor   │       │   Pattern     │
    │   Enricher    │       │   Tracker     │       │   Detector    │
    └───────────────┘       └───────────────┘       └───────────────┘
            │                       │                       │
            └───────────────────────┼───────────────────────┘
                                    ▼
                          ┌───────────────┐
                          │     LLM       │
                          │   Advisor     │
                          └───────────────┘
                                    │
                                    ▼
                          ┌───────────────┐
                          │ Recommendation│
                          │    Store      │
                          └───────────────┘
```

---

## Data Flow

### 1. Data Ingestion

```python
class DataIngester:
    """
    Ingests data from various sources into the database.
    """

    async def ingest_competitor_transactions(self):
        """
        Fetch and store competitor transactions from chain.

        Sources:
        - BSCScan API (recent transactions)
        - Direct RPC queries (real-time)
        - Mempool monitoring (via MEROVINGIAN)
        """
        pass

    async def ingest_our_executions(self):
        """
        Store our execution results from TRINITY/SERAPH.
        """
        pass

    async def ingest_market_data(self):
        """
        Store market data from ORACLE.

        Data:
        - Token prices
        - Liquidity depths
        - Gas prices
        """
        pass
```

### 2. Aggregation Jobs

```sql
-- Hourly aggregation job
INSERT INTO hourly_metrics (hour_start, chain, ...)
SELECT
    date_trunc('hour', block_timestamp) as hour_start,
    chain,
    COUNT(*) as opportunities_detected,
    COUNT(*) FILTER (WHERE status = 'success') as executions_successful,
    SUM(net_profit_wei) as net_profit_wei,
    AVG(gas_price_wei) / 1e9 as avg_gas_price_gwei
FROM executions
WHERE block_timestamp > NOW() - INTERVAL '1 hour'
GROUP BY date_trunc('hour', block_timestamp), chain;

-- Daily aggregation job
INSERT INTO daily_performance (date, chain, ...)
SELECT
    date_trunc('day', block_timestamp)::date as date,
    chain,
    ...
FROM executions
WHERE block_timestamp > NOW() - INTERVAL '1 day'
GROUP BY date_trunc('day', block_timestamp), chain;
```

---

## Implementation Priority

### Phase 1: Data Collection (Week 1)
- [ ] Competitor transaction ingestion
- [ ] Our execution logging
- [ ] Basic aggregation jobs

### Phase 2: Pattern Detection (Week 2)
- [ ] Timing pattern detector
- [ ] Gas pattern detector
- [ ] Success/failure correlation

### Phase 3: Competitor Analysis (Week 3)
- [ ] Strategy extraction
- [ ] Comparison with our strategy
- [ ] Watch list management

### Phase 4: LLM Integration (Week 4)
- [ ] Recommendation generation
- [ ] Natural language queries
- [ ] Insight summarization

### Phase 5: Real-Time Scoring (Week 5)
- [ ] Opportunity enrichment
- [ ] Dynamic confidence scoring
- [ ] Execution decision support

---

## API Endpoints

```typescript
// Analysis API
GET  /api/analysis/competitor/:address    // Get competitor analysis
GET  /api/analysis/patterns               // Get detected patterns
GET  /api/analysis/failures               // Get failure analysis
POST /api/analysis/query                  // Natural language query

// Recommendations API
GET  /api/recommendations                 // List all recommendations
POST /api/recommendations/:id/apply       // Apply a recommendation
POST /api/recommendations/:id/dismiss     // Dismiss a recommendation

// Insights API
GET  /api/insights/summary                // Daily summary
GET  /api/insights/comparison             // Us vs competitors
GET  /api/insights/opportunities          // Opportunity analysis
```

---

## Configuration

```yaml
# ai/config.yaml
analysis:
  competitor:
    update_interval: 4h
    min_transactions: 10
    lookback_days: 30

  patterns:
    update_interval: 24h
    min_confidence: 0.7
    lookback_days: 30

  failures:
    immediate_analysis: true
    summary_interval: 24h

  scoring:
    min_confidence_for_auto_execute: 0.8
    factors:
      historical_success: 0.3
      liquidity_depth: 0.2
      price_volatility: 0.15
      competitor_activity: 0.15
      gas_environment: 0.1
      time_sensitivity: 0.1

llm:
  provider: anthropic  # or openai
  model: claude-3-opus-20240229
  max_tokens: 1000
  temperature: 0.3
```
