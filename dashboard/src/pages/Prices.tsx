import { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import clsx from 'clsx';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import FastModeControl from '../components/FastModeControl';
import { useStore } from '../store/useStore';

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

export default function Prices() {
  const { addNotification } = useStore();
  const [status, setStatus] = useState<PriceStatus | null>(null);
  const [spreads, setSpreads] = useState<Spread[]>([]);
  const [summary, setSummary] = useState<SpreadSummary | null>(null);
  const [livePrices, setLivePrices] = useState<LivePrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/prices/status`);
      const data = await response.json();
      setStatus(data.data);
    } catch (error) {
      console.error('Error fetching status:', error);
    }
  }, []);

  const fetchSpreads = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/prices/spreads`);
      const data = await response.json();
      setSpreads(data.data || []);
      setSummary(data.summary || null);
    } catch (error) {
      console.error('Error fetching spreads:', error);
    }
  }, []);

  const fetchLivePrices = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/prices/live`);
      const data = await response.json();
      setLivePrices(data.data?.prices || []);
    } catch (error) {
      console.error('Error fetching live prices:', error);
    }
  }, []);

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

  const handleStart = async () => {
    setStarting(true);
    try {
      const response = await fetch(`${API_BASE}/api/prices/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pollIntervalMs: 2000, minSpreadBps: 5 }),
      });
      const data = await response.json();

      if (response.ok) {
        addNotification({
          type: 'success',
          title: 'Price Monitoring Started',
          message: `Monitoring ${data.data.pairsMonitored || 'multiple'} pairs`,
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
      });
      const data = await response.json();

      if (response.ok) {
        addNotification({
          type: 'info',
          title: 'Price Monitoring Stopped',
          message: `Final stats: ${data.data.finalStats?.opportunitiesDetected || 0} opportunities detected`,
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-matrix-text flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-matrix-primary" />
            Live Price Monitor
          </h1>
          <p className="text-matrix-text-muted mt-1">
            Real-time DEX prices and arbitrage opportunities on BSC
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-matrix-text-muted">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-matrix-border bg-matrix-bg"
            />
            Auto-refresh
          </label>
          <button
            onClick={fetchAll}
            className="p-2 rounded-lg bg-matrix-surface hover:bg-matrix-surface-hover transition-colors"
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
              {spreads.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-matrix-text-muted">
                    {status?.running
                      ? 'Scanning for arbitrage opportunities...'
                      : 'Start monitoring to detect spreads'}
                  </td>
                </tr>
              ) : (
                spreads.slice(0, 20).map((spread, idx) => (
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
                      {spread.buyPrice.toFixed(6)}
                    </td>
                    <td className="p-4 text-right font-mono text-matrix-text">
                      {spread.sellPrice.toFixed(6)}
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
          {livePrices.length === 0 ? (
            <div className="col-span-full p-8 text-center text-matrix-text-muted">
              {status?.running ? 'Loading price data...' : 'Start monitoring to see prices'}
            </div>
          ) : (
            livePrices.slice(0, 12).map((price) => (
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
                <div className="space-y-2">
                  {price.dexes.map((dex) => (
                    <div
                      key={dex.dex}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-matrix-text-muted">{dex.dex}</span>
                      <span className="font-mono text-matrix-text">
                        {dex.price0.toFixed(6)}
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
