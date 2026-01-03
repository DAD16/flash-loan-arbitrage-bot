/**
 * Live Price Ingestion Service
 * Monitors DEX prices in real-time and detects arbitrage opportunities
 * Supports: BSC, Ethereum, Arbitrum, Base
 *
 * Agent: ORACLE (Price Prediction Engine)
 */

import { createPublicClient, http, webSocket, parseAbi, formatUnits, type Log, type Chain } from 'viem';
import { bsc, mainnet, arbitrum, base } from 'viem/chains';
import Database from 'better-sqlite3';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { getWebSocketServer } from './websocketServer.js';
import { MMBFDetector, type Edge, type ArbitragePath } from './mmbfDetector.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '../../db/matrix.db');

// ============================================================================
// SUPPORTED CHAINS
// ============================================================================

export type SupportedChain = 'bsc' | 'ethereum' | 'arbitrum' | 'base';

const CHAIN_MAP: Record<SupportedChain, Chain> = {
  bsc: bsc,
  ethereum: mainnet,
  arbitrum: arbitrum,
  base: base,
};

const CHAIN_NATIVE_SYMBOL: Record<SupportedChain, string> = {
  bsc: 'BNB',
  ethereum: 'ETH',
  arbitrum: 'ETH',
  base: 'ETH',
};

// WebSocket RPC URLs for real-time event subscriptions
const DEFAULT_WS_URLS: Record<SupportedChain, string> = {
  bsc: process.env.BSC_WS_URL || 'wss://bsc-mainnet.core.chainstack.com/ws/acba35ed74b7bbddda5fdbc98656b7e3',
  ethereum: process.env.ETH_WS_URL || 'wss://ethereum-mainnet.core.chainstack.com/ws/1b38d7c3db704ccc97e7dc0e134a7eb0',
  arbitrum: process.env.ARBITRUM_WS_URL || 'wss://arbitrum-one.publicnode.com',
  base: process.env.BASE_WS_URL || 'wss://base.publicnode.com',
};

// Minimum liquidity (in USD) required for an opportunity to be considered valid
// This filters out low-liquidity pools where displayed prices are misleading
const MIN_LIQUIDITY_USD: Record<SupportedChain, number> = {
  bsc: 50000,      // $50k minimum on BSC
  ethereum: 100000, // $100k minimum on Ethereum (higher gas costs)
  arbitrum: 25000,  // $25k minimum on Arbitrum
  base: 25000,      // $25k minimum on Base
};

// Approximate token prices for liquidity calculation (updated periodically)
const TOKEN_PRICES_USD: Record<string, number> = {
  // BSC
  WBNB: 600,
  BNB: 600,
  // Ethereum/L2s
  WETH: 3400,
  ETH: 3400,
  // BTC
  WBTC: 95000,
  BTCB: 95000,
  // Stablecoins
  USDT: 1,
  USDC: 1,
  BUSD: 1,
  DAI: 1,
  USDbC: 1,
  // Altcoins (rough estimates)
  CAKE: 2,
  LINK: 15,
  UNI: 8,
  ARB: 0.8,
  GMX: 25,
  SHIB: 0.000022,
  PEPE: 0.000000019,
};

// ============================================================================
// DEX CONFIGURATION (PER CHAIN)
// ============================================================================

interface DexConfig {
  name: string;
  factory: string;
  router: string;
  fee: number; // basis points
}

const DEX_CONFIGS: Record<SupportedChain, Record<string, DexConfig>> = {
  // BSC DEXs
  bsc: {
    pancakeswap: {
      name: 'PancakeSwap',
      factory: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73',
      router: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
      fee: 25,
    },
    biswap: {
      name: 'Biswap',
      factory: '0x858E3312ed3A876947EA49d572A7C42DE08af7EE',
      router: '0x3a6d8cA21D1CF76F653A67577FA0D27453350dD8',
      fee: 10,
    },
    apeswap: {
      name: 'ApeSwap',
      factory: '0x0841BD0B734E4F5853f0dD8d7Ea041c241fb0Da6',
      router: '0xcF0feBd3f17CEf5b47b0cD257aCf6025c5BFf3b7',
      fee: 20,
    },
    mdex: {
      name: 'MDEX',
      factory: '0x3CD1C46068dAEa5Ebb0d3f55F6915B10648062B8',
      router: '0x7DAe51BD3E3376B8c7c4900E9107f12Be3AF1bA8',
      fee: 30,
    },
    babyswap: {
      name: 'BabySwap',
      factory: '0x86407bEa2078ea5f5EB5A52B2caA963bC1F889Da',
      router: '0x325E343f1dE602396E256B67eFd1F61C3A6B38Bd',
      fee: 30,
    },
  },
  // Ethereum DEXs
  ethereum: {
    uniswapv2: {
      name: 'Uniswap V2',
      factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
      router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
      fee: 30,
    },
    sushiswap: {
      name: 'SushiSwap',
      factory: '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac',
      router: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F',
      fee: 30,
    },
    shibaswap: {
      name: 'ShibaSwap',
      factory: '0x115934131916C8b277DD010Ee02de363c09d037c',
      router: '0x03f7724180AA6b939894B5Ca4314783B0b36b329',
      fee: 30,
    },
  },
  // Arbitrum DEXs
  arbitrum: {
    uniswapv2: {
      name: 'Uniswap V2',
      factory: '0xf1D7CC64Fb4452F05c498126312eBE29f30Fbcf9',
      router: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24',
      fee: 30,
    },
    sushiswap: {
      name: 'SushiSwap',
      factory: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4',
      router: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
      fee: 30,
    },
    camelot: {
      name: 'Camelot',
      factory: '0x6EcCab422D763aC031210895C81787E87B43A652',
      router: '0xc873fEcbd354f5A56E00E710B90EF4201db2448d',
      fee: 30,
    },
  },
  // Base DEXs (UniswapV2-compatible only - Aerodrome uses different interface)
  base: {
    uniswapv2: {
      name: 'Uniswap V2',
      factory: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6',
      router: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24',
      fee: 30,
    },
    baseswap: {
      name: 'BaseSwap',
      factory: '0xFDa619b6d20975be80A10332cD39b9a4b0FAa8BB', // Correct factory address
      router: '0x327Df1E6de05895d2ab08513aaDD9313Fe505d86',
      fee: 25, // BaseSwap uses 0.25% fee
    },
    sushiswap: {
      name: 'SushiSwap',
      factory: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4',
      router: '0x6BDED42c6DA8FBf0d2bA55B2fa120C5e0c8D7891',
      fee: 30,
    },
  },
};

