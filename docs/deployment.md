# Matrix Flash Loan Arbitrage Bot - Deployment Guide

## Prerequisites

1. **Foundry** - Install from https://getfoundry.sh
2. **Node.js 20+** with pnpm
3. **Rust** toolchain (stable)
4. **Python 3.11+** with uv
5. **Docker** and Docker Compose

## Environment Setup

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Fill in the required values:
   - RPC URLs for each chain (Alchemy/QuickNode recommended)
   - Private key for deployment (use a dedicated deployer wallet)
   - API keys for block explorers

## Testnet Deployment

### Step 1: Get Testnet ETH

- **Sepolia**: https://sepoliafaucet.com or https://faucet.sepolia.dev
- **Arbitrum Sepolia**: https://faucet.arbitrum.io

### Step 2: Deploy Contracts

```bash
# Set environment variables
export SEPOLIA_RPC_URL="https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY"
export PRIVATE_KEY="0x..."  # Deployer private key

# Deploy to Sepolia
./scripts/deploy-testnet.sh sepolia

# Deploy to Arbitrum Sepolia
export ARBITRUM_SEPOLIA_RPC_URL="https://arb-sepolia.g.alchemy.com/v2/YOUR_KEY"
./scripts/deploy-testnet.sh arbitrum-sepolia
```

### Step 3: Verify Deployment

Deployed addresses will be saved to `deployments/<chain>.json`.

## Mainnet Deployment

**WARNING**: Mainnet deployment involves real funds. Exercise extreme caution.

### Pre-Deployment Checklist

- [ ] All tests pass
- [ ] Contracts audited (recommended)
- [ ] Simulation tested thoroughly
- [ ] Circuit breakers configured
- [ ] Monitoring and alerting set up
- [ ] Emergency procedures documented
- [ ] Wallet security verified

### Deploy to Mainnet

```bash
# Set environment variables
export ETH_RPC_URL="https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY"
export PRIVATE_KEY="0x..."  # Use hardware wallet or secure key management

# Deploy (modify deploy script for mainnet)
cd contracts
forge script script/Deploy.s.sol:DeployScript \
    --rpc-url $ETH_RPC_URL \
    --private-key $PRIVATE_KEY \
    --broadcast \
    --verify
```

## Docker Deployment

### Development

```bash
# Start infrastructure (Postgres, Redis, Kafka, monitoring)
docker-compose up -d

# Start with dev tools (Anvil, Kafka UI, Redis Commander)
docker-compose --profile dev up -d

# Start agents
docker-compose --profile agents up -d
```

### Production

For production, use the bare-metal deployment for latency-critical components:

1. **Bare Metal**: C++ hot path, Rust core, Redis (local)
2. **Docker**: Python agents, TypeScript agents, monitoring

See `deploy/bare-metal/` for Ansible playbooks.

## Configuration

### Chain Configuration

Edit `config/chains/<chain>.yaml`:

```yaml
chain_id: 1
name: ethereum
rpc_url: ${ETH_RPC_URL}
ws_url: ${ETH_WS_URL}
flash_loan_provider: aave_v3
flash_loan_address: "0x..."
dexes:
  - id: uniswap_v3
    router: "0x..."
    factory: "0x..."
```

### Risk Parameters

Edit `config/production.yaml`:

```yaml
risk:
  max_position_size_eth: 50
  max_total_exposure_eth: 200
  max_gas_price_gwei: 300
  min_profit_eth: 0.001
  max_slippage_bps: 100
  circuit_breaker:
    max_loss_per_hour_eth: 1.0
    max_consecutive_failures: 5
```

## Monitoring

### Grafana Dashboards

Access at http://localhost:3000 (default: admin/admin)

Available dashboards:
- **Matrix Overview**: Key metrics, profit, latency
- **Agent Health**: Per-agent status and metrics
- **Chain Performance**: Per-chain opportunities and execution

### Prometheus Alerts

Configure alerts in `monitoring/tank/prometheus/rules/alerts.yml`.

Critical alerts include:
- Agent down
- Execution failures
- Negative profit
- Circuit breaker triggered

### Alertmanager

Configure notification channels in `monitoring/tank/alerts/alertmanager.yml`:
- Slack
- PagerDuty
- Email
- Webhooks

## Troubleshooting

### Common Issues

1. **RPC rate limiting**: Use multiple RPC providers with fallback
2. **Transaction reverts**: Check simulation before execution
3. **Mempool disconnection**: Verify WebSocket URLs and reconnection logic
4. **High latency**: Check network connectivity, consider colocation

### Logs

```bash
# View agent logs
docker-compose logs -f oracle

# View all logs
docker-compose logs -f
```

### Health Checks

```bash
# Check agent status
curl http://localhost:8000/health

# Check Prometheus targets
curl http://localhost:9090/api/v1/targets
```

## Security

### Key Management

- Never commit private keys
- Use HashiCorp Vault in production (Keymaker agent)
- Rotate keys periodically
- Use separate wallets for deployment and execution

### Contract Security

- Whitelist trusted DEXes only
- Implement reentrancy guards
- Set maximum transaction limits
- Use circuit breakers

### Network Security

- Use private RPC endpoints
- Submit via Flashbots (MEV protection)
- Firewall infrastructure services

## Updating

### Smart Contracts

Contracts are not upgradeable by design. To update:
1. Deploy new contracts
2. Update configuration with new addresses
3. Migrate any funds from old contracts

### Agents

```bash
git pull origin main
docker-compose build
docker-compose up -d
```
