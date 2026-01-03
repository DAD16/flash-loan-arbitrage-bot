import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Play,
  Square,
  RefreshCw,
  Zap,
  DollarSign,
  Clock,
  Wifi,
  WifiOff,
} from 'lucide-react';
import clsx from 'clsx';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import FastModeControl from '../components/FastModeControl';
import PriceSparkline, { PricePoint, generateMockPriceData } from '../components/charts/PriceSparkline';
import { useStore, type Chain } from '../store/useStore';
import { useLivePrices, useLiveOpportunities, type PriceUpdate, type OpportunityUpdate } from '../hooks/useWebSocket';

// Chain-specific configurations for price monitoring
const CHAIN_CONFIGS: Record<Chain, { name: string; supported: boolean; symbol: string }> = {
  bsc: { name: 'BSC', supported: true, symbol: 'BNB' },
  sepolia: { name: 'Sepolia', supported: false, symbol: 'ETH' },
  ethereum: { name: 'Ethereum', supported: true, symbol: 'ETH' },
  arbitrum: { name: 'Arbitrum', supported: true, symbol: 'ETH' },
  base: { name: 'Base', supported: true, symbol: 'ETH' },
  optimism: { name: 'Optimism', supported: false, symbol: 'ETH' },
};

interface PriceStatus {
  running: boolean;
  pairsMonitored: number;
  priceUpdates: number;
  opportunitiesDetected: number;
  lastUpdate: string | null;
  startTime?: string;
  uptimeSeconds?: number;
}

interface Spread {
  pair: string;
  buyDex: string;
  sellDex: string;
  buyPrice: number;
  sellPrice: number;
  spreadBps: number;
  netProfitBps: number;
  isProfitable: boolean;
  estimatedProfitUsd: number;
}

interface SpreadSummary {
  totalPairs: number;
  pairsWithSpread: number;
  profitableOpportunities: number;
  maxSpreadBps: number;
}

interface LivePrice {
  pair: string;
  dexCount: number;
  minPrice: number;
  maxPrice: number;
  spreadBps: number;
  dexes: Array<{
    dex: string;
    price0: number;
    lastUpdate: string;
  }>;
}

const API_BASE = 'http://localhost:9081';

// Format price with appropriate precision for very small or large numbers
function formatPrice(price: number): string {
  if (price === 0) return '0';
  if (price < 0.000001) {
    // Very small prices (like meme tokens) - use scientific notation
    return price.toExponential(4);
  }
  if (price < 0.01) {
    return price.toFixed(8);
  }
  if (price < 1) {
    return price.toFixed(6);
  }
  if (price < 1000) {
    return price.toFixed(4);
  }
  return price.toFixed(2);
}