// ============================================================================
// TOKEN CONFIGURATION (PER CHAIN)
// ============================================================================

interface TokenConfig {
  address: string;
  symbol: string;
  decimals: number;
  isStable?: boolean;
}

const TOKENS: Record<SupportedChain, Record<string, TokenConfig>> = {
  // BSC Tokens
  bsc: {
    WBNB: {
      address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
      symbol: 'WBNB',
      decimals: 18,
    },
    USDT: {
      address: '0x55d398326f99059fF775485246999027B3197955',
      symbol: 'USDT',
      decimals: 18,
      isStable: true,
    },
    BUSD: {
      address: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
      symbol: 'BUSD',
      decimals: 18,
      isStable: true,
    },
    USDC: {
      address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
      symbol: 'USDC',
      decimals: 18,
      isStable: true,
    },
    ETH: {
      address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
      symbol: 'ETH',
      decimals: 18,
    },
    BTCB: {
      address: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
      symbol: 'BTCB',
      decimals: 18,
    },
    CAKE: {
      address: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
      symbol: 'CAKE',
      decimals: 18,
    },
  },
  // Ethereum Tokens
  ethereum: {
    WETH: {
      address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      symbol: 'WETH',
      decimals: 18,
    },
    USDT: {
      address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      symbol: 'USDT',
      decimals: 6,
      isStable: true,
    },
    USDC: {
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      symbol: 'USDC',
      decimals: 6,
      isStable: true,
    },
    DAI: {
      address: '0x6B175474E89094C44Da98b954EescdeCB5BE0Ba',
      symbol: 'DAI',
      decimals: 18,
      isStable: true,
    },
    WBTC: {
      address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
      symbol: 'WBTC',
      decimals: 8,
    },
    LINK: {
      address: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
      symbol: 'LINK',
      decimals: 18,
    },
    UNI: {
      address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
      symbol: 'UNI',
      decimals: 18,
    },
    SHIB: {
      address: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',
      symbol: 'SHIB',
      decimals: 18,
    },
    PEPE: {
      address: '0x6982508145454Ce325dDbE47a25d4ec3d2311933',
      symbol: 'PEPE',
      decimals: 18,
    },
  },
  // Arbitrum Tokens
  arbitrum: {
    WETH: {
      address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
      symbol: 'WETH',
      decimals: 18,
    },
    USDT: {
      address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
      symbol: 'USDT',
      decimals: 6,
      isStable: true,
    },
    USDC: {
      address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      symbol: 'USDC',
      decimals: 6,
      isStable: true,
    },
    WBTC: {
      address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
      symbol: 'WBTC',
      decimals: 8,
    },
    ARB: {
      address: '0x912CE59144191C1204E64559FE8253a0e49E6548',
      symbol: 'ARB',
      decimals: 18,
    },
    GMX: {
      address: '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a',
      symbol: 'GMX',
      decimals: 18,
    },
  },
  // Base Tokens
  base: {
    WETH: {
      address: '0x4200000000000000000000000000000000000006',
      symbol: 'WETH',
      decimals: 18,
    },
    USDC: {
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      symbol: 'USDC',
      decimals: 6,
      isStable: true,
    },
    USDbC: {
      address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
      symbol: 'USDbC',
      decimals: 6,
      isStable: true,
    },
    DAI: {
      address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
      symbol: 'DAI',
      decimals: 18,
      isStable: true,
    },
  },
};

// Trading pairs to monitor (per chain)
const MONITORED_PAIRS: Record<SupportedChain, string[][]> = {
  bsc: [
    ['WBNB', 'USDT'],
    ['WBNB', 'BUSD'],
    ['WBNB', 'USDC'],
    ['WBNB', 'ETH'],
    ['WBNB', 'BTCB'],
    ['WBNB', 'CAKE'],
    ['USDT', 'BUSD'],
    ['USDT', 'USDC'],
    ['ETH', 'BTCB'],
    ['CAKE', 'USDT'],
  ],
  ethereum: [
    ['WETH', 'USDT'],
    ['WETH', 'USDC'],
    ['WETH', 'DAI'],
    ['WETH', 'WBTC'],
    ['WETH', 'LINK'],
    ['WETH', 'UNI'],
    ['USDT', 'USDC'],
    ['USDT', 'DAI'],
    ['WBTC', 'USDT'],
    ['SHIB', 'WETH'],
    ['PEPE', 'WETH'],
  ],
  arbitrum: [
    ['WETH', 'USDT'],
    ['WETH', 'USDC'],
    ['WETH', 'WBTC'],
    ['WETH', 'ARB'],
    ['WETH', 'GMX'],
    ['USDT', 'USDC'],
    ['ARB', 'USDC'],
  ],
  base: [
    ['WETH', 'USDC'],
    ['WETH', 'USDbC'],
    ['WETH', 'DAI'],
    ['USDC', 'USDbC'],
    ['USDC', 'DAI'],
  ],
};

// ============================================================================
// ABIs
// ============================================================================

const PAIR_ABI = parseAbi([
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'event Sync(uint112 reserve0, uint112 reserve1)',
  'event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)',
]);

