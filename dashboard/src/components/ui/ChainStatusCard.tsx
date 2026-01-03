import { useState, useEffect } from 'react';
import { Activity, Wifi, WifiOff, Clock, Fuel, TrendingUp, AlertTriangle } from 'lucide-react';
import Badge from './Badge';
import clsx from 'clsx';

export type ChainStatus = 'online' | 'degraded' | 'offline';

interface ChainStatusCardProps {
  chainId: string;
  chainName: string;
  chainLogo?: string;
  status: ChainStatus;
  rpcLatencyMs?: number;
  currentGasPrice?: number; // in gwei
  blockTime?: number; // in seconds
  activePairs?: number;
  isMonitoring?: boolean;
  opportunityCount?: number;
  best24hSpread?: number; // percentage
  profit24h?: number; // in USD
  onClick?: () => void;
  className?: string;
}

// Chain logo/icon mapping
const CHAIN_ICONS: Record<string, { bg: string; text: string; abbrev: string }> = {
  bsc: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', abbrev: 'BSC' },
  ethereum: { bg: 'bg-blue-500/20', text: 'text-blue-400', abbrev: 'ETH' },
  arbitrum: { bg: 'bg-blue-400/20', text: 'text-blue-300', abbrev: 'ARB' },
  optimism: { bg: 'bg-red-500/20', text: 'text-red-400', abbrev: 'OP' },
  base: { bg: 'bg-blue-600/20', text: 'text-blue-500', abbrev: 'BASE' },
  polygon: { bg: 'bg-purple-500/20', text: 'text-purple-400', abbrev: 'MATIC' },
  avalanche: { bg: 'bg-red-600/20', text: 'text-red-500', abbrev: 'AVAX' },
};

