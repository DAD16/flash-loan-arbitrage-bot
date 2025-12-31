# Agent Memory System

This directory contains persistent memory files for all Matrix agents. Each agent maintains its own memory file that persists across sessions.

## Memory Structure

Each agent's memory follows this schema:

```json
{
  "agent": "AGENT_NAME",
  "version": "1.0.0",
  "lastUpdated": "ISO-8601 timestamp",
  "context": {
    "currentFocus": "What the agent is currently focused on",
    "recentAnalyses": ["Recent work performed"],
    "openSuggestions": ["Suggestions not yet implemented"],
    "resolvedIssues": ["Issues that have been fixed"]
  },
  "knowledge": {
    "domain_specific": "Agent-specific knowledge base"
  },
  "history": [
    {
      "date": "ISO-8601 date",
      "action": "What was done",
      "result": "Outcome"
    }
  ]
}
```

## Usage

### Reading Agent Memory

Before invoking an agent, check its memory file:
```bash
cat agents/memory/<agent_name>.json
```

### Updating Agent Memory

After an agent provides analysis or suggestions:
1. Add new items to `recentAnalyses`
2. Update `openSuggestions` with new suggestions
3. Move resolved items to `resolvedIssues`
4. Update `lastUpdated` timestamp

### Cross-Agent Communication

Agents can read each other's memory for collaboration:
- LOCK can read ROLAND's audit findings
- MOUSE can read TANK's monitoring data
- NEO can read all agent states

## Agent Memory Files

| Agent | File | Purpose |
|-------|------|---------|
| NEO | `neo.json` | Orchestration state, agent health |
| MORPHEUS | `morpheus.json` | Data feed status, connection health |
| DOZER | `dozer.json` | Pipeline metrics, normalization rules |
| MEROVINGIAN | `merovingian.json` | Mempool patterns, opportunity stats |
| ORACLE | `oracle.json` | Price patterns, detection algorithms |
| SATI | `sati.json` | ML model performance, training data |
| PERSEPHONE | `persephone.json` | Sentiment trends, source reliability |
| RAMA-KANDRA | `rama_kandra.json` | TVL trends, protocol health scores |
| TRINITY | `trinity.json` | Execution stats, gas optimization |
| SERAPH | `seraph.json` | Validation accuracy, simulation data |
| KEYMAKER | `keymaker.json` | Secret rotation schedule, access logs |
| CYPHER | `cypher.json` | Risk events, circuit breaker history |
| LOCK | `lock.json` | Security findings, attack patterns |
| ROLAND | `roland.json` | Audit history, compliance status |
| AGENT SMITH | `agent_smith.json` | Test coverage, generated scenarios |
| NIOBE | `niobe.json` | CI/CD status, test results |
| GHOST | `ghost.json` | Bug patterns, static analysis results |
| TANK | `tank.json` | Alert history, metric anomalies |
| LINK | `link.json` | Message routing stats, queue health |
| MOUSE | `mouse.json` | UI research, design decisions |