const FACTORY_ABI = parseAbi([
  'function getPair(address tokenA, address tokenB) view returns (address pair)',
]);

// ============================================================================
// TYPES
// ============================================================================

interface PairInfo {
  address: string;
  dex: string;
  token0: string;
  token1: string;
  symbol0: string;
  symbol1: string;
  decimals0: number;
  decimals1: number;
  reserve0: bigint;
  reserve1: bigint;
  price0: number; // Price of token0 in terms of token1
  price1: number; // Price of token1 in terms of token0
  lastUpdate: Date;
}

interface ArbitrageOpportunity {
  id: string;
  buyDex: string;
  sellDex: string;
  token0: string;
  token1: string;
  symbol0: string;
  symbol1: string;
  buyPrice: number;
  sellPrice: number;
  spreadBps: number;
  estimatedProfitBps: number;
  estimatedProfitUsd: number;
  confidence: 'low' | 'medium' | 'high' | 'very_high';
  detectedAt: Date;
}

interface IngestionStats {
  startTime: Date;
  pairsMonitored: number;
  priceUpdates: number;
  opportunitiesDetected: number;
  lastUpdate: Date | null;
  isRunning: boolean;
}

// ============================================================================
// PRICE INGESTION SERVICE
// ============================================================================

export class PriceIngestionService {
  private httpClient: ReturnType<typeof createPublicClient>;
  private wsClient: ReturnType<typeof createPublicClient> | null = null;
  private db: Database.Database;
  private pairs: Map<string, PairInfo> = new Map();
  private pairByAddress: Map<string, string> = new Map(); // address -> pairKey mapping
  private isRunning: boolean = false;
  private stats: IngestionStats;
  private rpcUrl: string;
  private wsUrl: string;
  private pollIntervalMs: number;
  private minSpreadBps: number;
  private chain: SupportedChain;
  private dexConfigs: Record<string, DexConfig>;
  private tokens: Record<string, TokenConfig>;
  private monitoredPairs: string[][];
  private useMMBF: boolean;
  private mmbfDetector: MMBFDetector | null = null;
  private useWebSocket: boolean = false;
  private wsSubscriptionActive: boolean = false;
  private unwatch: (() => void) | null = null;
  private syncEventCount: number = 0;
  private lastSyncTime: number = 0;

  constructor(config: {
    chain?: SupportedChain;
    rpcUrl?: string;
    wsUrl?: string;
    pollIntervalMs?: number;
    minSpreadBps?: number;
    useMMBF?: boolean;  // Use MMBF algorithm for multi-hop detection
    useWebSocket?: boolean;  // Use WebSocket for real-time Sync events
  } = {}) {
    // Set chain (defaults to BSC for backwards compatibility)
    this.chain = config.chain || 'bsc';

    // Get chain-specific RPC URL
    const rpcEnvVar = this.chain === 'bsc' ? 'BSC_RPC_URL'
      : this.chain === 'ethereum' ? 'ETH_RPC_URL'
      : this.chain === 'arbitrum' ? 'ARBITRUM_RPC_URL'
      : 'BASE_RPC_URL';

    const defaultRpc = this.chain === 'bsc' ? 'https://bsc-dataseed.binance.org'
      : this.chain === 'ethereum' ? 'https://eth.llamarpc.com'
      : this.chain === 'arbitrum' ? 'https://arb1.arbitrum.io/rpc'
      : 'https://mainnet.base.org';

    this.rpcUrl = config.rpcUrl || process.env[rpcEnvVar] || defaultRpc;
    this.wsUrl = config.wsUrl || DEFAULT_WS_URLS[this.chain] || '';
    this.pollIntervalMs = config.pollIntervalMs || 2000;
    this.minSpreadBps = config.minSpreadBps || 10;
    this.useWebSocket = config.useWebSocket ?? true; // Default to WebSocket mode

    // Load chain-specific configurations
    this.dexConfigs = DEX_CONFIGS[this.chain];
    this.tokens = TOKENS[this.chain];
    this.monitoredPairs = MONITORED_PAIRS[this.chain];

    // Create HTTP client with correct chain
    this.httpClient = createPublicClient({
      chain: CHAIN_MAP[this.chain],
      transport: http(this.rpcUrl),
    });

    // Connect to database
    this.db = new Database(DB_PATH);
    this.db.pragma('foreign_keys = ON');

    // Initialize stats
    this.stats = {
      startTime: new Date(),
      pairsMonitored: 0,
      priceUpdates: 0,
      opportunitiesDetected: 0,
      lastUpdate: null,
      isRunning: false,
    };

    // Initialize MMBF detector if enabled
    this.useMMBF = config.useMMBF ?? false;
    if (this.useMMBF) {
      this.mmbfDetector = new MMBFDetector({
        minProfitBps: this.minSpreadBps,
        maxPathLength: 8,  // Up to 8 hops (vs 2 for simple detection)
        minLiquidityUsd: MIN_LIQUIDITY_USD[this.chain],
        gasPriceGwei: this.chain === 'ethereum' ? 30 : 5,
      });
      console.log(`  🧠 MMBF Algorithm: ENABLED (multi-hop up to 8 hops)`);
    }
  }

  getChain(): SupportedChain {
    return this.chain;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Price ingestion already running');
      return;
    }

    const chainName = this.chain.toUpperCase();
    console.log('\n' + '═'.repeat(60));
    console.log(`  🔮 ORACLE - Live Price Ingestion Service (${chainName})`);
    console.log('═'.repeat(60));
    console.log(`  Chain: ${chainName}`);
    console.log(`  RPC: ${this.rpcUrl.substring(0, 50)}...`);
    if (this.useWebSocket && this.wsUrl) {
      console.log(`  WebSocket: ${this.wsUrl.substring(0, 50)}...`);
      console.log(`  Mode: REAL-TIME (Sync event subscriptions)`);
    } else {
      console.log(`  Mode: POLLING (${this.pollIntervalMs}ms interval)`);
    }
    console.log(`  Min Spread: ${this.minSpreadBps} bps`);
    console.log('═'.repeat(60) + '\n');

