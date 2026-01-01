# CLAUDE.md - Python Analysis Agents

This file scopes Claude Code to the Python analysis agents only.

## Scope

**This instance owns:**
- `analysis/oracle/` - Price aggregation & arbitrage detection
- `analysis/sati/` - ML models for prediction
- `analysis/persephone/` - Sentiment analysis
- `analysis/rama_kandra/` - Fundamentals analysis
- `analysis/shared/` - Shared Python utilities (OWNER)
- `analysis/pyproject.toml` - Dependencies & config
- `analysis/README.md` - Documentation

## Off-Limits (DO NOT MODIFY)

- `../core/` - Rust agents (different instance)
- `../agents/` - TypeScript agents (different instance)
- `../contracts/` - Solidity contracts (different instance)
- `../dashboard/` - Dashboard UI (different instance)
- `../hotpath/` - C++ hot path (different instance)
- `../memory.md` - Root instance only
- `../CLAUDE.md` - Root instance only
- `../.env` - Root instance only

## Shared Resources

### `analysis/shared/`
This instance OWNS shared Python utilities:
- Common types and models
- Database connections
- Kafka client wrappers

### Kafka Topics
Python agents consume/produce:
- `matrix.prices` - Consume from MORPHEUS (Rust)
- `matrix.opportunities` - Produce arbitrage opportunities
- `matrix.predictions` - ML predictions from SATI
- `matrix.sentiment` - Sentiment data from PERSEPHONE

## Build & Test Commands

```bash
# Install dependencies
pip install -e .
# or
poetry install

# Test all (82 tests, 87% coverage)
python -m pytest -v

# Test with coverage
python -m pytest -v --cov

# Test single module
python -m pytest oracle/tests/ -v
python -m pytest sati/tests/ -v

# Lint
ruff check .
mypy .

# Format
black .
ruff check --fix .
```

## Agent Responsibilities

| Agent | Purpose | Key Files |
|-------|---------|-----------|
| ORACLE | Price aggregation, arbitrage detection | `oracle/src/aggregator.py`, `oracle/src/detector.py` |
| SATI | ML models, success prediction | `sati/src/models/` |
| PERSEPHONE | Sentiment analysis | `persephone/src/` |
| RAMA-KANDRA | Fundamentals analysis | `rama_kandra/src/` |

## Pending Project: Speed Optimization (ORACLE)

This scope owns ORACLE which needs optimization:
1. Faster price aggregation (sub-ms target)
2. Pre-computed profit tables
3. Direct integration with Rust MORPHEUS via Kafka
4. Caching layer for repeated calculations

## Test Coverage

Current: 87% coverage with 82 tests
- `oracle/`: Price aggregation tests
- `sati/`: ML model tests
- `persephone/`: Sentiment analysis tests
- `rama_kandra/`: Fundamentals tests

## Status Tracking

### STATUS.md (this scope's log)
Update `analysis/STATUS.md` as you work:
- Log actions in "Session Log" section
- Move items between In Progress / Completed / Blocked
- Add cross-scope requests when you need other instances

### state.json (global coordination)
Update your instance status in `../state.json`:
```json
"analysis": {
  "status": "working",           // idle | working | blocked | waiting_for_input
  "current_task": "Optimizing ORACLE price aggregation",
  "last_active": "2026-01-01T12:00:00Z"
}
```

### File Locking Protocol
Before modifying a shared file:
1. Check `../state.json` → `locked_files`
2. If not locked, add: `"analysis/shared/types.py": "analysis"`
3. Make your changes
4. Remove the lock when done

## Communication Protocol

When you need changes in other scopes:
1. Complete your work in this scope
2. Add request to "Cross-Scope Requests" in `analysis/STATUS.md`
3. The user will relay to the appropriate instance

### Common Cross-Scope Needs
- Need price feed changes? → Request from core instance (MORPHEUS)
- Need dashboard display? → Request from dashboard instance
- Need execution integration? → Request from core instance (TRINITY)
