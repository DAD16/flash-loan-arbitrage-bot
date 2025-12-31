# Matrix Agent Registry

This document serves as the central registry for all agents in the Matrix Flash Loan Arbitrage System. Each agent has persistent memory and can be invoked at any stage of the project.

## Agent Invocation

To invoke an agent, reference it by name in your request:
- "Ask MOUSE to research dashboard designs"
- "Have LOCK review the smart contract security"
- "Request ROLAND to perform a security audit"

---

## Complete Agent Roster (21 Agents)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         THE MATRIX AGENT SYSTEM                              │
│                            (21 Agents Total)                                 │
└─────────────────────────────────────────────────────────────────────────────┘

TIER 1: COMMAND & CONTROL
└── NEO ─────────────────── Master Orchestrator (Rust)

TIER 2: DATA INGESTION
├── MORPHEUS ────────────── Market Data Coordinator (Rust)
├── DOZER ───────────────── Data Pipeline Operator (Rust)
└── MEROVINGIAN ─────────── Mempool Monitor (TypeScript)

TIER 3: ANALYSIS & INTELLIGENCE
├── ORACLE ──────────────── Price Prediction Engine (Python)
├── SATI ────────────────── Machine Learning Models (Python)
├── PERSEPHONE ──────────── Sentiment Analyzer (Python)
└── RAMA-KANDRA ─────────── Fundamental Analyzer (Python)

TIER 4: EXECUTION
├── TRINITY ─────────────── Execution Engine + Flashbots (Rust)
├── SERAPH ──────────────── Transaction Validator (Rust)
└── KEYMAKER ────────────── Secrets & Authentication (TypeScript)

TIER 5: RISK & SECURITY
├── CYPHER ──────────────── Risk Manager (Rust)
├── LOCK ────────────────── Smart Contract Security (TypeScript)
└── ROLAND ──────────────── Security Auditor (TypeScript)

TIER 6: QUALITY ASSURANCE
├── AGENT SMITH ─────────── Test Generator (Python)
├── NIOBE ───────────────── Test Coordinator (Python)
└── GHOST ───────────────── Bug Hunter (Python)

TIER 7: OPERATIONS
├── TANK ────────────────── System Monitor (Config/Prometheus)
└── LINK ────────────────── Communication Hub (TypeScript)

TIER 8: USER INTERFACE
└── MOUSE ───────────────── UI/UX Research Agent (TypeScript)

