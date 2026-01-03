import { useState } from 'react';
import { Network, RefreshCw, TrendingUp, DollarSign, Zap, Activity, Loader2 } from 'lucide-react';
import Card, { CardHeader } from '../components/ui/Card';
import StatCard from '../components/ui/StatCard';
import Badge from '../components/ui/Badge';
import ChainStatusCard, { ChainStatusIndicator, type ChainStatus } from '../components/ui/ChainStatusCard';
import { useMultiChainStats, type ChainStats } from '../hooks/useApi';
import clsx from 'clsx';

export default function MultiChainOverview() {
  const { data: chains, isLoading, refetch, isRefetching } = useMultiChainStats();
  const [selectedView, setSelectedView] = useState<'cards' | 'table'>('cards');

  const handleRefresh = () => {
    refetch();
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-matrix-primary" />
        <span className="ml-3 text-matrix-text-muted">Loading chain data...</span>
      </div>
    );
  }

  const chainData = chains || [];

  // Calculate aggregate stats
  const totalOpportunities = chainData.reduce((sum, c) => sum + c.opportunityCount, 0);
  const total24hProfit = chainData.reduce((sum, c) => sum + c.profit24h, 0);
  const bestSpread = chainData.length > 0 ? Math.max(...chainData.map((c) => c.best24hSpread)) : 0;
  const activeChains = chainData.filter((c) => c.status === 'online' && c.isMonitoring).length;
  const totalPairs = chainData.reduce((sum, c) => sum + c.activePairs, 0);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-matrix-text flex items-center gap-3">
            <Network className="w-7 h-7 text-matrix-primary" />
            Multi-Chain Overview
          </h1>
          <p className="text-matrix-text-muted mt-1">
            Cross-chain opportunity monitoring and comparison
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="flex bg-matrix-surface rounded-lg p-1">
            <button
              onClick={() => setSelectedView('cards')}
              className={clsx(
                'px-3 py-1.5 rounded text-sm font-medium transition-colors',
                selectedView === 'cards'
                  ? 'bg-matrix-primary/20 text-matrix-primary'
                  : 'text-matrix-text-muted hover:text-matrix-text'
              )}
            >
              Cards
            </button>
            <button
              onClick={() => setSelectedView('table')}
              className={clsx(
                'px-3 py-1.5 rounded text-sm font-medium transition-colors',
                selectedView === 'table'
                  ? 'bg-matrix-primary/20 text-matrix-primary'
                  : 'text-matrix-text-muted hover:text-matrix-text'
              )}
            >
              Table
            </button>
          </div>

          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            disabled={isRefetching}
            className="btn btn-secondary flex items-center gap-2"
          >
            <RefreshCw className={clsx('w-4 h-4', isRefetching && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {/* Aggregate Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Active Chains"
          value={`${activeChains}/${chainData.length}`}
          subtitle="Monitoring"
          icon={<Network className="w-5 h-5 text-matrix-primary" />}
        />
        <StatCard
          title="Total Opportunities"
          value={totalOpportunities}
          subtitle="Across all chains"
          icon={<Zap className="w-5 h-5 text-matrix-warning" />}
          variant={totalOpportunities > 0 ? 'warning' : 'default'}
        />
        <StatCard
          title="Best Spread"
          value={`${bestSpread.toFixed(2)}%`}
          subtitle="24h maximum"
          icon={<TrendingUp className="w-5 h-5 text-matrix-success" />}
          variant="success"
        />
        <StatCard
          title="24h Profit"
          value={`$${total24hProfit.toFixed(2)}`}
          subtitle="All chains combined"
          icon={<DollarSign className="w-5 h-5 text-matrix-success" />}
          variant="success"
        />
        <StatCard
          title="Total Pairs"
          value={totalPairs.toLocaleString()}
          subtitle="Monitored pairs"
          icon={<Activity className="w-5 h-5 text-blue-400" />}
        />
      </div>

      {/* Chain Health Summary */}
      <Card>
        <CardHeader
          title="Chain Health Status"
          subtitle="Real-time RPC and network health"
          action={
            <div className="flex items-center gap-2">
              {chainData.map((chain) => (
                <ChainStatusIndicator
                  key={chain.chainId}
                  chainId={chain.chainId}
                  status={chain.status}
                />
              ))}
            </div>
          }
        />
        <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
          {chainData.map((chain) => (
            <div
              key={chain.chainId}
              className={clsx(
                'p-3 rounded-lg border transition-colors',
                chain.status === 'online'
                  ? 'border-matrix-success/30 bg-matrix-success/5'
                  : chain.status === 'degraded'
                  ? 'border-matrix-warning/30 bg-matrix-warning/5'
                  : 'border-matrix-danger/30 bg-matrix-danger/5'
              )}
            >
              <div className="text-sm font-medium text-matrix-text mb-1">
                {chain.chainName}
              </div>
              <div className="flex items-center justify-between">
                <span className={clsx(
                  'text-xs font-mono',
                  chain.rpcLatencyMs < 100 ? 'text-matrix-success' :
                  chain.rpcLatencyMs < 500 ? 'text-matrix-warning' : 'text-matrix-danger'
                )}>
                  {chain.rpcLatencyMs > 0 ? `${chain.rpcLatencyMs}ms` : '--'}
                </span>
                <Badge
                  variant={
                    chain.status === 'online' ? 'success' :
                    chain.status === 'degraded' ? 'warning' : 'danger'
                  }
                  size="sm"
                >
                  {chain.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Chain Cards or Table View */}
      {selectedView === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {chainData.map((chain) => (
            <ChainStatusCard
              key={chain.chainId}
              chainId={chain.chainId}
              chainName={chain.chainName}
              status={chain.status}
              rpcLatencyMs={chain.rpcLatencyMs}
              currentGasPrice={chain.currentGasPrice}
              blockTime={chain.blockTime}
              activePairs={chain.activePairs}
              isMonitoring={chain.isMonitoring}
              opportunityCount={chain.opportunityCount}
              best24hSpread={chain.best24hSpread}
              profit24h={chain.profit24h}
            />
          ))}
        </div>
      ) : (
        <Card padding="none">
          <table className="data-table">
            <thead>
              <tr>
                <th>Chain</th>
                <th>Status</th>
                <th>RPC Latency</th>
                <th>Block Time</th>
                <th>Gas Price</th>
                <th>Opportunities</th>
                <th>Best Spread</th>
                <th>24h Profit</th>
                <th>Active Pairs</th>
              </tr>
            </thead>
            <tbody>
              {chainData.map((chain) => (
                <tr key={chain.chainId}>
                  <td>
                    <div className="flex items-center gap-2">
                      <ChainStatusIndicator
                        chainId={chain.chainId}
                        status={chain.status}
                      />
                      <span className="font-medium">{chain.chainName}</span>
                    </div>
                  </td>
                  <td>
                    <Badge
                      variant={
                        chain.status === 'online' ? 'success' :
                        chain.status === 'degraded' ? 'warning' : 'danger'
                      }
                    >
                      {chain.status}
                    </Badge>
                  </td>
                  <td className={clsx(
                    'font-mono',
                    chain.rpcLatencyMs < 100 ? 'text-matrix-success' :
                    chain.rpcLatencyMs < 500 ? 'text-matrix-warning' : 'text-matrix-danger'
                  )}>
                    {chain.rpcLatencyMs > 0 ? `${chain.rpcLatencyMs}ms` : '--'}
                  </td>
                  <td className="font-mono text-matrix-text-muted">
                    {chain.blockTime > 0 ? `${chain.blockTime.toFixed(1)}s` : '--'}
                  </td>
                  <td className="font-mono text-matrix-text-muted">
                    {chain.currentGasPrice > 0 ? `${chain.currentGasPrice} gwei` : '--'}
                  </td>
                  <td>
                    <span className={clsx(
                      'font-mono',
                      chain.opportunityCount > 0 ? 'text-matrix-warning' : 'text-matrix-text-muted'
                    )}>
                      {chain.opportunityCount}
                    </span>
                  </td>
                  <td className="font-mono text-matrix-success">
                    {chain.best24hSpread > 0 ? `${chain.best24hSpread.toFixed(2)}%` : '--'}
                  </td>
                  <td className={clsx(
                    'font-mono',
                    chain.profit24h >= 0 ? 'text-matrix-success' : 'text-matrix-danger'
                  )}>
                    {chain.profit24h !== 0
                      ? `${chain.profit24h >= 0 ? '+' : ''}$${chain.profit24h.toFixed(2)}`
                      : '--'}
                  </td>
                  <td className="font-mono text-matrix-text-muted">
                    {chain.activePairs > 0 ? chain.activePairs.toLocaleString() : '--'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Cross-Chain Opportunities Section */}
      <Card>
        <CardHeader
          title="Cross-Chain Arbitrage Opportunities"
          subtitle="Same token pairs with spreads across different chains"
          action={
            <Badge variant="info">
              Coming Soon
            </Badge>
          }
        />
        <div className="text-center py-12">
          <Network className="w-16 h-16 mx-auto mb-4 text-matrix-text-muted opacity-50" />
          <p className="text-matrix-text-muted">
            Cross-chain arbitrage detection is being developed.
          </p>
          <p className="text-sm text-matrix-text-muted mt-2">
            This feature will identify opportunities where the same token pair has price
            differences across multiple chains.
          </p>
        </div>
      </Card>
    </div>
  );
}
