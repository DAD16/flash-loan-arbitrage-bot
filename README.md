# Matrix Flash Loan Arbitrage Bot

A high-performance, multi-agent flash loan arbitrage system for Ethereum and EVM-compatible chains.

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

- Rust 1.75+
- Node.js 20+
- Python 3.11+
- Docker & Docker Compose
- Foundry (for Solidity)
- CMake 3.20+ (for C++)

### Installation

```bash
# Clone repository
git clone https://github.com/your-org/flash-loan-arbitrage-bot.git
cd flash-loan-arbitrage-bot

# Install dependencies
make install

# Setup environment
cp .env.example .env
# Edit .env with your RPC URLs and API keys

# Start infrastructure
docker-compose up -d

# Build all components
make build
```

### Configuration

Create a `.env` file:

```bash
# RPC URLs
ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
ARB_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY
OP_RPC_URL=https://opt-mainnet.g.alchemy.com/v2/YOUR_KEY
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY
BSC_RPC_URL=https://bsc-dataseed.binance.org

# Execution
PRIVATE_KEY=your_private_key
FLASHBOTS_AUTH_KEY=your_flashbots_key

# Risk Parameters
MATRIX_MAX_POSITION_SIZE=50
MATRIX_MAX_GAS_PRICE_GWEI=300
```

### Running

```bash
# Development mode
make dev

# Production mode
make run

# Run specific agent
cd core && cargo run --bin neo
```

## Project Structure

```
├── hotpath/          # C++ ultra-low latency code
├── core/             # Rust core agents
├── agents/           # TypeScript coordination agents
├── analysis/         # Python analysis agents
├── contracts/        # Solidity smart contracts
├── monitoring/       # Prometheus/Grafana configs
├── deploy/           # Deployment configurations
├── config/           # Application configs
└── docs/             # Documentation
```

## Agents

| Agent | Role | Language |
|-------|------|----------|
| NEO | Orchestrator | Rust |
| MORPHEUS | Market Data | Rust |
| DOZER | Data Pipeline | Rust |
| TRINITY | Execution | Rust |
| SERAPH | Validation | Rust |
| CYPHER | Risk Management | Rust |
| ORACLE | Price Analysis | Python |
| SATI | ML Models | Python |
| PERSEPHONE | Sentiment | Python |
| RAMA-KANDRA | Fundamentals | Python |
| MEROVINGIAN | Mempool | TypeScript |
| KEYMAKER | Secrets | TypeScript |
| LINK | Communication | TypeScript |

## Performance

| Metric | Target |
|--------|--------|
| Hot Path Latency | <100μs |
| End-to-End (Arbitrum) | <80ms |
| End-to-End (Ethereum) | <120ms |
| TX Success Rate | >25% |
| System Uptime | 99.9% |

## Smart Contracts

Deploy contracts using Foundry:

```bash
cd contracts

# Deploy to testnet
forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC --broadcast

# Deploy to mainnet (with verification)
forge script script/Deploy.s.sol --rpc-url $ETH_RPC_URL --broadcast --verify
```

## Monitoring

- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3000 (admin/admin)
- **Jaeger**: http://localhost:16686
- **Kafka UI**: http://localhost:8080

## Testing

```bash
# Run all tests
make test

# Run specific tests
cd core && cargo test
cd contracts && forge test -vvv
cd agents && npm test
cd analysis && pytest
```

## Security

- All contracts audited before mainnet deployment
- Circuit breaker for automatic trade halting
- MEV protection via Flashbots
- Risk limits enforced at multiple layers
- No external calls to untrusted contracts

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