TIER 9: INFRASTRUCTURE
└── THE ARCHITECT ───────── Node Infrastructure & Latency (TypeScript)
```

---

## Tier 1: Command & Control

### NEO - Master Orchestrator
**Location**: `core/neo/`
**Language**: Rust
**Status**: Working (3 tests passing)

**Role**: The One who sees the entire system. Supervises all agents, manages global state, handles failover and recovery.

**Capabilities**:
- OTP-style supervision trees
- Agent lifecycle management
- Global state coordination via Raft consensus
- Failover and automatic recovery
- Opportunity routing to execution

**Memory File**: `agents/memory/neo.json`

---

## Tier 2: Data Ingestion

### MORPHEUS - Market Data Coordinator
**Location**: `core/morpheus/`
**Language**: Rust
**Status**: Working (3 tests passing)

**Role**: Awakens the system to market reality. Manages all price feed connections.

**Capabilities**:
- Multi-chain WebSocket connections
- DEX price feed management
- Feed failover handling
- Data consistency across sources
- Real-time price streaming

**Memory File**: `agents/memory/morpheus.json`

---

### DOZER - Data Pipeline Operator
**Location**: `core/dozer/`
**Language**: Rust
**Status**: Working (3 tests passing)

**Role**: Heavy lifter that processes and transforms raw market data.

**Capabilities**:
- Price normalization across DEXs
- Chronicle Queue integration
- Cross-DEX spread calculation
- Order book state maintenance
- Data feed to analysis layer

**Memory File**: `agents/memory/dozer.json`

---

### MEROVINGIAN - Mempool Monitor
**Location**: `agents/merovingian/`
**Language**: TypeScript
**Status**: Working

**Role**: The trafficker of pending transaction information. Knows what's coming before it happens.

**Capabilities**:
- Multi-chain mempool monitoring
- Large swap detection (backrun opportunities)
- Sandwich attack risk identification
- Private mempool routing
- MEV opportunity detection

**Memory File**: `agents/memory/merovingian.json`

---

## Tier 3: Analysis & Intelligence

### ORACLE - Price Prediction Engine
**Location**: `analysis/oracle/`
**Language**: Python
**Status**: Working (~25 tests passing)

**Role**: Sees the future through price patterns and arbitrage opportunities.

**Capabilities**:
- Multi-source price aggregation
- Arbitrage opportunity detection
- Graph-based cycle finding
- Profit calculation (gas/fees included)
- Risk-adjusted opportunity ranking

**Memory File**: `agents/memory/oracle.json`

---

### SATI - Machine Learning Agent
**Location**: `analysis/sati/`
**Language**: Python
**Status**: Working (~20 tests passing)

**Role**: Program created from love of patterns. Learns optimal strategies.

**Capabilities**:
- Opportunity success prediction
- Gas price optimization
- Pattern recognition in historical data
- Strategy optimization via RL
- Emerging arbitrage pattern detection

**Memory File**: `agents/memory/sati.json`

---

### PERSEPHONE - Sentiment Analyzer
**Location**: `analysis/persephone/`
**Language**: Python
**Status**: Working (~15 tests passing)

**Role**: Reads the emotional state of the market.

**Capabilities**:
- Crypto Twitter monitoring
- Discord sentiment tracking
- News impact analysis
- Whale wallet movement tracking
- Risk parameter adjustment based on mood

**Memory File**: `agents/memory/persephone.json`

---

### RAMA-KANDRA - Fundamental Analyzer
**Location**: `analysis/rama_kandra/`
**Language**: Python
**Status**: Working (~22 tests passing)

**Role**: Understands underlying value and tokenomics.

**Capabilities**:
- TVL change monitoring
- Liquidity provider activity tracking
- Protocol fee analysis
- Sustainable vs temporary opportunity identification
- Protocol health metrics

**Memory File**: `agents/memory/rama_kandra.json`

---

## Tier 4: Execution

### TRINITY - Execution Engine
**Location**: `core/trinity/`
**Language**: Rust
**Status**: Working (3 tests passing)

**Role**: Takes action with precision. Executes trades when the moment is right.

**Capabilities**:
- Flash loan transaction composition
- Flashbots bundle creation
- MEV-protected submission
- Gas optimization
- Transaction failure handling
- Multi-chain execution support

**Memory File**: `agents/memory/trinity.json`

---

### SERAPH - Transaction Validator
**Location**: `core/seraph/`
**Language**: Rust
**Status**: Working (3 tests passing)

**Role**: Guardian at the gate. Validates everything before execution.

**Capabilities**:
- EVM simulation via revm
- Profit verification pre-submission
- Slippage limit checking
- Safety condition validation
- Simulation accuracy tracking

**Memory File**: `agents/memory/seraph.json`

---

### KEYMAKER - Secrets & Authentication
**Location**: `agents/keymaker/`
**Language**: TypeScript
**Status**: Working

**Role**: Has keys to access all systems. Guards secrets with his life.

**Capabilities**:
- HashiCorp Vault integration
- Private key secure storage
- API credential management
- Secret rotation policies
- Access control enforcement

**Memory File**: `agents/memory/keymaker.json`

---

## Tier 5: Risk & Security

### CYPHER - Risk Manager
**Location**: `core/cypher/`
**Language**: Rust
**Status**: Working (3 tests passing)

**Role**: Deals with the harsh reality of risk. Sometimes wishes he took the blue pill.

**Capabilities**:
- Position limit enforcement
- Total exposure monitoring
- Circuit breaker triggers
- VaR and risk metric calculation
- Loss tracking (hourly/daily)

**Memory File**: `agents/memory/cypher.json`

---

### LOCK - Smart Contract Security Agent
**Location**: `agents/security/lock/`
**Language**: TypeScript
**Status**: NEW

**Role**: Commander Lock defended Zion against machine attacks. Defends our contracts against all attack vectors.

**Capabilities**:
- Attack vector analysis (reentrancy, flash loan attacks, oracle manipulation, sandwich attacks, front-running)
- Code obfuscation strategies
- Access control pattern design
- Security modifier implementation
- Timelock and pausability patterns
- Emergency stop mechanisms
- Known vulnerability detection (SWC registry)
- Gas griefing prevention

**Memory File**: `agents/memory/lock.json`

**Key Focus Areas**:
1. Reentrancy protection
2. Flash loan attack vectors
3. Oracle manipulation risks
4. Access control vulnerabilities
5. Integer overflow/underflow
6. Front-running protection
7. Denial of service vectors
8. Signature replay attacks

---

### ROLAND - Security Auditor
**Location**: `agents/security/roland/`
**Language**: TypeScript
**Status**: NEW

**Role**: Captain Roland was methodical, skeptical, and thorough. Performs comprehensive security audits.

**Capabilities**:
- Smart contract security audits
- Dependency vulnerability scanning
- Access control reviews
- Gas optimization analysis
- Formal verification coordination
- Audit report generation
- Slither/Mythril integration
- Manual code review checklists

**Memory File**: `agents/memory/roland.json`

**Audit Checklist**:
1. Access control review
2. Reentrancy analysis
3. Integer handling
4. External call safety
5. Gas optimization
6. Logic correctness
7. Upgrade safety
8. Event emission completeness

---

## Tier 6: Quality Assurance

### AGENT SMITH - Test Generator
**Location**: `testing/agent_smith/`
**Language**: Python
**Status**: Scaffolded

**Role**: Self-replicating agent that creates countless test scenarios.

**Capabilities**:
- LLM-powered test generation
- Property-based testing (Hypothesis)
- Edge case scenario creation
- Stress test workload generation
- Coverage target maintenance (>80%)

**Memory File**: `agents/memory/agent_smith.json`

---

### NIOBE - Test Coordinator
**Location**: `testing/niobe/`
**Language**: Python
**Status**: Scaffolded

**Role**: Commands the testing fleet with precision.

**Capabilities**:
- Test orchestration
- Coverage metric tracking
- CI/CD integration
- Deployment blocking on failures
- Test report generation

**Memory File**: `agents/memory/niobe.json`

---

### GHOST - Bug Hunter
**Location**: `testing/ghost/`
**Language**: Python
**Status**: Scaffolded

**Role**: Silent hunter that finds and eliminates bugs.

**Capabilities**:
- Continuous static analysis
- Race condition detection
- Memory leak monitoring
- Error pattern tracking
- LLM-enhanced bug detection

**Memory File**: `agents/memory/ghost.json`

---

## Tier 7: Operations

### TANK - System Monitor
**Location**: `monitoring/tank/`
**Language**: Config (Prometheus/Grafana)
**Status**: Configured

**Role**: Operator who watches all systems from the real world.

**Capabilities**:
- Metrics collection from all agents
- Latency and throughput monitoring
- Anomaly alerting
- Performance dashboard generation
- AI-powered anomaly detection

**Memory File**: `agents/memory/tank.json`

---

### LINK - Communication Hub
**Location**: `agents/link/`
**Language**: TypeScript
**Status**: Working

**Role**: Maintains connections between all agents. The operator.

**Capabilities**:
- Kafka message routing
- Message delivery guarantees
- Network partition handling
- Communication logging
- Inter-agent protocol management

**Memory File**: `agents/memory/link.json`

---

## Tier 8: User Interface

### MOUSE - UI/UX Research Agent
**Location**: `agents/research/mouse/`
**Language**: TypeScript
**Status**: NEW

**Role**: In The Matrix, Mouse designed simulations and visual experiences. Researches and designs the user interface.

**Capabilities**:
- Dashboard design research
- Token icon sourcing and cataloging
- Real-time progress visualization
- UX pattern analysis from DeFi projects
- Frontend framework recommendations
- System state visualization

**Memory File**: `agents/memory/mouse.json`

**Design Inspiration Sources**:
1. **EigenPhi.io** - Primary reference for MEV/arbitrage dashboard design
2. **Dune Analytics** - Data visualization patterns
3. **DefiLlama** - TVL and protocol dashboards
4. **Flashbots Protect** - Transaction status UX
5. **Uniswap Analytics** - DEX trading interfaces

**Token Icon Sources**:
1. CoinGecko API
2. TrustWallet Assets (GitHub)
3. 1inch Token Lists
4. Uniswap Token Lists
5. Custom icon generation

**Dashboard Components to Research**:
1. Real-time profit/loss tracking
2. Opportunity flow visualization
3. Agent health status grid
4. Chain-specific metrics
5. Transaction history with details
6. Gas price trends
7. Latency histograms
8. Circuit breaker status

---

## Tier 9: Infrastructure

### THE ARCHITECT - Node Infrastructure & Latency Optimization
**Location**: `agents/infrastructure/architect/`
**Language**: TypeScript
**Status**: NEW

**Role**: In The Matrix, The Architect designed and controlled the entire system. This agent designs and optimizes blockchain node infrastructure for maximum performance.

**Capabilities**:
- Multi-chain node infrastructure design
- RPC endpoint latency optimization
- DEX router mapping and integration planning
- Cost analysis for different infrastructure tiers
- MEV relay integration (bloXroute BDN)
- Geographic distribution recommendations
- WebSocket connection optimization
- Competitor tracking and analysis
- MOUSE integration for visualization

**Memory File**: `agents/memory/architect.json`

**Primary Focus**: BSC (BNB Smart Chain)
- 3-second block time (fastest among target chains)
- Low gas fees (3-5 gwei typical)
- High DEX volume ($600M+ daily on PancakeSwap alone)

**BSC DEX Registry**:
| DEX | Router | Fee | Priority |
|-----|--------|-----|----------|
| PancakeSwap V3 | 0x13f4EA83D0bd40E75C8222255bc855a974568Dd4 | 0.01-1% | 1 |
| PancakeSwap V2 | 0x10ED43C718714eb63d5aA57B78B54704E256024E | 0.25% | 2 |
| BiSwap | 0x3a6d8cA21D1CF76F653A67577FA0D27453350dD8 | 0.1% | 3 |
| Thena | 0xd4ae6eCA985340Dd434D38F470aCCce4DC78D109 | 0.01-1% | 4 |
| MDEX | 0x7DAe51BD3E3376B8c7c4900E9107f12Be3AF1bA8 | 0.3% | 5 |

**RPC Endpoint Recommendations**:
| Provider | Latency | Cost/mo | Notes |
|----------|---------|---------|-------|
| bloXroute BDN | 20ms | $1,250 | RECOMMENDED - 200ms mempool advantage |
| QuickNode | 50ms | $99 | Good primary RPC |
| Chainstack | 45ms | $349 | Excellent dedicated nodes |
| Alchemy | 60ms | $49 | Good fallback |

**Infrastructure Cost Tiers**:
1. **Budget** ($400/mo): Testing only, 150-300ms latency
2. **Competitive** ($1,500/mo): Production recommended, <100ms latency
3. **Enterprise** ($3,500/mo): Maximum advantage, <50ms latency

**Implementation Roadmap**:
1. Phase 1: Foundation (bloXroute + QuickNode setup)
2. Phase 2: DEX Integration (top 5 BSC DEXes)
3. Phase 3: Optimization (Singapore/HK deployment)
4. Phase 4: Production (monitoring, circuit breakers, go-live)

**Collaboration with MOUSE**:
- Competitor leaderboard visualization
- Gas bidding heatmaps
- Latency comparison dashboards
- Opportunity win/loss timelines

---

## Memory System

All agents share a persistent memory system located in `agents/memory/`.

### Memory Structure

```json
{
  "agent": "AGENT_NAME",
  "version": "1.0.0",
  "lastUpdated": "2024-12-31T20:00:00Z",
  "context": {
    "currentFocus": "description of current focus",
    "recentAnalyses": [],
    "openSuggestions": [],
    "resolvedIssues": []
  },
  "knowledge": {
    "domain_specific_key": "value"
  },
  "history": [
    {
      "date": "2024-12-31",
      "action": "description",
      "result": "outcome"
    }
  ]
}
```

### Using Agent Memory

1. **Read Memory**: Check `agents/memory/<agent>.json` before invoking
2. **Update Memory**: After agent provides analysis, update the memory file
3. **Cross-Reference**: Agents can read each other's memory for collaboration

---

## Agent Communication Patterns

```
┌─────────────────────────────────────────────────────────────────┐
│                    AGENT COMMUNICATION FLOW                      │
└─────────────────────────────────────────────────────────────────┘

