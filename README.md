# Matrix Flash Loan Arbitrage Bot

A high-performance, multi-agent flash loan arbitrage system for Ethereum and EVM-compatible chains.

## Current Status (December 2024)

| Component | Status | Notes |
|-----------|--------|-------|
| Rust Core (6 agents) | Working | 18 tests passing |
| Solidity Contracts | Deployed | Sepolia testnet, verified |
| TypeScript Agents | Working | Build passing |
| Python Analysis | Working | 82 tests, 87% coverage |
| C++ Hot Path | Scaffolded | Headers only |
| CI/CD | Configured | GitHub Actions |
| Monitoring | Configured | Prometheus/Grafana |
| Docker Compose | Ready | Full stack defined |

### Deployed Contracts (Sepolia Testnet)

| Contract | Address | Explorer |
|----------|---------|----------|
| FlashLoanReceiver | `0x5c5b7CC9518206E91071F9C1B04Ebe32Ec31d5c7` | [Etherscan](https://sepolia.etherscan.io/address/0x5c5b7CC9518206E91071F9C1B04Ebe32Ec31d5c7#code) |
| MultiDexRouter | `0x78700C3B41D73167125Ee52DCB6346Bba97Eb7Ac` | [Etherscan](https://sepolia.etherscan.io/address/0x78700C3B41D73167125Ee52DCB6346Bba97Eb7Ac#code) |

**Owner**: `0xADD694d04A52DfB212e965F1A3A61F30d2F7B694`

## Features

- **Multi-Chain Support**: Ethereum, Arbitrum, Optimism, Base, BSC
- **Ultra-Low Latency**: Sub-100ms end-to-end execution
- **MEV Protection**: Flashbots integration for private transactions
- **AI-Enhanced**: LLM-powered research agents for each component
- **Fault Tolerant**: OTP-style supervision with automatic recovery
- **Comprehensive Monitoring**: Prometheus, Grafana, Jaeger

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    THE MATRIX                                 │
│                                                              │
│   ┌─────────┐    ┌─────────┐    ┌─────────┐                │
│   │   NEO   │────│ ORACLE  │────│ TRINITY │                │
│   │  Rust   │    │ Python  │    │  Rust   │                │
│   └────┬────┘    └────┬────┘    └────┬────┘                │
│        │              │              │                       │
│   ┌────┴────┐    ┌────┴────┐    ┌────┴────┐                │
│   │MORPHEUS │    │  SATI   │    │ SERAPH  │                │
│   │  Rust   │    │ Python  │    │  Rust   │                │
│   └─────────┘    └─────────┘    └─────────┘                │
│                                                              │
│            ┌─────────────────────────┐                      │
│            │      C++ HOT PATH       │                      │
│            │  <100μs Latency         │                      │
│            └─────────────────────────┘                      │
└──────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Rust 1.75+ (with `cargo`)
- Node.js 20+ (with `pnpm`)
- Python 3.11+ (with `pip`)
- Docker & Docker Compose (optional, for full stack)
- Foundry (`forge`, `cast`, `anvil`)
- CMake 3.20+ (for C++)

### Installation

```bash
# Clone repository
git clone https://github.com/DAD16/flash-loan-arbitrage-bot.git
cd flash-loan-arbitrage-bot

# Install Rust dependencies
cd core && cargo build && cd ..

# Install TypeScript dependencies
cd agents && pnpm install && cd ..

# Install Python dependencies
cd analysis && pip install -e ".[dev]" && cd ..

# Install Solidity dependencies
cd contracts && forge install && cd ..
```

### Running Tests

```bash
# Rust tests (18 tests)
cd core && cargo test

# Solidity tests (7 tests including fuzz)
cd contracts && forge test -vvv

# TypeScript build
cd agents && pnpm run build

# Python tests (82 tests)
cd analysis && python -m pytest -v
```

### Configuration

Create a `.env` file:

```bash
# RPC URLs
ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
ARB_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY

# Execution
PRIVATE_KEY=your_private_key  # 64 hex characters (32 bytes)
FLASHBOTS_AUTH_KEY=your_flashbots_key

# API Keys
ETHERSCAN_API_KEY=your_etherscan_key

# Risk Parameters
MATRIX_MAX_POSITION_SIZE=50
MATRIX_MAX_GAS_PRICE_GWEI=300
```

### Deploy Contracts

```bash
# Set environment variables
export PRIVATE_KEY="0x..."
export SEPOLIA_RPC_URL="https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY"

# Deploy to Sepolia
cd contracts
forge script script/Deploy.s.sol:DeployScript \
    --rpc-url $SEPOLIA_RPC_URL \
    --private-key $PRIVATE_KEY \
    --broadcast

# Verify on Etherscan
forge verify-contract <ADDRESS> src/FlashLoanReceiver.sol:FlashLoanReceiver \
    --chain sepolia \
    --etherscan-api-key $ETHERSCAN_API_KEY
```

## Project Structure

```
├── hotpath/          # C++ ultra-low latency code (scaffolded)
├── core/             # Rust core agents (working)
│   ├── neo/          # Orchestrator
│   ├── morpheus/     # Market data
│   ├── dozer/        # Data pipeline
│   ├── trinity/      # Execution + Flashbots
│   ├── seraph/       # Validation
│   └── cypher/       # Risk management
├── agents/           # TypeScript coordination agents (working)
│   ├── merovingian/  # Mempool monitoring
│   ├── keymaker/     # Secrets management
│   └── link/         # Message routing
├── analysis/         # Python analysis agents (working)
│   ├── oracle/       # Price aggregation
│   ├── sati/         # ML models
│   ├── persephone/   # Sentiment
│   └── rama_kandra/  # Fundamentals
├── contracts/        # Solidity smart contracts (deployed)
├── monitoring/       # Prometheus/Grafana configs
├── deploy/           # Docker/Ansible deployment
├── deployments/      # Deployed contract addresses
├── config/           # Application configs
└── docs/             # Documentation
```

## Agents

| Agent | Role | Language | Status |
|-------|------|----------|--------|
| NEO | Orchestrator | Rust | Working |
| MORPHEUS | Market Data | Rust | Working |
| DOZER | Data Pipeline | Rust | Working |
| TRINITY | Execution + Flashbots | Rust | Working |
| SERAPH | Validation | Rust | Working |
| CYPHER | Risk Management | Rust | Working |
| ORACLE | Price Analysis | Python | Working |
| SATI | ML Models | Python | Working |
| PERSEPHONE | Sentiment | Python | Working |
| RAMA-KANDRA | Fundamentals | Python | Working |
| MEROVINGIAN | Mempool | TypeScript | Working |
| KEYMAKER | Secrets | TypeScript | Working |
| LINK | Communication | TypeScript | Working |

## Performance Targets

| Metric | Target |
|--------|--------|
| Hot Path Latency | <100μs |
| End-to-End (Arbitrum) | <80ms |
| End-to-End (Ethereum) | <120ms |
| TX Success Rate | >25% |
| System Uptime | 99.9% |

## Monitoring

- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3000 (admin/admin)
- **Jaeger**: http://localhost:16686
- **Kafka UI**: http://localhost:8080

Dashboards configured in `monitoring/tank/grafana/dashboards/`.

## Testing

```bash
# Rust (18 tests)
cd core && cargo test

# Solidity with fork (7 tests)
cd contracts
ETH_RPC_URL="https://eth-mainnet.g.alchemy.com/v2/KEY" forge test -vvv

# TypeScript
cd agents && pnpm run build

# Python (82 tests, 87% coverage)
cd analysis && python -m pytest -v --cov
```

## CI/CD

GitHub Actions workflows in `.github/workflows/`:
- `ci.yml` - Build and test all components
- `deploy.yml` - Multi-chain deployment

## Security

- All contracts audited before mainnet deployment
- Circuit breaker for automatic trade halting
- MEV protection via Flashbots
- Risk limits enforced at multiple layers
- No external calls to untrusted contracts

## Next Steps

1. Install Docker Desktop for local stack testing
2. Test flash loan execution on Sepolia with AAVE testnet tokens
3. Deploy to additional testnets (Arbitrum Sepolia)
4. Implement C++ hot path
5. Production deployment after thorough testing

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Disclaimer

This software is for educational purposes only. Flash loan arbitrage carries significant financial risk. Use at your own risk and always test thoroughly on testnets before deploying real capital.
