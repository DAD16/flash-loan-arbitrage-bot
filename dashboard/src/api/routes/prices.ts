/**
 * Price Monitoring API Routes
 * Endpoints for live price data and arbitrage opportunity detection
 * Supports multiple chains: BSC, Ethereum, Arbitrum, Base
 */

import { Router, Request, Response } from 'express';
import PriceIngestionService, { type SupportedChain } from '../../services/priceIngestion.js';
import db from '../db.js';

const router = Router();

// Price services per chain
const priceServices: Map<SupportedChain, PriceIngestionService> = new Map();

// Helper to get price service for a chain
function getPriceService(chain: SupportedChain): PriceIngestionService | null {
  return priceServices.get(chain) || null;
}

// Helper to get all running services
function getAllPriceServices(): PriceIngestionService[] {
  return Array.from(priceServices.values());
}

// GET /api/prices/status - Get price monitoring status (supports ?chain=bsc|ethereum|arbitrum|base)
router.get('/status', (req: Request, res: Response) => {
  const chain = (req.query.chain as SupportedChain) || 'bsc';
  const priceService = getPriceService(chain);

  if (!priceService) {
    // Return aggregate status if no specific chain
    const allServices = getAllPriceServices();
    if (allServices.length === 0) {
      return res.json({
        data: {
          running: false,
          chain: null,
          pairsMonitored: 0,
          priceUpdates: 0,
          opportunitiesDetected: 0,
          lastUpdate: null,
          message: 'No price monitoring services running',
          activeChains: []
        }
      });
    }

    // Aggregate stats from all running services
    const aggregateStats = {
      running: true,
      activeChains: allServices.map(s => s.getChain()),
      pairsMonitored: allServices.reduce((sum, s) => sum + s.getStats().pairsMonitored, 0),
      priceUpdates: allServices.reduce((sum, s) => sum + s.getStats().priceUpdates, 0),
      opportunitiesDetected: allServices.reduce((sum, s) => sum + s.getStats().opportunitiesDetected, 0),
      lastUpdate: new Date(Math.max(...allServices.map(s => s.getStats().lastUpdate?.getTime() || 0))).toISOString(),
    };
    return res.json({ data: aggregateStats });
  }

  const stats = priceService.getStats();
  res.json({
    data: {
      running: stats.isRunning,
      chain: priceService.getChain(),
      pairsMonitored: stats.pairsMonitored,
      priceUpdates: stats.priceUpdates,
      opportunitiesDetected: stats.opportunitiesDetected,
      lastUpdate: stats.lastUpdate?.toISOString() || null,
      startTime: stats.startTime.toISOString(),
      uptimeSeconds: Math.floor((Date.now() - stats.startTime.getTime()) / 1000)
    }
  });
});

// GET /api/prices/live - Get current live prices (supports ?chain=bsc|ethereum|arbitrum|base)
router.get('/live', (req: Request, res: Response) => {
  const chain = (req.query.chain as SupportedChain) || 'bsc';
  const priceService = getPriceService(chain);

  if (!priceService) {
    return res.json({
      data: {
        prices: [],
        chain,
        message: `Price monitoring not started for ${chain.toUpperCase()}`
      }
    });
  }

  const prices = priceService.getPrices();
  const priceList = Array.from(prices.entries()).map(([key, pair]) => ({
    key,
    dex: pair.dex,
    pair: `${pair.symbol0}/${pair.symbol1}`,
    symbol0: pair.symbol0,
    symbol1: pair.symbol1,
    price0: pair.price0,
    price1: pair.price1,
    reserve0: pair.reserve0.toString(),
    reserve1: pair.reserve1.toString(),
    lastUpdate: pair.lastUpdate.toISOString()
  }));

  // Group by pair for cross-DEX comparison
  const grouped: Record<string, any[]> = {};
  for (const price of priceList) {
    if (!grouped[price.pair]) {
      grouped[price.pair] = [];
    }
    grouped[price.pair].push(price);
  }

  // Calculate spreads for each pair
  const withSpreads = Object.entries(grouped).map(([pair, dexPrices]) => {
    const prices = dexPrices.map(p => p.price0).filter(p => p > 0);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const spreadBps = minPrice > 0 ? Math.round(((maxPrice - minPrice) / minPrice) * 10000) : 0;

    return {
      pair,
      dexCount: dexPrices.length,
      minPrice,
      maxPrice,
      spreadBps,
      dexes: dexPrices.sort((a, b) => a.price0 - b.price0)
    };
  }).sort((a, b) => b.spreadBps - a.spreadBps);

  res.json({
    data: {
      prices: withSpreads,
      totalPairs: priceList.length,
      lastUpdate: priceService.getStats().lastUpdate?.toISOString() || null
    }
  });
});

