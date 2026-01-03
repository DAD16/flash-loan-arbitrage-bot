import { RefreshCw, Bell, Wifi, WifiOff, Globe, Layers } from 'lucide-react';
import { useStore, Chain } from '../../store/useStore';
import { useOverview } from '../../hooks/useApi';
import { formatEther } from 'viem';
import clsx from 'clsx';

// Extended chain type to include 'all'
type ChainOption = Chain | 'all';

const chains: { id: ChainOption; name: string; color: string; symbol: string; icon?: React.ReactNode }[] = [
  { id: 'all', name: 'ALL', color: '#00ff41', symbol: 'MULTI', icon: <Globe className="w-3 h-3" /> },
  { id: 'sepolia', name: 'SEPOLIA', color: '#627EEA', symbol: 'ETH' },
  { id: 'bsc', name: 'BSC', color: '#F0B90B', symbol: 'BNB' },
  { id: 'ethereum', name: 'ETH', color: '#627EEA', symbol: 'ETH' },
  { id: 'arbitrum', name: 'ARB', color: '#28A0F0', symbol: 'ETH' },
  { id: 'optimism', name: 'OP', color: '#FF0420', symbol: 'ETH' },
  { id: 'base', name: 'BASE', color: '#0052FF', symbol: 'ETH' },
];

// Mock multi-chain stats for aggregated view
const MULTI_CHAIN_STATS = {
  totalOpportunities: 47,
  totalProfit: '+2.4521',
  avgSuccessRate: 87.3,
};

export default function Header() {
  const { selectedChain, setSelectedChain, autoRefresh, toggleAutoRefresh } = useStore();
  const { data: overview } = useOverview();

  // Track if "All Chains" is selected (local state for UI)
  const isAllChainsSelected = selectedChain === ('all' as Chain);

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

  // Use aggregated stats when "All Chains" is selected
  const todayProfit = isAllChainsSelected
    ? MULTI_CHAIN_STATS.totalProfit
    : formatProfit(overview?.today?.net_profit_wei);
  const pendingCount = isAllChainsSelected
    ? MULTI_CHAIN_STATS.totalOpportunities
    : (overview?.pending_opportunities || 0);
  const successRate = isAllChainsSelected
    ? MULTI_CHAIN_STATS.avgSuccessRate
    : (overview?.today?.success_rate || 0);

  // Handle chain selection - allow 'all' as well
  const handleChainSelect = (chainId: ChainOption) => {
    // For now, we'll treat 'all' as a valid selection for UI purposes
    // The store type restricts to Chain, but we can cast here
    setSelectedChain(chainId as Chain);
  };

  return (
    <header className="h-16 bg-matrix-surface border-b border-matrix-border px-6 flex items-center justify-between">
      {/* Left: Chain Selector */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1 bg-matrix-bg rounded-lg p-1">
          {chains.map((chain) => (
            <button
              key={chain.id}
              onClick={() => handleChainSelect(chain.id)}
              className={clsx(
                'px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 flex items-center gap-1.5',
                (selectedChain as ChainOption) === chain.id
                  ? 'bg-matrix-surface-hover text-white'
                  : 'text-matrix-text-muted hover:text-matrix-text',
                chain.id === 'all' && (selectedChain as ChainOption) === chain.id && 'matrix-glow'
              )}
              style={{
                borderBottom: (selectedChain as ChainOption) === chain.id ? `2px solid ${chain.color}` : undefined,
              }}
            >
              {chain.icon}
              {chain.name}
            </button>
          ))}
        </div>
        {/* Multi-chain opportunity count badge */}
        {isAllChainsSelected && (
          <div className="flex items-center gap-2 px-3 py-1 bg-matrix-primary/10 border border-matrix-primary/30 rounded-lg">
            <Layers className="w-4 h-4 text-matrix-primary" />
            <span className="text-xs text-matrix-primary font-medium">
              {MULTI_CHAIN_STATS.totalOpportunities} Cross-Chain Opportunities
            </span>
          </div>
        )}
      </div>

      {/* Center: Quick Stats */}
      <div className="flex items-center gap-6">
        <QuickStat
          label={isAllChainsSelected ? '24h Total Profit' : '24h Profit'}
          value={`${todayProfit} ${isAllChainsSelected ? 'USD' : (chains.find(c => c.id === selectedChain)?.symbol || 'ETH')}`}
          positive={parseFloat(todayProfit) >= 0}
        />
        <QuickStat
          label={isAllChainsSelected ? 'All Pending' : 'Pending'}
          value={pendingCount.toString()}
          badge={isAllChainsSelected ? { text: '6 chains', variant: 'info' } : undefined}
        />
        <QuickStat
          label={isAllChainsSelected ? 'Avg Success' : 'Success Rate'}
          value={`${successRate.toFixed(1)}%`}
        />
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
  badge,
}: {
  label: string;
  value: string;
  positive?: boolean;
  badge?: { text: string; variant: 'info' | 'success' | 'warning' };
}) {
  const badgeColors = {
    info: 'bg-blue-500/20 text-blue-400',
    success: 'bg-matrix-success/20 text-matrix-success',
    warning: 'bg-matrix-warning/20 text-matrix-warning',
  };

  return (
    <div className="text-center">
      <div className="text-xs text-matrix-text-muted">{label}</div>
      <div className="flex items-center justify-center gap-2">
        <div
          className={clsx(
            'text-sm font-semibold font-mono',
            positive ? 'text-matrix-success' : 'text-matrix-text'
          )}
        >
          {value}
        </div>
        {badge && (
          <span className={clsx('text-[10px] px-1.5 py-0.5 rounded', badgeColors[badge.variant])}>
            {badge.text}
          </span>
        )}
      </div>
    </div>
  );
}