export default function Prices() {
  const { addNotification, selectedChain } = useStore();
  const chainConfig = CHAIN_CONFIGS[selectedChain];
  const [status, setStatus] = useState<PriceStatus | null>(null);
  const [spreads, setSpreads] = useState<Spread[]>([]);
  const [summary, setSummary] = useState<SpreadSummary | null>(null);
  const [livePrices, setLivePrices] = useState<LivePrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Price history for sparklines - stores last 60 price points per pair
  const priceHistoryRef = useRef<Map<string, PricePoint[]>>(new Map());
  const [priceHistory, setPriceHistory] = useState<Map<string, PricePoint[]>>(new Map());

  // WebSocket hooks for real-time updates
  const { connected: wsPricesConnected, prices: wsPrices, latency } = useLivePrices();
  const { connected: wsOpportunitiesConnected, opportunities: wsOpportunities } = useLiveOpportunities();
  const wsConnected = wsPricesConnected || wsOpportunitiesConnected;

  // Map frontend chain names to API chain names (must be before useMemo hooks that use it)
  const apiChain = chainConfig.supported ? selectedChain : 'bsc';

  // Filter WebSocket data by selected chain and merge with HTTP data
  const mergedLivePrices = useMemo(() => {
    if (!wsConnected || wsPrices.length === 0) {
      return livePrices;
    }

    // Filter WebSocket prices by selected chain
    const chainPrices = wsPrices.filter(p => p.chain === apiChain);
    if (chainPrices.length === 0) {
      return livePrices;
    }

    // Group by pair
    const wsPricesByPair = new Map<string, PriceUpdate[]>();
    for (const p of chainPrices) {
      const existing = wsPricesByPair.get(p.pair) || [];
      existing.push(p);
      wsPricesByPair.set(p.pair, existing);
    }

    // Create merged price data
    const merged: LivePrice[] = [];
    for (const [pair, updates] of wsPricesByPair) {
      const prices = updates.map(u => u.price).filter(p => p > 0);
      if (prices.length === 0) continue;

      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const spreadBps = maxPrice > 0 ? Math.round(((maxPrice - minPrice) / minPrice) * 10000) : 0;

      merged.push({
        pair,
        dexCount: updates.length,
        minPrice,
        maxPrice,
        spreadBps,
        dexes: updates.map(u => ({
          dex: u.dex,
          price0: u.price,
          lastUpdate: new Date(u.timestamp).toISOString(),
        })),
      });
    }

    return merged.length > 0 ? merged.sort((a, b) => b.spreadBps - a.spreadBps) : livePrices;
  }, [wsConnected, wsPrices, livePrices, apiChain]);

  // Filter WebSocket opportunities by selected chain and merge with HTTP data
  const mergedSpreads = useMemo(() => {
    if (!wsConnected || wsOpportunities.length === 0) {
      return spreads;
    }

    // Filter by selected chain
    const chainOpportunities = wsOpportunities.filter(opp => opp.chain === apiChain);
    if (chainOpportunities.length === 0) {
      return spreads;
    }

    // Map WS opportunities to spread format
    const wsToSpreads: Spread[] = chainOpportunities.map(opp => ({
      pair: opp.pair,
      buyDex: opp.buyDex,
      sellDex: opp.sellDex,
      buyPrice: opp.buyPrice || 0,
      sellPrice: opp.sellPrice || 0,
      spreadBps: opp.spreadBps,
      netProfitBps: opp.netProfitBps,
      isProfitable: opp.netProfitBps > 0,
      estimatedProfitUsd: opp.estimatedProfitUsd,
    }));

    // Merge with HTTP spreads
    const spreadMap = new Map<string, Spread>();
    for (const s of spreads) {
      spreadMap.set(`${s.pair}-${s.buyDex}-${s.sellDex}`, s);
    }
    for (const s of wsToSpreads) {
      const key = `${s.pair}-${s.buyDex}-${s.sellDex}`;
      const existing = spreadMap.get(key);
      if (existing && s.buyPrice === 0 && s.sellPrice === 0) {
        spreadMap.set(key, { ...s, buyPrice: existing.buyPrice, sellPrice: existing.sellPrice });
      } else {
        spreadMap.set(key, s);
      }
    }

    return Array.from(spreadMap.values()).sort((a, b) => b.spreadBps - a.spreadBps);
  }, [wsConnected, wsOpportunities, spreads, apiChain]);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/prices/status?chain=${apiChain}&_t=${Date.now()}`, {
        cache: 'no-store'
      });
      const data = await response.json();
      setStatus(data.data);
    } catch (error) {
      console.error('Error fetching status:', error);
    }
  }, [apiChain]);

  const fetchSpreads = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/prices/spreads?chain=${apiChain}&_t=${Date.now()}`, {
        cache: 'no-store'
      });
      const data = await response.json();
      setSpreads(data.data || []);
      setSummary(data.summary || null);
    } catch (error) {
      console.error('Error fetching spreads:', error);
    }
  }, [apiChain]);

  const fetchLivePrices = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/prices/live?chain=${apiChain}&_t=${Date.now()}`, {
        cache: 'no-store'
      });
      const data = await response.json();
      setLivePrices(data.data?.prices || []);
    } catch (error) {
      console.error('Error fetching live prices:', error);
    }
  }, [apiChain]);

  const fetchAll = useCallback(async () => {
    await Promise.all([fetchStatus(), fetchSpreads(), fetchLivePrices()]);
    setLoading(false);
  }, [fetchStatus, fetchSpreads, fetchLivePrices]);

  useEffect(() => {
    fetchAll();

    // Auto-refresh every 2 seconds when enabled
    let interval: ReturnType<typeof setInterval>;
    if (autoRefresh) {
      interval = setInterval(fetchAll, 2000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [fetchAll, autoRefresh]);

  // Update price history for sparklines when prices change
  useEffect(() => {
    if (mergedLivePrices.length === 0) return;

    const now = Date.now();
    const historyMap = priceHistoryRef.current;

    mergedLivePrices.forEach((priceData) => {
      // Calculate average price across DEXes for the sparkline
      const avgPrice = priceData.dexes.reduce((sum, d) => sum + d.price0, 0) / priceData.dexes.length;

      const history = historyMap.get(priceData.pair) || [];
      const newPoint: PricePoint = { timestamp: now, price: avgPrice };

      // Keep only last 60 points
      const updatedHistory = [...history, newPoint].slice(-60);
      historyMap.set(priceData.pair, updatedHistory);
    });

    // Trigger a state update
    setPriceHistory(new Map(historyMap));
  }, [mergedLivePrices]);

  // Initialize mock price history for demo purposes
  useEffect(() => {
    if (mergedLivePrices.length > 0 && priceHistoryRef.current.size === 0) {
      mergedLivePrices.forEach((priceData) => {
        const avgPrice = priceData.dexes.reduce((sum, d) => sum + d.price0, 0) / priceData.dexes.length;
        if (avgPrice > 0) {
          const mockHistory = generateMockPriceData(avgPrice, 60, 0.005);
          priceHistoryRef.current.set(priceData.pair, mockHistory);
        }
      });
      setPriceHistory(new Map(priceHistoryRef.current));
    }
  }, [mergedLivePrices]);

  const handleStart = async () => {
    setStarting(true);
    try {
      const response = await fetch(`${API_BASE}/api/prices/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chain: apiChain, pollIntervalMs: 2000, minSpreadBps: 5 }),
      });
      const data = await response.json();

      if (response.ok) {
        addNotification({
          type: 'success',
          title: 'Price Monitoring Started',
          message: `Monitoring ${data.data.pairsMonitored || 'multiple'} pairs on ${apiChain.toUpperCase()}`,
        });
        fetchAll();
      } else {
        addNotification({
          type: 'error',
          title: 'Failed to Start',
          message: data.error || 'Unknown error',
        });
      }
    } catch (error) {
      addNotification({
        type: 'error',
        title: 'Failed to Start',
        message: 'Could not connect to API',
      });
    }
    setStarting(false);
  };

  const handleStop = async () => {
    setStopping(true);
    try {
      const response = await fetch(`${API_BASE}/api/prices/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chain: apiChain }),
      });
      const data = await response.json();

      if (response.ok) {
        addNotification({
          type: 'info',
          title: 'Price Monitoring Stopped',
          message: `${apiChain.toUpperCase()}: ${data.data.finalStats?.opportunitiesDetected || 0} opportunities detected`,
        });
        fetchAll();
      } else {
        addNotification({
          type: 'error',
          title: 'Failed to Stop',
          message: data.error || 'Unknown error',
        });
      }
    } catch (error) {
      addNotification({
        type: 'error',
        title: 'Failed to Stop',
        message: 'Could not connect to API',
      });
    }
    setStopping(false);
  };

  const formatUptime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) return `${hrs}h ${mins}m`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-matrix-surface rounded w-1/4" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-matrix-surface rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Chain Warning */}
      {!chainConfig.supported && (
        <Card className="p-4 bg-yellow-500/10 border-yellow-500/30">
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-yellow-400" />
            <div>
              <p className="text-yellow-400 font-medium">
                {chainConfig.name} not yet supported for live price monitoring
              </p>
              <p className="text-matrix-text-muted text-sm mt-1">
                Currently showing BSC prices. Switch to BSC to see matching data, or prices will be added for {chainConfig.name} soon.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-matrix-text flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-matrix-primary" />
            Live Price Monitor
            <Badge variant={chainConfig.supported ? 'success' : 'warning'}>
              {chainConfig.supported ? chainConfig.name : `BSC (${chainConfig.name} coming)`}
            </Badge>
          </h1>
          <p className="text-matrix-text-muted mt-1">
            Real-time DEX prices and arbitrage opportunities
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* WebSocket Status Indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-matrix-surface">
            {wsConnected ? (
              <>
                <Wifi className="w-4 h-4 text-green-400" />
                <span className="text-xs text-green-400">Live</span>
                {latency && (
                  <span className="text-xs text-matrix-text-muted ml-1">
                    {latency.totalLatencyMs}ms
                  </span>
                )}
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4 text-matrix-text-muted" />
                <span className="text-xs text-matrix-text-muted">Polling</span>
              </>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-matrix-text-muted">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-matrix-border bg-matrix-bg"
              disabled={wsConnected}
            />
            {wsConnected ? 'WebSocket' : 'Auto-refresh'}
          </label>
          <button
            onClick={fetchAll}
            className="p-2 rounded-lg bg-matrix-surface hover:bg-matrix-surface-hover transition-colors"
            title="Force refresh from API"
          >
            <RefreshCw className="w-5 h-5 text-matrix-text-muted" />
          </button>
          {status?.running ? (
            <button
              onClick={handleStop}
              disabled={stopping}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors',
                'bg-red-500/20 text-red-400 hover:bg-red-500/30',
                stopping && 'opacity-50 cursor-not-allowed'
              )}
            >
              <Square className="w-4 h-4" />
              {stopping ? 'Stopping...' : 'Stop'}
            </button>
          ) : (
            <button
              onClick={handleStart}
              disabled={starting}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors',
                'bg-matrix-primary/20 text-matrix-primary hover:bg-matrix-primary/30',
                starting && 'opacity-50 cursor-not-allowed'
              )}
            >
              <Play className="w-4 h-4" />
              {starting ? 'Starting...' : 'Start Monitoring'}
            </button>
          )}
        </div>
      </div>

      {/* Fast Mode Control */}
      <FastModeControl />

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-matrix-text-muted text-sm">Status</p>
              <p className="text-xl font-bold mt-1">
                {status?.running ? (
                  <span className="text-green-400 flex items-center gap-2">
                    <Activity className="w-5 h-5 animate-pulse" />
                    Running
                  </span>
                ) : (
                  <span className="text-matrix-text-muted">Stopped</span>
                )}
              </p>
            </div>
            {status?.running && status.uptimeSeconds !== undefined && (
              <div className="text-right">
                <p className="text-matrix-text-muted text-xs">Uptime</p>
                <p className="text-matrix-text">{formatUptime(status.uptimeSeconds)}</p>
              </div>
            )}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-matrix-text-muted text-sm">Pairs Monitored</p>
              <p className="text-2xl font-bold text-matrix-text mt-1">
                {status?.pairsMonitored || 0}
              </p>
            </div>
            <TrendingUp className="w-8 h-8 text-matrix-primary opacity-50" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-matrix-text-muted text-sm">Price Updates</p>
              <p className="text-2xl font-bold text-matrix-text mt-1">
                {status?.priceUpdates?.toLocaleString() || 0}
              </p>
            </div>
            <RefreshCw className="w-8 h-8 text-blue-400 opacity-50" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-matrix-text-muted text-sm">Opportunities</p>
              <p className="text-2xl font-bold text-matrix-primary mt-1">
                {status?.opportunitiesDetected || 0}
              </p>
            </div>
            <Zap className="w-8 h-8 text-yellow-400 opacity-50" />
          </div>
        </Card>
      </div>

      {/* Arbitrage Opportunities */}
      <Card>
        <div className="p-4 border-b border-matrix-border">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-matrix-text flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-400" />
              Live Arbitrage Spreads
            </h2>
            {summary && (
              <div className="flex items-center gap-4 text-sm">
                <span className="text-matrix-text-muted">
                  {summary.pairsWithSpread} spreads found
                </span>
                <span className="text-green-400">
                  {summary.profitableOpportunities} profitable
                </span>
                {summary.maxSpreadBps > 0 && (
                  <Badge variant="success">
                    Max: {(summary.maxSpreadBps / 100).toFixed(2)}%
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-matrix-text-muted text-sm border-b border-matrix-border">
                <th className="p-4">Pair</th>
                <th className="p-4">Buy DEX</th>
                <th className="p-4">Sell DEX</th>
                <th className="p-4 text-right">Buy Price</th>
                <th className="p-4 text-right">Sell Price</th>
                <th className="p-4 text-right">Spread</th>
                <th className="p-4 text-right">Net Profit</th>
                <th className="p-4 text-right">Est. USD</th>
              </tr>
            </thead>
            <tbody>
              {mergedSpreads.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-matrix-text-muted">
                    {status?.running
                      ? 'Scanning for arbitrage opportunities...'
                      : 'Start monitoring to detect spreads'}
                  </td>
                </tr>
              ) : (
                mergedSpreads.slice(0, 20).map((spread, idx) => (
                  <tr
                    key={`${spread.pair}-${idx}`}
                    className={clsx(
                      'border-b border-matrix-border hover:bg-matrix-surface-hover transition-colors',
                      spread.isProfitable && 'bg-green-500/5'
                    )}
                  >
                    <td className="p-4">
                      <span className="font-medium text-matrix-text">{spread.pair}</span>
                    </td>
                    <td className="p-4">
                      <Badge variant="default">{spread.buyDex}</Badge>
                    </td>
                    <td className="p-4">
                      <Badge variant="default">{spread.sellDex}</Badge>
                    </td>
                    <td className="p-4 text-right font-mono text-matrix-text">
                      {formatPrice(spread.buyPrice)}
                    </td>
                    <td className="p-4 text-right font-mono text-matrix-text">
                      {formatPrice(spread.sellPrice)}
                    </td>
                    <td className="p-4 text-right">
                      <span
                        className={clsx(
                          'font-medium',
                          spread.spreadBps >= 50
                            ? 'text-green-400'
                            : spread.spreadBps >= 20
                            ? 'text-yellow-400'
                            : 'text-matrix-text-muted'
                        )}
                      >
                        {(spread.spreadBps / 100).toFixed(2)}%
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      {spread.isProfitable ? (
                        <span className="text-green-400 flex items-center justify-end gap-1">
                          <TrendingUp className="w-4 h-4" />
                          {(spread.netProfitBps / 100).toFixed(2)}%
                        </span>
                      ) : (
                        <span className="text-red-400 flex items-center justify-end gap-1">
                          <TrendingDown className="w-4 h-4" />
                          {(spread.netProfitBps / 100).toFixed(2)}%
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      {spread.isProfitable ? (
                        <span className="text-green-400 font-medium">
                          ${spread.estimatedProfitUsd.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-matrix-text-muted">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Live Prices Grid */}
      <Card>
        <div className="p-4 border-b border-matrix-border">
          <h2 className="text-lg font-semibold text-matrix-text flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-matrix-primary" />
            Cross-DEX Price Comparison
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
          {mergedLivePrices.length === 0 ? (
            <div className="col-span-full p-8 text-center text-matrix-text-muted">
              {status?.running ? 'Loading price data...' : 'Start monitoring to see prices'}
            </div>
          ) : (
            mergedLivePrices.slice(0, 12).map((price) => (
              <div
                key={price.pair}
                className="p-4 bg-matrix-surface rounded-lg border border-matrix-border"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="font-semibold text-matrix-text">{price.pair}</span>
                  <Badge
                    variant={
                      price.spreadBps >= 50
                        ? 'success'
                        : price.spreadBps >= 20
                        ? 'warning'
                        : 'default'
                    }
                  >
                    {(price.spreadBps / 100).toFixed(2)}% spread
                  </Badge>
                </div>
                {/* Price Sparkline */}
                <div className="mb-3 flex justify-center">
                  <PriceSparkline
                    data={priceHistory.get(price.pair) || []}
                    width={180}
                    height={40}
                    showDirection={true}
                    showChange={true}
                  />
                </div>
                <div className="space-y-2">
                  {price.dexes.map((dex) => (
                    <div
                      key={dex.dex}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-matrix-text-muted">{dex.dex}</span>
                      <span className="font-mono text-matrix-text">
                        {formatPrice(dex.price0)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-matrix-border flex items-center justify-between text-xs text-matrix-text-muted">
                  <span>{price.dexCount} DEXs</span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Live
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Last Update */}
      {status?.lastUpdate && (
        <div className="text-center text-sm text-matrix-text-muted">
          Last update: {new Date(status.lastUpdate).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}
