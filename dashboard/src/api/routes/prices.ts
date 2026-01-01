/**
 * Price Monitoring API Routes
 * Endpoints for live price data and arbitrage opportunity detection
 */

import { Router, Request, Response } from 'express';
import PriceIngestionService from '../../services/priceIngestion.js';
import db from '../db.js';

const router = Router();

// Global price service instance
let priceService: PriceIngestionService | null = null;

// GET /api/prices/status - Get price monitoring status
router.get('/status', (req: Request, res: Response) => {
  if (!priceService) {
    return res.json({
      data: {
        running: false,
        pairsMonitored: 0,
        priceUpdates: 0,
        opportunitiesDetected: 0,
        lastUpdate: null,
        message: 'Price monitoring not started'
      }
    });
  }

  const stats = priceService.getStats();
  res.json({
    data: {
      running: stats.isRunning,
      pairsMonitored: stats.pairsMonitored,
      priceUpdates: stats.priceUpdates,
      opportunitiesDetected: stats.opportunitiesDetected,
      lastUpdate: stats.lastUpdate?.toISOString() || null,
      startTime: stats.startTime.toISOString(),
      uptimeSeconds: Math.floor((Date.now() - stats.startTime.getTime()) / 1000)
    }
  });
});

// GET /api/prices/live - Get current live prices
router.get('/live', (req: Request, res: Response) => {
  if (!priceService) {
    return res.json({
      data: {
        prices: [],
        message: 'Price monitoring not started'
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

// GET /api/prices/spreads - Get current spreads across DEXs
router.get('/spreads', (req: Request, res: Response) => {
  if (!priceService) {
    return res.json({
      data: [],
      message: 'Price monitoring not started'
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

// POST /api/prices/start - Start price monitoring
router.post('/start', async (req: Request, res: Response) => {
  try {
    const { pollIntervalMs = 2000, minSpreadBps = 5 } = req.body;

    if (priceService) {
      const stats = priceService.getStats();
      if (stats.isRunning) {
        return res.status(400).json({ error: 'Price monitoring already running' });
      }
    }

    const rpcUrl = process.env.BSC_RPC_URL || 'https://bsc-mainnet.core.chainstack.com/acba35ed74b7bbddda5fdbc98656b7e3';

    priceService = new PriceIngestionService({
      rpcUrl,
      pollIntervalMs: Number(pollIntervalMs),
      minSpreadBps: Number(minSpreadBps),
    });

    await priceService.start();

    res.json({
      data: {
        message: 'Price monitoring started',
        ...priceService.getStats()
      }
    });
  } catch (error) {
    console.error('Error starting price monitoring:', error);
    res.status(500).json({ error: 'Failed to start price monitoring' });
  }
});

// POST /api/prices/stop - Stop price monitoring
router.post('/stop', (req: Request, res: Response) => {
  if (!priceService) {
    return res.status(400).json({ error: 'Price monitoring not running' });
  }

  const stats = priceService.getStats();
  priceService.stop();

  res.json({
    data: {
      message: 'Price monitoring stopped',
      finalStats: {
        pairsMonitored: stats.pairsMonitored,
        priceUpdates: stats.priceUpdates,
        opportunitiesDetected: stats.opportunitiesDetected,
        uptimeSeconds: Math.floor((Date.now() - stats.startTime.getTime()) / 1000)
      }
    }
  });
});

// GET /api/prices/pair/:pair - Get prices for specific pair across DEXs
router.get('/pair/:pair', (req: Request, res: Response) => {
  if (!priceService) {
    return res.status(400).json({ error: 'Price monitoring not started' });
  }

  const { pair } = req.params;
  const [symbol0, symbol1] = pair.toUpperCase().split('-');

  if (!symbol0 || !symbol1) {
    return res.status(400).json({ error: 'Invalid pair format. Use: TOKEN0-TOKEN1 (e.g., WBNB-USDT)' });
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
    return res.status(404).json({ error: `No price data found for ${symbol0}/${symbol1}` });
  }

  // Calculate spread
  const prices_arr = matching.map(m => m.price).filter(p => p > 0);
  const minPrice = Math.min(...prices_arr);
  const maxPrice = Math.max(...prices_arr);
  const spreadBps = minPrice > 0 ? Math.round(((maxPrice - minPrice) / minPrice) * 10000) : 0;

  res.json({
    data: {
      pair: `${symbol0}/${symbol1}`,
      dexCount: matching.length,
      minPrice,
      maxPrice,
      spreadBps,
      dexes: matching.sort((a, b) => a.price - b.price)
    }
  });
});

export default router;