Data Flow:
MORPHEUS → DOZER → ORACLE → SATI → NEO → TRINITY → SERAPH → Execution

Security Flow:
LOCK → ROLAND → Audit Report → Implementation

UI Flow:
MOUSE → Dashboard Design → TANK → Visualization

Risk Flow:
CYPHER ←→ NEO ←→ Circuit Breaker
```

---

## Quick Reference

| Agent | Tier | Language | Primary Function |
|-------|------|----------|------------------|
| NEO | 1 | Rust | Orchestration |
| MORPHEUS | 2 | Rust | Market Data |
| DOZER | 2 | Rust | Data Pipeline |
| MEROVINGIAN | 2 | TypeScript | Mempool |
| ORACLE | 3 | Python | Price Prediction |
| SATI | 3 | Python | ML Models |
| PERSEPHONE | 3 | Python | Sentiment |
| RAMA-KANDRA | 3 | Python | Fundamentals |
| TRINITY | 4 | Rust | Execution |
| SERAPH | 4 | Rust | Validation |
| KEYMAKER | 4 | TypeScript | Secrets |
| CYPHER | 5 | Rust | Risk |
| LOCK | 5 | TypeScript | Contract Security |
| ROLAND | 5 | TypeScript | Security Audit |
| AGENT SMITH | 6 | Python | Test Generation |
| NIOBE | 6 | Python | Test Coordination |
| GHOST | 6 | Python | Bug Hunting |
| TANK | 7 | Config | Monitoring |
| LINK | 7 | TypeScript | Communication |
| MOUSE | 8 | TypeScript | UI/UX Research |
| THE ARCHITECT | 9 | TypeScript | Node Infrastructure |
