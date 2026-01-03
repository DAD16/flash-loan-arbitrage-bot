/**
 * Testnet Configuration for MEV Protection Testing
 *
 * Titan Builder: MAINNET ONLY (no testnet support)
 * Flashbots Protect: Sepolia testnet available
 *
 * This config enables testing the full MEV protection flow
 * on Sepolia before deploying to mainnet.
 */

export const TESTNET_CONFIG = {
  // Sepolia testnet
  sepolia: {
    chainId: 11155111,
    name: 'Sepolia',
    rpcUrls: {
      // Public RPCs for reading (ordered by reliability)
      public: [
        'https://ethereum-sepolia-rpc.publicnode.com',
        'https://1rpc.io/sepolia',
        'https://rpc2.sepolia.org',
      ],
      // Flashbots Protect for private transactions
      flashbotsProtect: 'https://rpc-sepolia.flashbots.net/',
    },
    explorer: 'https://sepolia.etherscan.io',
    faucets: [
      'https://sepoliafaucet.com/',
      'https://www.alchemy.com/faucets/ethereum-sepolia',
      'https://faucet.quicknode.com/ethereum/sepolia',
    ],
    // Test tokens on Sepolia
    tokens: {
      WETH: '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9',
      USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      DAI: '0x68194a729C2450ad26072b3D33ADaCbcef39D574',
    },
    // Test DEXs on Sepolia
    dexes: {
      uniswapV2Router: '0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008',
      uniswapV3Router: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E',
    },
  },

  // BSC Testnet
  bscTestnet: {
    chainId: 97,
    name: 'BSC Testnet',
    rpcUrls: {
      public: [
        'https://data-seed-prebsc-1-s1.binance.org:8545',
        'https://data-seed-prebsc-2-s1.binance.org:8545',
        'https://bsc-testnet.publicnode.com',
      ],
    },
    explorer: 'https://testnet.bscscan.com',
    faucets: ['https://testnet.bnbchain.org/faucet-smart'],
    tokens: {
      WBNB: '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd',
      BUSD: '0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee',
    },
    dexes: {
      pancakeRouter: '0xD99D1c33F9fC3444f8101754aBC46c52416550D1',
    },
  },
};

/**
 * Test wallet configuration
 * IMPORTANT: Only use for testnet! Never put mainnet keys here.
 */
export interface TestWalletConfig {
  privateKey: string;
  address?: string;
}

/**
 * Get testnet RPC URL
 */
export function getTestnetRPC(
  network: 'sepolia' | 'bscTestnet',
  useFlashbots: boolean = false
): string {
  const config = TESTNET_CONFIG[network];

  if (network === 'sepolia' && useFlashbots) {
    return config.rpcUrls.flashbotsProtect;
  }

  return config.rpcUrls.public[0];
}

/**
 * Titan Builder test mode
 * Since Titan is mainnet only, we simulate bundle submission
 */
export const TITAN_TEST_MODE = {
  enabled: true,
  simulateSuccess: true,
  simulatedBundleHash:
    '0x' + '1'.repeat(64), // Fake hash for testing
  simulatedLatencyMs: 200,
};