    this.isRunning = true;
    this.stats.isRunning = true;
    this.stats.startTime = new Date();

    // Discover and initialize pairs
    await this.discoverPairs();

    // Try WebSocket mode first, fall back to polling
    if (this.useWebSocket && this.wsUrl) {
      const wsSuccess = await this.setupWebSocketSubscriptions();
      if (wsSuccess) {
        console.log(`\n⚡ [${chainName}] REAL-TIME mode: Subscribed to ${this.pairs.size} pools via WebSocket\n`);
      } else {
        console.log(`\n⚠️  [${chainName}] WebSocket failed, falling back to polling mode\n`);
        this.pollLoop();
      }
    } else {
      // Start polling loop
      this.pollLoop();
      console.log(`\n✅ [${chainName}] Monitoring ${this.pairs.size} pairs across ${Object.keys(this.dexConfigs).length} DEXs\n`);
    }
  }

  stop(): void {
    console.log('\n🛑 Stopping price ingestion...');
    this.isRunning = false;
    this.stats.isRunning = false;

    // Clean up WebSocket subscription
    if (this.unwatch) {
      this.unwatch();
      this.unwatch = null;
    }
    this.wsSubscriptionActive = false;
    this.wsClient = null;
  }

  private async discoverPairs(): Promise<void> {
    console.log(`🔍 Discovering DEX pairs for ${this.chain.toUpperCase()}...\n`);

    for (const [dexKey, dex] of Object.entries(this.dexConfigs)) {
      console.log(`  ${dex.name}:`);

      for (const [symbolA, symbolB] of this.monitoredPairs) {
        const tokenA = this.tokens[symbolA];
        const tokenB = this.tokens[symbolB];

        if (!tokenA || !tokenB) continue;

        try {
          // Get pair address from factory
          const pairAddress = await this.httpClient.readContract({
            address: dex.factory as `0x${string}`,
            abi: FACTORY_ABI,
            functionName: 'getPair',
            args: [tokenA.address as `0x${string}`, tokenB.address as `0x${string}`],
          });

          if (pairAddress === '0x0000000000000000000000000000000000000000') {
            continue; // Pair doesn't exist
          }

          // Get token order
          const token0 = await this.httpClient.readContract({
            address: pairAddress as `0x${string}`,
            abi: PAIR_ABI,
            functionName: 'token0',
          });

          const isToken0A = token0.toLowerCase() === tokenA.address.toLowerCase();

          // Get initial reserves
          const [reserve0, reserve1] = await this.httpClient.readContract({
            address: pairAddress as `0x${string}`,
            abi: PAIR_ABI,
            functionName: 'getReserves',
          });

          const pairKey = `${dexKey}:${symbolA}/${symbolB}`;
          const pairInfo: PairInfo = {
            address: pairAddress as string,
            dex: dex.name,
            token0: isToken0A ? tokenA.address : tokenB.address,
            token1: isToken0A ? tokenB.address : tokenA.address,
            symbol0: isToken0A ? symbolA : symbolB,
            symbol1: isToken0A ? symbolB : symbolA,
            decimals0: isToken0A ? tokenA.decimals : tokenB.decimals,
            decimals1: isToken0A ? tokenB.decimals : tokenA.decimals,
            reserve0: reserve0,
            reserve1: reserve1,
            price0: this.calculatePrice(reserve0, reserve1, isToken0A ? tokenA.decimals : tokenB.decimals, isToken0A ? tokenB.decimals : tokenA.decimals),
            price1: this.calculatePrice(reserve1, reserve0, isToken0A ? tokenB.decimals : tokenA.decimals, isToken0A ? tokenA.decimals : tokenB.decimals),
            lastUpdate: new Date(),
          };

          this.pairs.set(pairKey, pairInfo);
          // Map address to pairKey for WebSocket event lookup
          this.pairByAddress.set((pairAddress as string).toLowerCase(), pairKey);
          console.log(`    ✓ ${symbolA}/${symbolB}: ${pairAddress.slice(0, 10)}...`);

        } catch (error) {
          // Pair doesn't exist or error fetching
        }
      }
    }

    this.stats.pairsMonitored = this.pairs.size;
  }

  /**
   * Set up WebSocket subscriptions to pool Sync events
   * This provides real-time updates (~100ms latency vs 2s polling)
   */
  private async setupWebSocketSubscriptions(): Promise<boolean> {
    try {
      // Create WebSocket client
      this.wsClient = createPublicClient({
        chain: CHAIN_MAP[this.chain],
        transport: webSocket(this.wsUrl, {
          reconnect: true,
          retryCount: 5,
          retryDelay: 1000,
        }),
      });

      // Get all pool addresses
      const poolAddresses = Array.from(this.pairs.values()).map(
        p => p.address as `0x${string}`
      );

      if (poolAddresses.length === 0) {
        console.log('  ⚠️  No pools to subscribe to');
        return false;
      }

      console.log(`  📡 Subscribing to Sync events on ${poolAddresses.length} pools...`);

      // Subscribe to Sync events on all pools
      this.unwatch = this.wsClient.watchContractEvent({
        abi: PAIR_ABI,
        eventName: 'Sync',
        address: poolAddresses,
        onLogs: (logs) => this.handleSyncEvents(logs),
        onError: (error) => {
          console.error(`  ❌ WebSocket error: ${error.message}`);
          this.handleWebSocketError();
        },
      });

      this.wsSubscriptionActive = true;
      this.lastSyncTime = Date.now();

      // Start a lightweight stats reporter
      this.startSyncStatsReporter();

      return true;
    } catch (error) {
      console.error(`  ❌ Failed to set up WebSocket: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Handle incoming Sync events from pools
   */
  private handleSyncEvents(logs: Log[]): void {
    for (const log of logs) {
      const poolAddress = log.address.toLowerCase();
      const pairKey = this.pairByAddress.get(poolAddress);

      if (!pairKey) continue;

      const pair = this.pairs.get(pairKey);
      if (!pair) continue;

      // Decode reserve0 and reserve1 from log data
      // Sync event: event Sync(uint112 reserve0, uint112 reserve1)
      try {
        const data = log.data;
        // Each uint112 is padded to 32 bytes (64 hex chars)
        const reserve0Hex = data.slice(2, 66);
        const reserve1Hex = data.slice(66, 130);

        const reserve0 = BigInt('0x' + reserve0Hex);
        const reserve1 = BigInt('0x' + reserve1Hex);

        // Update pair reserves
        const oldPrice0 = pair.price0;
        pair.reserve0 = reserve0;
        pair.reserve1 = reserve1;
        pair.price0 = this.calculatePrice(reserve0, reserve1, pair.decimals0, pair.decimals1);
        pair.price1 = this.calculatePrice(reserve1, reserve0, pair.decimals1, pair.decimals0);
        pair.lastUpdate = new Date();

        this.stats.priceUpdates++;
        this.syncEventCount++;
        this.lastSyncTime = Date.now();

        // Log significant price changes (> 0.1%)
        const priceChange = oldPrice0 > 0 ? Math.abs(pair.price0 - oldPrice0) / oldPrice0 : 0;
        if (priceChange > 0.001) {
          console.log(
            `  ⚡ [${this.chain.toUpperCase()}] ${pair.symbol0}/${pair.symbol1}@${pair.dex}: ` +
            `${oldPrice0.toFixed(6)} → ${pair.price0.toFixed(6)} (${(priceChange * 100).toFixed(2)}%)`
          );
        }
      } catch (error) {
        // Skip malformed events
      }
    }

    // Trigger MMBF detection after processing events
    if (logs.length > 0) {
      this.detectArbitrageOpportunities();
    }
  }

  /**
   * Handle WebSocket errors and reconnection
   */
  private handleWebSocketError(): void {
    console.log(`  🔄 Attempting to reconnect WebSocket...`);

    // Clean up existing subscription
    if (this.unwatch) {
      this.unwatch();
      this.unwatch = null;
    }

    // Try to reconnect after a delay
    setTimeout(async () => {
      if (this.isRunning) {
        const success = await this.setupWebSocketSubscriptions();
        if (!success) {
          console.log(`  ⚠️  WebSocket reconnection failed, falling back to polling`);
          this.pollLoop();
        }
      }
    }, 3000);
  }

  /**
   * Report sync event statistics periodically
   */
  private startSyncStatsReporter(): void {
    const reportInterval = setInterval(() => {
      if (!this.isRunning || !this.wsSubscriptionActive) {
        clearInterval(reportInterval);
        return;
      }

      const timeSinceLastSync = Date.now() - this.lastSyncTime;
      const eventsPerSecond = this.syncEventCount > 0
        ? (this.syncEventCount / ((Date.now() - this.stats.startTime.getTime()) / 1000)).toFixed(2)
        : '0';

      console.log(
        `  📊 [${this.chain.toUpperCase()}] WebSocket stats: ` +
        `${this.syncEventCount} events, ${eventsPerSecond}/sec, ` +
        `last: ${timeSinceLastSync}ms ago`
      );
    }, 30000); // Report every 30 seconds
  }

  private calculatePrice(reserveA: bigint, reserveB: bigint, decimalsA: number, decimalsB: number): number {
    if (reserveA === BigInt(0)) return 0;

    const adjustedA = Number(reserveA) / Math.pow(10, decimalsA);
    const adjustedB = Number(reserveB) / Math.pow(10, decimalsB);

    return adjustedB / adjustedA;
  }

  /**
   * Calculate the USD value of liquidity in a pool
   * Uses token prices to estimate total TVL
   */
  private calculateLiquidityUsd(pair: PairInfo): number {
    const reserve0Adjusted = Number(pair.reserve0) / Math.pow(10, pair.decimals0);
    const reserve1Adjusted = Number(pair.reserve1) / Math.pow(10, pair.decimals1);

    const price0 = TOKEN_PRICES_USD[pair.symbol0] || 0;
    const price1 = TOKEN_PRICES_USD[pair.symbol1] || 0;

    const value0 = reserve0Adjusted * price0;
    const value1 = reserve1Adjusted * price1;

    // Total liquidity is sum of both sides
    return value0 + value1;
  }

  /**
   * Check if a pool has sufficient liquidity for trading
   */
  private hasMinimumLiquidity(pair: PairInfo): boolean {
    const liquidityUsd = this.calculateLiquidityUsd(pair);
    const minRequired = MIN_LIQUIDITY_USD[this.chain];
    return liquidityUsd >= minRequired;
  }

  private async pollLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        await this.updateAllPrices();
        await this.detectArbitrageOpportunities();
        await this.sleep(this.pollIntervalMs);
      } catch (error) {
        console.error('Error in poll loop:', error);
        await this.sleep(5000);
      }
    }
  }

  private async updateAllPrices(): Promise<void> {
    const updatePromises: Promise<void>[] = [];

    for (const [key, pair] of this.pairs.entries()) {
      updatePromises.push(this.updatePairPrice(key, pair));
    }

    await Promise.allSettled(updatePromises);
    this.stats.lastUpdate = new Date();
  }

  private async updatePairPrice(key: string, pair: PairInfo): Promise<void> {
    try {
      const [reserve0, reserve1] = await this.httpClient.readContract({
        address: pair.address as `0x${string}`,
        abi: PAIR_ABI,
        functionName: 'getReserves',
      });

      // Check if reserves changed
      if (reserve0 !== pair.reserve0 || reserve1 !== pair.reserve1) {
        pair.reserve0 = reserve0;
        pair.reserve1 = reserve1;
        pair.price0 = this.calculatePrice(reserve0, reserve1, pair.decimals0, pair.decimals1);
        pair.price1 = this.calculatePrice(reserve1, reserve0, pair.decimals1, pair.decimals0);
        pair.lastUpdate = new Date();
        this.stats.priceUpdates++;

        // Broadcast price update via WebSocket
        try {
          const wsServer = getWebSocketServer();
          if (wsServer.isRunning()) {
            wsServer.broadcastPriceUpdate({
              chain: this.chain,
              pair: `${pair.symbol0}/${pair.symbol1}`,
              dex: pair.dex,
              price: pair.price0,
              reserves: {
                token0: pair.reserve0.toString(),
                token1: pair.reserve1.toString(),
              },
              timestamp: Date.now(),
            });
          }
        } catch {
          // WebSocket not available, continue without broadcasting
        }
      }
    } catch (error) {
      // Skip failed updates
    }
  }

  private async detectArbitrageOpportunities(): Promise<void> {
    // Use MMBF algorithm if enabled (finds multi-hop opportunities)
    if (this.useMMBF && this.mmbfDetector) {
      await this.detectArbitrageMMBF();
      return;
    }

    // Simple 2-hop detection (original algorithm)
    // Group pairs by trading pair (e.g., WBNB/USDT across different DEXs)
    const pairsBySymbol: Map<string, PairInfo[]> = new Map();

    for (const pair of this.pairs.values()) {
      const symbolKey = `${pair.symbol0}/${pair.symbol1}`;
      const reverseKey = `${pair.symbol1}/${pair.symbol0}`;

      if (!pairsBySymbol.has(symbolKey)) {
        pairsBySymbol.set(symbolKey, []);
      }
      pairsBySymbol.get(symbolKey)!.push(pair);

      // Also check reverse
      if (!pairsBySymbol.has(reverseKey)) {
        pairsBySymbol.set(reverseKey, []);
      }
    }

    // Find arbitrage opportunities
    for (const [symbolKey, pairs] of pairsBySymbol.entries()) {
      if (pairs.length < 2) continue;

      // Compare all pairs
      for (let i = 0; i < pairs.length; i++) {
        for (let j = i + 1; j < pairs.length; j++) {
          const pairA = pairs[i];
          const pairB = pairs[j];

          // Skip if either pool has insufficient liquidity
          if (!this.hasMinimumLiquidity(pairA) || !this.hasMinimumLiquidity(pairB)) {
            continue;
          }

          // Calculate spread
          const priceA = pairA.price0;
          const priceB = pairB.price0;

          if (priceA === 0 || priceB === 0) continue;

          const spread = Math.abs(priceA - priceB) / Math.min(priceA, priceB);
          const spreadBps = Math.round(spread * 10000);

          if (spreadBps >= this.minSpreadBps) {
            const buyDex = priceA < priceB ? pairA.dex : pairB.dex;
            const sellDex = priceA < priceB ? pairB.dex : pairA.dex;
            const buyPrice = Math.min(priceA, priceB);
            const sellPrice = Math.max(priceA, priceB);

            // Estimate profit (accounting for ~0.3% fees per swap)
            const totalFeeBps = 60; // Approximate total fees
            const estimatedProfitBps = spreadBps - totalFeeBps;

            if (estimatedProfitBps > 0) {
              const opportunity: ArbitrageOpportunity = {
                id: randomUUID(),
                buyDex,
                sellDex,
                token0: pairA.token0,
                token1: pairA.token1,
                symbol0: pairA.symbol0,
                symbol1: pairA.symbol1,
                buyPrice,
                sellPrice,
                spreadBps,
                estimatedProfitBps,
                estimatedProfitUsd: this.estimateProfitUsd(pairA.symbol0, estimatedProfitBps),
                confidence: this.calculateConfidence(spreadBps, pairA, pairB),
                detectedAt: new Date(),
              };

              await this.saveOpportunity(opportunity);
              this.stats.opportunitiesDetected++;

              // Broadcast opportunity via WebSocket
              try {
                const wsServer = getWebSocketServer();
                if (wsServer.isRunning()) {
                  // Calculate net profit after gas costs (rough estimate)
                  const gasCostBps = 15; // ~0.15% for typical gas
                  const netProfitBps = opportunity.estimatedProfitBps - gasCostBps;

                  wsServer.broadcastOpportunity({
                    chain: this.chain,
                    id: opportunity.id,
                    pair: `${opportunity.symbol0}/${opportunity.symbol1}`,
                    buyDex: opportunity.buyDex,
                    sellDex: opportunity.sellDex,
                    buyPrice: opportunity.buyPrice,
                    sellPrice: opportunity.sellPrice,
                    spreadBps: opportunity.spreadBps,
                    netProfitBps,
                    estimatedProfitUsd: opportunity.estimatedProfitUsd,
                    timestamp: Date.now(),
                  });
                }
              } catch {
                // WebSocket not available, continue without broadcasting
              }

              // Calculate liquidity for logging
              const liqA = Math.round(this.calculateLiquidityUsd(pairA) / 1000);
              const liqB = Math.round(this.calculateLiquidityUsd(pairB) / 1000);

              console.log(
                `⚡ [${this.chain.toUpperCase()}] ARB: ${pairA.symbol0}/${pairA.symbol1} | ` +
                `Buy@${buyDex} ${buyPrice.toFixed(6)} → Sell@${sellDex} ${sellPrice.toFixed(6)} | ` +
                `Spread: ${spreadBps}bps | Est. Profit: ${estimatedProfitBps}bps | Liq: $${liqA}k/$${liqB}k`
              );
            }
          }
        }
      }
    }
  }

  private calculateConfidence(spreadBps: number, pairA: PairInfo, pairB: PairInfo): 'low' | 'medium' | 'high' | 'very_high' {
    // Confidence based on spread size and liquidity
    const minReserve = Math.min(
      Number(pairA.reserve0) / 1e18,
      Number(pairA.reserve1) / 1e18,
      Number(pairB.reserve0) / 1e18,
      Number(pairB.reserve1) / 1e18
    );

    // Low liquidity = low confidence
    if (minReserve < 1000) return 'low';

    if (spreadBps >= 100 && minReserve >= 100000) return 'very_high';
    if (spreadBps >= 50 && minReserve >= 50000) return 'high';
    if (spreadBps >= 20 && minReserve >= 10000) return 'medium';

    return 'low';
  }

  private estimateProfitUsd(baseSymbol: string, profitBps: number): number {
    // Estimate based on native token price and typical trade size
    let tradeSize: number;
    if (baseSymbol === 'WBNB') {
      tradeSize = 600; // ~$600/BNB
    } else if (baseSymbol === 'WETH') {
      tradeSize = 3500; // ~$3500/ETH
    } else {
      tradeSize = 1000; // Default for stablecoins
    }
    return (tradeSize * profitBps) / 10000;
  }

  private async saveOpportunity(opp: ArbitrageOpportunity): Promise<void> {
    try {
      // Calculate expected values (gas estimate varies by chain)
      const expectedProfitWei = BigInt(Math.floor(opp.estimatedProfitBps * 1e14));
      const gasMultiplier = this.chain === 'ethereum' ? 10 : 1; // ETH gas is ~10x higher
      const expectedGasWei = BigInt(5e14 * gasMultiplier);
      const expectedNetProfitWei = expectedProfitWei - expectedGasWei;

      this.db.prepare(`
        INSERT INTO opportunities (
          id, chain, route_tokens, route_token_symbols, route_dexes,
          expected_profit_wei, expected_profit_usd, expected_gas_wei,
          expected_net_profit_wei, confidence, confidence_score,
          detected_at, valid_until, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        opp.id,
        this.chain,
        JSON.stringify([opp.token0, opp.token1]),
        JSON.stringify([opp.symbol0, opp.symbol1]),
        JSON.stringify([opp.buyDex, opp.sellDex]),
        expectedProfitWei.toString(),
        opp.estimatedProfitUsd,
        expectedGasWei.toString(),
        expectedNetProfitWei.toString(),
        opp.confidence,
        opp.confidence === 'very_high' ? 0.9 : opp.confidence === 'high' ? 0.7 : opp.confidence === 'medium' ? 0.5 : 0.3,
        opp.detectedAt.toISOString(),
        new Date(Date.now() + 30000).toISOString(),
        'detected'
      );
    } catch (error) {
      // Duplicate or other error, skip
    }
  }

  // Public methods for status
  getStats(): IngestionStats {
    return { ...this.stats };
  }

  getPrices(): Map<string, PairInfo> {
    return new Map(this.pairs);
  }

  getPriceForPair(dex: string, symbolA: string, symbolB: string): PairInfo | null {
    const key = `${dex.toLowerCase()}:${symbolA}/${symbolB}`;
    return this.pairs.get(key) || null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * MMBF-based multi-hop arbitrage detection
   * Uses Modified Moore-Bellman-Ford algorithm to find ALL profitable cycles
   */
  private async detectArbitrageMMBF(): Promise<void> {
    if (!this.mmbfDetector) return;

    // Convert PairInfo map to Edge[] format for MMBF
    const edges: Edge[] = [];

    for (const pair of this.pairs.values()) {
      // Skip pools with insufficient liquidity
      if (!this.hasMinimumLiquidity(pair)) {
        continue;
      }

      // Get DEX fee (look up from config)
      const dexKey = Object.entries(this.dexConfigs).find(
        ([_, config]) => config.name === pair.dex
      )?.[0];
      const feeBps = dexKey ? this.dexConfigs[dexKey].fee : 30;

      // Create edge for token0 -> token1
      if (pair.price0 > 0) {
        edges.push({
          tokenIn: pair.token0,
          tokenOut: pair.token1,
          pool: pair.address,
          dex: pair.dex,
          rate: pair.price0 * (1 - feeBps / 10000), // Apply fee to rate
          reserveIn: pair.reserve0,
          reserveOut: pair.reserve1,
          feeBps,
        });
      }

      // Create edge for token1 -> token0
      if (pair.price1 > 0) {
        edges.push({
          tokenIn: pair.token1,
          tokenOut: pair.token0,
          pool: pair.address,
          dex: pair.dex,
          rate: pair.price1 * (1 - feeBps / 10000), // Apply fee to rate
          reserveIn: pair.reserve1,
          reserveOut: pair.reserve0,
          feeBps,
        });
      }
    }

    if (edges.length === 0) return;

    // Get start tokens for this chain (native wrapped + stablecoins)
    const startTokens = this.getStartTokensForChain();

    // Run MMBF algorithm
    const paths = this.mmbfDetector.findArbitrage(edges, startTokens);

    // Process and save profitable paths
    for (const path of paths) {
      if (path.netProfitWei <= 0n) continue;

      // Extract route info
      const routeTokens = [path.startToken];
      const routeDexes: string[] = [];
      const routeSymbols = [this.getSymbolForAddress(path.startToken)];

      for (const edge of path.edges) {
        routeTokens.push(edge.tokenOut);
        routeDexes.push(edge.dex);
        routeSymbols.push(this.getSymbolForAddress(edge.tokenOut));
      }

      // Determine confidence
      const confidence: 'low' | 'medium' | 'high' | 'very_high' =
        path.confidence >= 0.8 ? 'very_high' :
        path.confidence >= 0.6 ? 'high' :
        path.confidence >= 0.4 ? 'medium' : 'low';

      const opportunityId = randomUUID();

      // Save to database
      try {
        this.db.prepare(`
          INSERT INTO opportunities (
            id, chain, route_tokens, route_token_symbols, route_dexes,
            expected_profit_wei, expected_profit_usd, expected_gas_wei,
            expected_net_profit_wei, confidence, confidence_score,
            detected_at, valid_until, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          opportunityId,
          this.chain,
          JSON.stringify(routeTokens),
          JSON.stringify(routeSymbols),
          JSON.stringify(routeDexes),
          (path.netProfitWei + BigInt(path.gasEstimate) * BigInt(this.mmbfDetector ? 5e9 : 5e9)).toString(),
          path.estimatedProfitUsd,
          (BigInt(path.gasEstimate) * BigInt(5e9)).toString(),
          path.netProfitWei.toString(),
          confidence,
          path.confidence,
          new Date().toISOString(),
          new Date(Date.now() + 15000).toISOString(), // 15 second validity for multi-hop
          'detected'
        );

        this.stats.opportunitiesDetected++;

        // Broadcast via WebSocket
        try {
          const wsServer = getWebSocketServer();
          if (wsServer.isRunning()) {
            wsServer.broadcastOpportunity({
              chain: this.chain,
              id: opportunityId,
              pair: routeSymbols.join(' → '),
              buyDex: routeDexes[0],
              sellDex: routeDexes[routeDexes.length - 1],
              buyPrice: path.edges[0]?.rate || 0,
              sellPrice: path.edges[path.edges.length - 1]?.rate || 0,
              spreadBps: path.profitBps,
              netProfitBps: path.profitBps,
              estimatedProfitUsd: path.estimatedProfitUsd,
              hops: path.hops,
              timestamp: Date.now(),
            });
          }
        } catch {
          // WebSocket not available
        }

        console.log(
          `⚡ [${this.chain.toUpperCase()}] MMBF ${path.hops}-HOP: ` +
          `${routeSymbols.join(' → ')} | ` +
          `DEXs: ${routeDexes.join(' → ')} | ` +
          `Profit: ${path.profitBps}bps ($${path.estimatedProfitUsd.toFixed(2)}) | ` +
          `Confidence: ${(path.confidence * 100).toFixed(0)}%`
        );

      } catch (error) {
        // Duplicate or other error, skip
      }
    }
  }

  /**
   * Get start tokens for MMBF algorithm based on chain
   */
  private getStartTokensForChain(): string[] {
    const chainTokens = TOKENS[this.chain];
    const startTokens: string[] = [];

    // Add native wrapped token
    if (this.chain === 'bsc' && chainTokens.WBNB) {
      startTokens.push(chainTokens.WBNB.address);
    } else if (chainTokens.WETH) {
      startTokens.push(chainTokens.WETH.address);
    }

    // Add stablecoins
    if (chainTokens.USDT) startTokens.push(chainTokens.USDT.address);
    if (chainTokens.USDC) startTokens.push(chainTokens.USDC.address);
    if (chainTokens.BUSD) startTokens.push(chainTokens.BUSD.address);

    return startTokens;
  }

  /**
   * Get token symbol from address
   */
  private getSymbolForAddress(address: string): string {
    for (const [symbol, token] of Object.entries(this.tokens)) {
      if (token.address.toLowerCase() === address.toLowerCase()) {
        return symbol;
      }
    }
    return address.slice(0, 8) + '...';
  }
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

async function main() {
  console.clear();
  console.log(`
  ╔═══════════════════════════════════════════════════════════════╗
  ║                                                               ║
  ║   ██████╗ ██████╗  █████╗  ██████╗██╗     ███████╗           ║
  ║  ██╔═══██╗██╔══██╗██╔══██╗██╔════╝██║     ██╔════╝           ║
  ║  ██║   ██║██████╔╝███████║██║     ██║     █████╗             ║
  ║  ██║   ██║██╔══██╗██╔══██║██║     ██║     ██╔══╝             ║
  ║  ╚██████╔╝██║  ██║██║  ██║╚██████╗███████╗███████╗           ║
  ║   ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚══════╝╚══════╝           ║
  ║                                                               ║
  ║           LIVE BSC PRICE INGESTION SERVICE                    ║
  ║                                                               ║
  ╚═══════════════════════════════════════════════════════════════╝
  `);

  const rpcUrl = process.env.BSC_RPC_URL || 'https://bsc-mainnet.core.chainstack.com/acba35ed74b7bbddda5fdbc98656b7e3';

  const service = new PriceIngestionService({
    rpcUrl,
    pollIntervalMs: 2000, // Poll every 2 seconds
    minSpreadBps: 5, // Detect spreads >= 0.05%
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\n📊 Final Stats:');
    const stats = service.getStats();
    console.log(`   Pairs Monitored: ${stats.pairsMonitored}`);
    console.log(`   Price Updates: ${stats.priceUpdates}`);
    console.log(`   Opportunities Detected: ${stats.opportunitiesDetected}`);
    console.log(`   Runtime: ${Math.round((Date.now() - stats.startTime.getTime()) / 1000)}s\n`);

    service.stop();
    process.exit(0);
  });

  // Print stats periodically
  setInterval(() => {
    const stats = service.getStats();
    if (stats.lastUpdate) {
      process.stdout.write(
        `\r📡 Updates: ${stats.priceUpdates} | ⚡ Opportunities: ${stats.opportunitiesDetected} | ⏱️  Last: ${stats.lastUpdate.toLocaleTimeString()}   `
      );
    }
  }, 5000);

  await service.start();
}

// Run if called directly
if (process.argv[1]?.includes('priceIngestion')) {
  main().catch(console.error);
}

export default PriceIngestionService;