// GET /api/prices/opportunities - Get recent arbitrage opportunities
router.get('/opportunities', (req: Request, res: Response) => {
  try {
    const { chain = 'bsc', limit = 50, min_spread_bps } = req.query;

    let sql = `
      SELECT * FROM opportunities
      WHERE chain = ?
      AND detected_at >= datetime('now', '-1 hour')
    `;
    const params: (string | number)[] = [chain as string];

    if (min_spread_bps) {
      // Filter by expected profit which correlates with spread
      sql += ' AND CAST(expected_net_profit_wei AS REAL) > 0';
    }

    sql += ' ORDER BY detected_at DESC LIMIT ?';
    params.push(Number(limit));

    const opportunities = db.prepare(sql).all(...params);

    // Parse JSON fields
    const parsed = opportunities.map((opp: any) => ({
      ...opp,
      route_tokens: JSON.parse(opp.route_tokens),
      route_token_symbols: opp.route_token_symbols ? JSON.parse(opp.route_token_symbols) : null,
      route_dexes: JSON.parse(opp.route_dexes),
      age_seconds: Math.floor((Date.now() - new Date(opp.detected_at).getTime()) / 1000)
    }));

    res.json({ data: parsed });
  } catch (error) {
    console.error('Error fetching opportunities:', error);
    res.status(500).json({ error: 'Failed to fetch opportunities' });
  }
});

// GET /api/prices/spreads - Get current spreads across DEXs (supports ?chain=bsc|ethereum|arbitrum|base)
router.get('/spreads', (req: Request, res: Response) => {
  const chain = (req.query.chain as SupportedChain) || 'bsc';
  const priceService = getPriceService(chain);

  if (!priceService) {
    return res.json({
      data: [],
      chain,
      message: `Price monitoring not started for ${chain.toUpperCase()}`
    });
  }

  const prices = priceService.getPrices();

  // Group by pair symbol
  const pairGroups: Map<string, Array<{ dex: string; price: number; liquidity: bigint }>> = new Map();

  for (const pair of prices.values()) {
    const key = `${pair.symbol0}/${pair.symbol1}`;
    if (!pairGroups.has(key)) {
      pairGroups.set(key, []);
    }
    pairGroups.get(key)!.push({
      dex: pair.dex,
      price: pair.price0,
      liquidity: pair.reserve0
    });
  }

  // Calculate arbitrage opportunities
  const spreads = [];
  for (const [pair, dexPrices] of pairGroups.entries()) {
    if (dexPrices.length < 2) continue;

    const validPrices = dexPrices.filter(p => p.price > 0);
    if (validPrices.length < 2) continue;

    const sorted = validPrices.sort((a, b) => a.price - b.price);
    const lowest = sorted[0];
    const highest = sorted[sorted.length - 1];

    const spreadBps = Math.round(((highest.price - lowest.price) / lowest.price) * 10000);
    const estimatedFeesBps = 60; // ~0.6% total fees (0.25% + 0.25% swap fees + gas)
    const netProfitBps = spreadBps - estimatedFeesBps;

    if (spreadBps >= 5) { // Only show spreads >= 0.05%
      spreads.push({
        pair,
        buyDex: lowest.dex,
        sellDex: highest.dex,
        buyPrice: lowest.price,
        sellPrice: highest.price,
        spreadBps,
        netProfitBps,
        isProfitable: netProfitBps > 0,
        estimatedProfitUsd: netProfitBps > 0 ? (netProfitBps / 10000) * 600 : 0 // Assuming 1 BNB trade @ $600
      });
    }
  }

  // Sort by spread (highest first)
  spreads.sort((a, b) => b.spreadBps - a.spreadBps);

  res.json({
    data: spreads,
    summary: {
      totalPairs: pairGroups.size,
      pairsWithSpread: spreads.length,
      profitableOpportunities: spreads.filter(s => s.isProfitable).length,
      maxSpreadBps: spreads.length > 0 ? spreads[0].spreadBps : 0
    }
  });
});

// POST /api/prices/start - Start price monitoring for a chain
router.post('/start', async (req: Request, res: Response) => {
  try {
    const {
      chain = 'bsc',
      pollIntervalMs = 2000,
      minSpreadBps = 5,
      useMMBF = false,
      useWebSocket = true  // Default to WebSocket mode for real-time
    } = req.body;
    const targetChain = chain as SupportedChain;

    // Check if already running for this chain
    const existing = priceServices.get(targetChain);
    if (existing) {
      const stats = existing.getStats();
      if (stats.isRunning) {
        return res.status(400).json({ error: `Price monitoring already running for ${targetChain.toUpperCase()}` });
      }
    }

    const priceService = new PriceIngestionService({
      chain: targetChain,
      pollIntervalMs: Number(pollIntervalMs),
      minSpreadBps: Number(minSpreadBps),
      useMMBF: Boolean(useMMBF),  // Enable MMBF multi-hop detection
      useWebSocket: Boolean(useWebSocket),  // Enable real-time WebSocket subscriptions
    });

    await priceService.start();
    priceServices.set(targetChain, priceService);

    res.json({
      data: {
        message: `Price monitoring started for ${targetChain.toUpperCase()}`,
        chain: targetChain,
        useMMBF: Boolean(useMMBF),
        useWebSocket: Boolean(useWebSocket),
        mode: Boolean(useWebSocket) ? 'realtime' : 'polling',
        ...priceService.getStats()
      }
    });
  } catch (error) {
    console.error('Error starting price monitoring:', error);
    res.status(500).json({ error: 'Failed to start price monitoring' });
  }
});

