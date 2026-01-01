import { RefreshCw, Bell, Wifi, WifiOff } from 'lucide-react';
import { useStore, Chain } from '../../store/useStore';
import { useOverview } from '../../hooks/useApi';
import { formatEther } from 'viem';
import clsx from 'clsx';

const chains: { id: Chain; name: string; color: string }[] = [
  { id: 'bsc', name: 'BSC', color: '#F0B90B' },
  { id: 'ethereum', name: 'ETH', color: '#627EEA' },
  { id: 'arbitrum', name: 'ARB', color: '#28A0F0' },
  { id: 'optimism', name: 'OP', color: '#FF0420' },
  { id: 'base', name: 'BASE', color: '#0052FF' },
];

export default function Header() {
  const { selectedChain, setSelectedChain, autoRefresh, toggleAutoRefresh } = useStore();
  const { data: overview } = useOverview();

  // Format profit value
  const formatProfit = (wei: string | number | null | undefined): string => {
    if (wei === null || wei === undefined || wei === '') return '0.00';
    try {
      const weiStr = typeof wei === 'number' ? wei.toString() : String(wei);
      if (!/^-?\d+$/.test(weiStr)) return '0.00';
      const value = formatEther(BigInt(weiStr));
      const num = parseFloat(value);
      return (num >= 0 ? '+' : '') + num.toFixed(4);
    } catch {
      return '0.00';
    }
  };

  const todayProfit = formatProfit(overview?.today?.net_profit_wei);
  const pendingCount = overview?.pending_opportunities || 0;
  const successRate = overview?.today?.success_rate || 0;

  return (
    <header className="h-16 bg-matrix-surface border-b border-matrix-border px-6 flex items-center justify-between">
      {/* Left: Chain Selector */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1 bg-matrix-bg rounded-lg p-1">
          {chains.map((chain) => (
            <button
              key={chain.id}
              onClick={() => setSelectedChain(chain.id)}
              className={clsx(
                'px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200',
                selectedChain === chain.id
                  ? 'bg-matrix-surface-hover text-white'
                  : 'text-matrix-text-muted hover:text-matrix-text'
              )}
              style={{
                borderBottom: selectedChain === chain.id ? `2px solid ${chain.color}` : undefined,
              }}
            >
              {chain.name}
            </button>
          ))}
        </div>
      </div>

      {/* Center: Quick Stats */}
      <div className="flex items-center gap-6">
        <QuickStat label="24h Profit" value={`${todayProfit} BNB`} positive={parseFloat(todayProfit) >= 0} />
        <QuickStat label="Pending" value={pendingCount.toString()} />
        <QuickStat label="Success Rate" value={`${successRate.toFixed(1)}%`} />
      </div>

      {/* Right: Controls */}
      <div className="flex items-center gap-3">
        {/* Auto Refresh Toggle */}
        <button
          onClick={toggleAutoRefresh}
          className={clsx(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all',
            autoRefresh
              ? 'bg-matrix-primary/10 text-matrix-primary'
              : 'bg-matrix-surface-hover text-matrix-text-muted'
          )}
        >
          {autoRefresh ? (
            <>
              <Wifi className="w-4 h-4" />
              <span>Live</span>
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4" />
              <span>Paused</span>
            </>
          )}
        </button>

        {/* Refresh Button */}
        <button
          className="p-2 rounded-lg hover:bg-matrix-surface-hover transition-colors"
          title="Refresh Data"
        >
          <RefreshCw className="w-5 h-5 text-matrix-text-muted" />
        </button>

        {/* Notifications */}
        <button
          className="p-2 rounded-lg hover:bg-matrix-surface-hover transition-colors relative"
          title="Notifications"
        >
          <Bell className="w-5 h-5 text-matrix-text-muted" />
          {/* Notification dot */}
          <span className="absolute top-1 right-1 w-2 h-2 bg-matrix-danger rounded-full" />
        </button>
      </div>
    </header>
  );
}

function QuickStat({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="text-center">
      <div className="text-xs text-matrix-text-muted">{label}</div>
      <div
        className={clsx(
          'text-sm font-semibold font-mono',
          positive ? 'text-matrix-success' : 'text-matrix-text'
        )}
      >
        {value}
      </div>
    </div>
  );
}
