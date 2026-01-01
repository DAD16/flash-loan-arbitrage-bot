/**
 * Live Price Ingestion Service
 * Monitors BSC DEX prices in real-time and detects arbitrage opportunities
 *
 * Agent: ORACLE (Price Prediction Engine)
 */

import { createPublicClient, http, webSocket, parseAbi, formatUnits, type Log } from 'viem';
import { bsc } from 'viem/chains';
import Database from 'better-sqlite3';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '../../db/matrix.db');

// ============================================================================
// DEX CONFIGURATION
// ============================================================================

interface DexConfig {
  name: string;
  factory: string;
  router: string;
  fee: number; // basis points
}

const DEX_CONFIGS: Record<string, DexConfig> = {
  pancakeswap: {
    name: 'PancakeSwap',
    factory: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73',
    router: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
    fee: 25, // 0.25%
  },
  biswap: {
    name: 'Biswap',
    factory: '0x858E3312ed3A876947EA49d572A7C42DE08af7EE',
    router: '0x3a6d8cA21D1CF76F653A67577FA0D27453350dD8',
    fee: 10, // 0.1%
  },
  apeswap: {
    name: 'ApeSwap',
    factory: '0x0841BD0B734E4F5853f0dD8d7Ea041c241fb0Da6',
    router: '0xcF0feBd3f17CEf5b47b0cD257aCf6025c5BFf3b7',
    fee: 20, // 0.2%
  },
  mdex: {
    name: 'MDEX',
    factory: '0x3CD1C46068dAEa5Ebb0d3f55F6915B10648062B8',
    router: '0x7DAe51BD3E3376B8c7c4900E9107f12Be3AF1bA8',
    fee: 30, // 0.3%
  },
  babyswap: {
    name: 'BabySwap',
    factory: '0x86407bEa2078ea5f5EB5A52B2caA963bC1F889Da',
    router: '0x325E343f1dE602396E256B67eFd1F61C3A6B38Bd',
    fee: 30, // 0.3%
  },
};

// ============================================================================
// TOKEN CONFIGURATION
// ============================================================================

interface TokenConfig {
  address: string;
  symbol: string;
  decimals: number;
  isStable?: boolean;
}

const TOKENS: Record<string, TokenConfig> = {
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
  XRP: {
    address: '0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE',
    symbol: 'XRP',
    decimals: 18,
  },
  DOGE: {
    address: '0xbA2aE424d960c26247Dd6c32edC70B295c744C43',
    symbol: 'DOGE',
    decimals: 8,
  },
};

// Trading pairs to monitor
const MONITORED_PAIRS = [
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
];

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
  private isRunning: boolean = false;
  private stats: IngestionStats;
  private rpcUrl: string;
  private wsUrl: string;
  private pollIntervalMs: number;
  private minSpreadBps: number;

  constructor(config: {
    rpcUrl?: string;
    wsUrl?: string;
    pollIntervalMs?: number;
    minSpreadBps?: number;
  } = {}) {
    this.rpcUrl = config.rpcUrl || process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org';
    this.wsUrl = config.wsUrl || process.env.BSC_WS_URL || '';
    this.pollIntervalMs = config.pollIntervalMs || 1000; // 1 second default
    this.minSpreadBps = config.minSpreadBps || 10; // 0.1% minimum spread

    // Create HTTP client
    this.httpClient = createPublicClient({
      chain: bsc,
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
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Price ingestion already running');
      return;
    }

    console.log('\n' + '═'.repeat(60));
    console.log('  🔮 ORACLE - Live Price Ingestion Service');
    console.log('═'.repeat(60));
    console.log(`  RPC: ${this.rpcUrl.substring(0, 50)}...`);
    console.log(`  Poll Interval: ${this.pollIntervalMs}ms`);
    console.log(`  Min Spread: ${this.minSpreadBps} bps`);
    console.log('═'.repeat(60) + '\n');

    this.isRunning = true;
    this.stats.isRunning = true;
    this.stats.startTime = new Date();

    // Discover and initialize pairs
    await this.discoverPairs();

    // Start polling loop
    this.pollLoop();

    console.log(`\n✅ Monitoring ${this.pairs.size} pairs across ${Object.keys(DEX_CONFIGS).length} DEXs\n`);
  }

  stop(): void {
    console.log('\n🛑 Stopping price ingestion...');
    this.isRunning = false;
    this.stats.isRunning = false;
  }

  private async discoverPairs(): Promise<void> {
    console.log('🔍 Discovering DEX pairs...\n');

    for (const [dexKey, dex] of Object.entries(DEX_CONFIGS)) {
      console.log(`  ${dex.name}:`);

      for (const [symbolA, symbolB] of MONITORED_PAIRS) {
        const tokenA = TOKENS[symbolA];
        const tokenB = TOKENS[symbolB];

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
          console.log(`    ✓ ${symbolA}/${symbolB}: ${pairAddress.slice(0, 10)}...`);

        } catch (error) {
          // Pair doesn't exist or error fetching
        }
      }
    }

    this.stats.pairsMonitored = this.pairs.size;
  }

  private calculatePrice(reserveA: bigint, reserveB: bigint, decimalsA: number, decimalsB: number): number {
    if (reserveA === BigInt(0)) return 0;

    const adjustedA = Number(reserveA) / Math.pow(10, decimalsA);
    const adjustedB = Number(reserveB) / Math.pow(10, decimalsB);

    return adjustedB / adjustedA;
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
      }
    } catch (error) {
      // Skip failed updates
    }
  }

  private async detectArbitrageOpportunities(): Promise<void> {
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

              console.log(
                `⚡ ARB: ${pairA.symbol0}/${pairA.symbol1} | ` +
                `Buy@${buyDex} ${buyPrice.toFixed(6)} → Sell@${sellDex} ${sellPrice.toFixed(6)} | ` +
                `Spread: ${spreadBps}bps | Est. Profit: ${estimatedProfitBps}bps`
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
    // Rough estimate assuming 1 BNB trade size and ~$600/BNB
    const tradeSize = baseSymbol === 'WBNB' ? 600 : 1000;
    return (tradeSize * profitBps) / 10000;
  }

  private async saveOpportunity(opp: ArbitrageOpportunity): Promise<void> {
    try {
      // Calculate expected values
      const expectedProfitWei = BigInt(Math.floor(opp.estimatedProfitBps * 1e14)); // Rough estimate
      const expectedGasWei = BigInt(5e14); // ~0.0005 BNB gas
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
        'bsc',
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
        new Date(Date.now() + 30000).toISOString(), // Valid for 30 seconds
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