// POST /api/prices/stop - Stop price monitoring for a chain
router.post('/stop', (req: Request, res: Response) => {
  const { chain = 'bsc' } = req.body;
  const targetChain = chain as SupportedChain;
  const priceService = priceServices.get(targetChain);

  if (!priceService) {
    return res.status(400).json({ error: `Price monitoring not running for ${targetChain.toUpperCase()}` });
  }

  const stats = priceService.getStats();
  priceService.stop();
  priceServices.delete(targetChain);

  res.json({
    data: {
      message: `Price monitoring stopped for ${targetChain.toUpperCase()}`,
      chain: targetChain,
      finalStats: {
        pairsMonitored: stats.pairsMonitored,
        priceUpdates: stats.priceUpdates,
        opportunitiesDetected: stats.opportunitiesDetected,
        uptimeSeconds: Math.floor((Date.now() - stats.startTime.getTime()) / 1000)
      }
    }
  });
});

// GET /api/prices/pair/:pair - Get prices for specific pair across DEXs (supports ?chain=bsc|ethereum|arbitrum|base)
router.get('/pair/:pair', (req: Request, res: Response) => {
  const chain = (req.query.chain as SupportedChain) || 'bsc';
  const priceService = getPriceService(chain);

  if (!priceService) {
    return res.status(400).json({ error: `Price monitoring not started for ${chain.toUpperCase()}` });
  }

  const { pair } = req.params;
  const [symbol0, symbol1] = pair.toUpperCase().split('-');

  if (!symbol0 || !symbol1) {
    return res.status(400).json({ error: 'Invalid pair format. Use: TOKEN0-TOKEN1 (e.g., WBNB-USDT or WETH-USDC)' });
  }

  const prices = priceService.getPrices();
  const matching = [];

  for (const [key, pairInfo] of prices.entries()) {
    if (
      (pairInfo.symbol0 === symbol0 && pairInfo.symbol1 === symbol1) ||
      (pairInfo.symbol0 === symbol1 && pairInfo.symbol1 === symbol0)
    ) {
      matching.push({
        dex: pairInfo.dex,
        pair: `${pairInfo.symbol0}/${pairInfo.symbol1}`,
        price: pairInfo.price0,
        inversePrice: pairInfo.price1,
        reserve0: pairInfo.reserve0.toString(),
        reserve1: pairInfo.reserve1.toString(),
        lastUpdate: pairInfo.lastUpdate.toISOString()
      });
    }
  }

  if (matching.length === 0) {
    return res.status(404).json({ error: `No price data found for ${symbol0}/${symbol1} on ${chain.toUpperCase()}` });
  }

  // Calculate spread
  const prices_arr = matching.map(m => m.price).filter(p => p > 0);
  const minPrice = Math.min(...prices_arr);
  const maxPrice = Math.max(...prices_arr);
  const spreadBps = minPrice > 0 ? Math.round(((maxPrice - minPrice) / minPrice) * 10000) : 0;

  res.json({
    data: {
      pair: `${symbol0}/${symbol1}`,
      chain,
      dexCount: matching.length,
      minPrice,
      maxPrice,
      spreadBps,
      dexes: matching.sort((a, b) => a.price - b.price)
    }
  });
});

/**
 * Auto-start price monitoring services for multiple chains
 * Called by server.ts on startup
 */
export async function autoStartPriceService(chains: SupportedChain[] = ['bsc']): Promise<boolean> {
  let allSuccess = true;

  for (const chain of chains) {
    try {
      const existing = priceServices.get(chain);
      if (existing) {
        const stats = existing.getStats();
        if (stats.isRunning) {
          console.log(`  📊 Price service already running for ${chain.toUpperCase()}`);
          continue;
        }
      }

      const priceService = new PriceIngestionService({
        chain,
        pollIntervalMs: 2000,
        minSpreadBps: 5,
      });

      await priceService.start();
      priceServices.set(chain, priceService);
      console.log(`  📊 Price Ingestion Service: ${chain.toUpperCase()} STARTED (auto)`);
    } catch (error) {
      console.error(`  ⚠️  Price service auto-start failed for ${chain.toUpperCase()}:`, (error as Error).message);
      allSuccess = false;
    }
  }

  if (priceServices.size > 0) {
    console.log(`     Polling every 2s, min spread: 5bps across ${priceServices.size} chain(s)`);
  }

  return allSuccess;
}

export default router;
