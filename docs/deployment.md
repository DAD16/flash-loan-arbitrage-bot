# Matrix Flash Loan Arbitrage Bot - Deployment Guide

## Current Deployments

### Sepolia Testnet (December 2024)

| Contract | Address | Verified |
|----------|---------|----------|
| FlashLoanReceiver | `0x5c5b7CC9518206E91071F9C1B04Ebe32Ec31d5c7` | Yes |
| MultiDexRouter | `0x78700C3B41D73167125Ee52DCB6346Bba97Eb7Ac` | Yes |

**Explorer Links:**
- [FlashLoanReceiver on Etherscan](https://sepolia.etherscan.io/address/0x5c5b7CC9518206E91071F9C1B04Ebe32Ec31d5c7#code)
- [MultiDexRouter on Etherscan](https://sepolia.etherscan.io/address/0x78700C3B41D73167125Ee52DCB6346Bba97Eb7Ac#code)

**Configuration:**
- Owner: `0xADD694d04A52DfB212e965F1A3A61F30d2F7B694`
- Aave Pool Provider: `0x012bAC54348C0E635dCAc9D5FB99f06F24136C9A`
- MultiDexRouter is whitelisted in FlashLoanReceiver
- Owner is authorized executor
- minProfitBps: 10 (0.1%)

**Deployment Transaction:**
- Deployed at: 2024-12-31T19:30:00Z
- Full details in `deployments/sepolia.json`

---

## Prerequisites

1. **Foundry** - Install from https://getfoundry.sh
   ```bash
   curl -L https://foundry.paradigm.xyz | bash
   foundryup
   ```

2. **Node.js 20+** with pnpm
3. **Rust** toolchain (stable)
4. **Python 3.11+** with pip
5. **Docker** and Docker Compose (optional, for full stack)

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
export PRIVATE_KEY="0x..."  # 64 hex characters (32 bytes)

# Deploy to Sepolia
cd contracts
forge script script/Deploy.s.sol:DeployScript \
    --rpc-url $SEPOLIA_RPC_URL \
    --private-key $PRIVATE_KEY \
    --broadcast \
    -vvv

# Deploy to Arbitrum Sepolia
export ARBITRUM_SEPOLIA_RPC_URL="https://arb-sepolia.g.alchemy.com/v2/YOUR_KEY"
forge script script/Deploy.s.sol:DeployScript \
    --rpc-url $ARBITRUM_SEPOLIA_RPC_URL \
    --private-key $PRIVATE_KEY \
    --broadcast \
    -vvv
```

### Step 3: Verify Contracts

```bash
# Verify on Sepolia Etherscan
export ETHERSCAN_API_KEY="your_key"

forge verify-contract <FLASH_LOAN_RECEIVER_ADDRESS> \
    src/FlashLoanReceiver.sol:FlashLoanReceiver \
    --chain sepolia \
    --etherscan-api-key $ETHERSCAN_API_KEY

forge verify-contract <MULTI_DEX_ROUTER_ADDRESS> \
    src/MultiDexRouter.sol:MultiDexRouter \
    --chain sepolia \
    --etherscan-api-key $ETHERSCAN_API_KEY
```

### Step 4: Verify On-Chain Configuration

```bash
# Check owner
cast call <FLASH_LOAN_RECEIVER> "owner()(address)" --rpc-url $SEPOLIA_RPC_URL

# Check if MultiDexRouter is whitelisted
cast call <FLASH_LOAN_RECEIVER> "whitelistedDexes(address)(bool)" <MULTI_DEX_ROUTER> --rpc-url $SEPOLIA_RPC_URL

# Check if deployer is authorized
cast call <FLASH_LOAN_RECEIVER> "authorizedExecutors(address)(bool)" <DEPLOYER> --rpc-url $SEPOLIA_RPC_URL

# Check minProfitBps
cast call <FLASH_LOAN_RECEIVER> "minProfitBps()(uint256)" --rpc-url $SEPOLIA_RPC_URL
```

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

## Contract Interaction Examples

### Execute Flash Loan Arbitrage

```solidity
// Prepare swap parameters
FlashLoanReceiver.SwapParams[] memory swaps = new FlashLoanReceiver.SwapParams[](2);
swaps[0] = FlashLoanReceiver.SwapParams({
    dex: uniswapRouter,
    tokenIn: WETH,
    tokenOut: USDC,
    amountIn: 1 ether,
    minAmountOut: 1800e6,
    data: abi.encodeWithSelector(...)
});
swaps[1] = FlashLoanReceiver.SwapParams({
    dex: sushiRouter,
    tokenIn: USDC,
    tokenOut: WETH,
    amountIn: 0, // will use output from previous swap
    minAmountOut: 1.001 ether,
    data: abi.encodeWithSelector(...)
});

// Prepare arbitrage params
FlashLoanReceiver.ArbitrageParams memory params = FlashLoanReceiver.ArbitrageParams({
    opportunityId: keccak256("opp-123"),
    swaps: swaps,
    expectedProfit: 0.001 ether
});

// Execute
flashLoanReceiver.executeArbitrage(WETH, 1 ether, abi.encode(params));
```

### Admin Functions

```bash
# Set new authorized executor
cast send <FLASH_LOAN_RECEIVER> "setAuthorizedExecutor(address,bool)" <NEW_EXECUTOR> true \
    --rpc-url $RPC_URL --private-key $PRIVATE_KEY

# Whitelist new DEX
cast send <FLASH_LOAN_RECEIVER> "setWhitelistedDex(address,bool)" <DEX_ROUTER> true \
    --rpc-url $RPC_URL --private-key $PRIVATE_KEY

# Update min profit threshold
cast send <FLASH_LOAN_RECEIVER> "setMinProfitBps(uint256)" 15 \
    --rpc-url $RPC_URL --private-key $PRIVATE_KEY

# Withdraw profits
cast send <FLASH_LOAN_RECEIVER> "withdrawProfits(address,address,uint256)" <TOKEN> <TO> 0 \
    --rpc-url $RPC_URL --private-key $PRIVATE_KEY
```
