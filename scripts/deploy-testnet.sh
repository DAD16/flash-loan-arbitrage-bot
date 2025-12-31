#!/bin/bash
# Matrix Flash Loan Arbitrage Bot - Testnet Deployment Script
# Usage: ./scripts/deploy-testnet.sh <chain>
# Chains: sepolia, arbitrum-sepolia

set -e

CHAIN=${1:-sepolia}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CONTRACTS_DIR="$PROJECT_DIR/contracts"

echo "=========================================="
echo "Matrix Flash Loan Arbitrage Bot"
echo "Testnet Deployment"
echo "=========================================="
echo ""

# Check for required environment variables
check_env() {
    if [ -z "${!1}" ]; then
        echo "Error: $1 environment variable is not set"
        exit 1
    fi
}

# Set RPC URL based on chain
case $CHAIN in
    sepolia)
        check_env "SEPOLIA_RPC_URL"
        RPC_URL=$SEPOLIA_RPC_URL
        CHAIN_ID=11155111
        ETHERSCAN_KEY=${ETHERSCAN_API_KEY:-""}
        VERIFY_URL="https://api-sepolia.etherscan.io/api"
        ;;
    arbitrum-sepolia)
        check_env "ARBITRUM_SEPOLIA_RPC_URL"
        RPC_URL=$ARBITRUM_SEPOLIA_RPC_URL
        CHAIN_ID=421614
        ETHERSCAN_KEY=${ARBISCAN_API_KEY:-""}
        VERIFY_URL="https://api-sepolia.arbiscan.io/api"
        ;;
    *)
        echo "Unknown chain: $CHAIN"
        echo "Supported chains: sepolia, arbitrum-sepolia"
        exit 1
        ;;
esac

check_env "PRIVATE_KEY"

echo "Chain: $CHAIN"
echo "Chain ID: $CHAIN_ID"
echo "RPC URL: ${RPC_URL:0:50}..."
echo ""

# Build contracts
echo "[1/4] Building contracts..."
cd "$CONTRACTS_DIR"
forge build

# Run tests
echo "[2/4] Running tests..."
forge test --fork-url "$RPC_URL" -vvv || {
    echo "Warning: Some tests may have failed. Continue? (y/n)"
    read -r response
    if [ "$response" != "y" ]; then
        exit 1
    fi
}

# Deploy
echo "[3/4] Deploying contracts..."
DEPLOY_OUTPUT=$(forge script script/Deploy.s.sol:DeployScript \
    --rpc-url "$RPC_URL" \
    --private-key "$PRIVATE_KEY" \
    --broadcast \
    -vvv)

echo "$DEPLOY_OUTPUT"

# Extract deployed addresses from output
FLASH_LOAN_RECEIVER=$(echo "$DEPLOY_OUTPUT" | grep "FlashLoanReceiver deployed:" | awk '{print $NF}')
MULTI_DEX_ROUTER=$(echo "$DEPLOY_OUTPUT" | grep "MultiDexRouter deployed:" | awk '{print $NF}')

echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""
echo "FlashLoanReceiver: $FLASH_LOAN_RECEIVER"
echo "MultiDexRouter: $MULTI_DEX_ROUTER"
echo ""

# Verify contracts if Etherscan key is provided
if [ -n "$ETHERSCAN_KEY" ]; then
    echo "[4/4] Verifying contracts on Etherscan..."

    forge verify-contract \
        --chain-id $CHAIN_ID \
        --etherscan-api-key "$ETHERSCAN_KEY" \
        --verifier-url "$VERIFY_URL" \
        "$FLASH_LOAN_RECEIVER" \
        src/FlashLoanReceiver.sol:FlashLoanReceiver || echo "FlashLoanReceiver verification may have failed"

    forge verify-contract \
        --chain-id $CHAIN_ID \
        --etherscan-api-key "$ETHERSCAN_KEY" \
        --verifier-url "$VERIFY_URL" \
        "$MULTI_DEX_ROUTER" \
        src/MultiDexRouter.sol:MultiDexRouter || echo "MultiDexRouter verification may have failed"
else
    echo "[4/4] Skipping verification (no Etherscan API key provided)"
fi

# Save deployment info
DEPLOYMENT_FILE="$PROJECT_DIR/deployments/$CHAIN.json"
mkdir -p "$(dirname "$DEPLOYMENT_FILE")"
cat > "$DEPLOYMENT_FILE" << EOF
{
  "chain": "$CHAIN",
  "chainId": $CHAIN_ID,
  "deployedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "contracts": {
    "FlashLoanReceiver": "$FLASH_LOAN_RECEIVER",
    "MultiDexRouter": "$MULTI_DEX_ROUTER"
  }
}
EOF

echo ""
echo "Deployment info saved to: $DEPLOYMENT_FILE"
echo ""
echo "Next steps:"
echo "1. Verify contracts on block explorer if not done automatically"
echo "2. Transfer ownership if needed"
echo "3. Configure the bot with deployed addresses"
echo "4. Test with small amounts first!"