export default function ChainStatusCard({
  chainId,
  chainName,
  chainLogo,
  status,
  rpcLatencyMs,
  currentGasPrice,
  blockTime,
  activePairs,
  isMonitoring = true,
  opportunityCount = 0,
  best24hSpread,
  profit24h,
  onClick,
  className,
}: ChainStatusCardProps) {
  const [latencyHistory, setLatencyHistory] = useState<number[]>([]);

  // Track latency history for mini sparkline
  useEffect(() => {
    if (rpcLatencyMs !== undefined) {
      setLatencyHistory((prev) => {
        const newHistory = [...prev, rpcLatencyMs];
        return newHistory.slice(-20); // Keep last 20 readings
      });
    }
  }, [rpcLatencyMs]);

  const chainStyle = CHAIN_ICONS[chainId.toLowerCase()] || {
    bg: 'bg-gray-500/20',
    text: 'text-gray-400',
    abbrev: chainId.slice(0, 3).toUpperCase(),
  };

  const statusConfig: Record<ChainStatus, { color: string; label: string; icon: React.ReactNode }> = {
    online: {
      color: 'text-matrix-success',
      label: 'Online',
      icon: <Wifi className="w-4 h-4" />,
    },
    degraded: {
      color: 'text-matrix-warning',
      label: 'Degraded',
      icon: <AlertTriangle className="w-4 h-4" />,
    },
    offline: {
      color: 'text-matrix-danger',
      label: 'Offline',
      icon: <WifiOff className="w-4 h-4" />,
    },
  };

  const { color, label, icon } = statusConfig[status];

  // Calculate latency status
  const getLatencyStatus = (ms?: number): 'good' | 'warning' | 'bad' => {
    if (!ms) return 'bad';
    if (ms < 100) return 'good';
    if (ms < 500) return 'warning';
    return 'bad';
  };

  const latencyStatus = getLatencyStatus(rpcLatencyMs);
  const latencyColors = {
    good: 'text-matrix-success',
    warning: 'text-matrix-warning',
    bad: 'text-matrix-danger',
  };

  return (
    <div
      onClick={onClick}
      className={clsx(
        'bg-matrix-surface border border-matrix-border rounded-lg p-4 relative overflow-hidden',
        onClick && 'cursor-pointer hover:border-matrix-primary/50 transition-colors',
        status === 'offline' && 'opacity-60',
        className
      )}
    >
      {/* Status indicator bar at top */}
      <div
        className={clsx(
          'absolute top-0 left-0 right-0 h-1',
          status === 'online' && 'bg-matrix-success',
          status === 'degraded' && 'bg-matrix-warning',
          status === 'offline' && 'bg-matrix-danger'
        )}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-4 pt-1">
        <div className="flex items-center gap-3">
          {/* Chain Icon/Logo */}
          {chainLogo ? (
            <img
              src={chainLogo}
              alt={chainName}
              className="w-10 h-10 rounded-full"
            />
          ) : (
            <div
              className={clsx(
                'w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm',
                chainStyle.bg,
                chainStyle.text
              )}
            >
              {chainStyle.abbrev}
            </div>
          )}
          <div>
            <h3 className="font-semibold text-matrix-text">{chainName}</h3>
            <div className={clsx('flex items-center gap-1 text-xs', color)}>
              {icon}
              <span>{label}</span>
            </div>
          </div>
        </div>

        {/* Monitoring Status */}
        <div className="flex items-center gap-2">
          {isMonitoring ? (
            <Badge variant="success">
              <Activity className="w-3 h-3 mr-1 animate-pulse" />
              Active
            </Badge>
          ) : (
            <Badge variant="default">Paused</Badge>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* RPC Latency */}
        <div className="p-2 bg-matrix-bg rounded-lg">
          <div className="flex items-center gap-1 text-xs text-matrix-text-muted mb-1">
            <Clock className="w-3 h-3" />
            <span>RPC Latency</span>
          </div>
          <div className={clsx('font-mono text-sm', latencyColors[latencyStatus])}>
            {rpcLatencyMs !== undefined ? `${rpcLatencyMs}ms` : '--'}
          </div>
        </div>

        {/* Gas Price */}
        <div className="p-2 bg-matrix-bg rounded-lg">
          <div className="flex items-center gap-1 text-xs text-matrix-text-muted mb-1">
            <Fuel className="w-3 h-3" />
            <span>Gas Price</span>
          </div>
          <div className="font-mono text-sm text-matrix-text">
            {currentGasPrice !== undefined ? `${currentGasPrice} gwei` : '--'}
          </div>
        </div>

        {/* Block Time */}
        <div className="p-2 bg-matrix-bg rounded-lg">
          <div className="flex items-center gap-1 text-xs text-matrix-text-muted mb-1">
            <Activity className="w-3 h-3" />
            <span>Block Time</span>
          </div>
          <div className="font-mono text-sm text-matrix-text">
            {blockTime !== undefined ? `${blockTime.toFixed(1)}s` : '--'}
          </div>
        </div>

        {/* Active Pairs */}
        <div className="p-2 bg-matrix-bg rounded-lg">
          <div className="flex items-center gap-1 text-xs text-matrix-text-muted mb-1">
            <TrendingUp className="w-3 h-3" />
            <span>Active Pairs</span>
          </div>
          <div className="font-mono text-sm text-matrix-text">
            {activePairs !== undefined ? activePairs.toLocaleString() : '--'}
          </div>
        </div>
      </div>

      {/* Opportunity Stats */}
      <div className="flex items-center justify-between pt-3 border-t border-matrix-border">
        <div className="flex items-center gap-4">
          {/* Opportunities */}
          <div>
            <div className="text-xs text-matrix-text-muted">Opportunities</div>
            <div className="font-mono text-lg text-matrix-primary">
              {opportunityCount}
            </div>
          </div>

          {/* Best Spread */}
          {best24hSpread !== undefined && (
            <div>
              <div className="text-xs text-matrix-text-muted">Best Spread</div>
              <div className="font-mono text-lg text-matrix-success">
                {best24hSpread.toFixed(2)}%
              </div>
            </div>
          )}
        </div>

        {/* 24h Profit */}
        {profit24h !== undefined && (
          <div className="text-right">
            <div className="text-xs text-matrix-text-muted">24h Profit</div>
            <div className={clsx(
              'font-mono text-lg',
              profit24h >= 0 ? 'text-matrix-success' : 'text-matrix-danger'
            )}>
              {profit24h >= 0 ? '+' : ''}{profit24h.toFixed(2)} USD
            </div>
          </div>
        )}
      </div>

      {/* Latency Mini Chart (visual indicator) */}
      {latencyHistory.length > 1 && (
        <div className="flex items-end gap-0.5 h-4 mt-3">
          {latencyHistory.map((lat, i) => {
            const maxLat = Math.max(...latencyHistory, 500);
            const height = Math.max(2, (lat / maxLat) * 16);
            const latStatus = getLatencyStatus(lat);
            return (
              <div
                key={i}
                className={clsx(
                  'w-1 rounded-sm transition-all',
                  latStatus === 'good' && 'bg-matrix-success',
                  latStatus === 'warning' && 'bg-matrix-warning',
                  latStatus === 'bad' && 'bg-matrix-danger'
                )}
                style={{ height: `${height}px` }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// Compact chain status indicator for use in lists/headers
export function ChainStatusIndicator({
  chainId,
  status,
  size = 'sm',
}: {
  chainId: string;
  status: ChainStatus;
  size?: 'sm' | 'md';
}) {
  const chainStyle = CHAIN_ICONS[chainId.toLowerCase()] || {
    bg: 'bg-gray-500/20',
    text: 'text-gray-400',
    abbrev: chainId.slice(0, 3).toUpperCase(),
  };

  const statusColors = {
    online: 'bg-matrix-success',
    degraded: 'bg-matrix-warning',
    offline: 'bg-matrix-danger',
  };

  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
  };

  return (
    <div className="relative">
      <div
        className={clsx(
          'rounded-full flex items-center justify-center font-bold',
          chainStyle.bg,
          chainStyle.text,
          sizeClasses[size]
        )}
      >
        {chainStyle.abbrev.slice(0, 1)}
      </div>
      {/* Status dot */}
      <div
        className={clsx(
          'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-matrix-surface',
          statusColors[status]
        )}
      />
    </div>
  );
}
