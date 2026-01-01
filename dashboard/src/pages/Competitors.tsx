import { useState } from 'react';
import { Eye, EyeOff, Search, Plus, TrendingUp, Activity } from 'lucide-react';
import Card, { CardHeader } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Address from '../components/ui/Address';
import { useCompetitors, useCompetitorLeaderboard } from '../hooks/useApi';
import { useStore } from '../store/useStore';
import { formatEther } from 'viem';
import clsx from 'clsx';

export default function Competitors() {
  const selectedChain = useStore((state) => state.selectedChain);
  const [showWatched, setShowWatched] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: competitorsData, isLoading } = useCompetitors(showWatched);
  const { data: leaderboard } = useCompetitorLeaderboard();

  const competitors = competitorsData?.data || [];

  const formatValue = (wei: string | number | null | undefined): string => {
    if (wei === null || wei === undefined || wei === '') return '0.00';
    try {
      const weiStr = typeof wei === 'number' ? wei.toString() : String(wei);
      const value = formatEther(BigInt(weiStr));
      return parseFloat(value).toFixed(4);
    } catch {
      return '0.00';
    }
  };

  const filteredCompetitors = competitors.filter((c: any) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      c.address.toLowerCase().includes(query) ||
      c.label?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-matrix-text">
            Competitor Intelligence
          </h1>
          <p className="text-matrix-text-muted mt-1">
            Track and analyze competitor arbitrage activity
          </p>
        </div>
        <button className="btn btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Add Competitor
        </button>
      </div>

      {/* Leaderboard */}
      <Card>
        <CardHeader
          title="24h Leaderboard"
          subtitle="Top performers by profit"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {leaderboard?.slice(0, 5).map((comp: any, index: number) => (
            <div
              key={comp.id}
              className={clsx(
                'p-4 rounded-lg border transition-all',
                index === 0
                  ? 'bg-matrix-primary/5 border-matrix-primary'
                  : 'bg-matrix-bg border-matrix-border hover:border-matrix-primary/50'
              )}
            >
              <div className="flex items-center justify-between mb-3">
                <div
                  className={clsx(
                    'text-2xl font-bold',
                    index === 0 ? 'text-matrix-primary' : 'text-matrix-text-muted'
                  )}
                >
                  #{index + 1}
                </div>
                {index === 0 && (
                  <Badge variant="success">
                    <TrendingUp className="w-3 h-3 mr-1" />
                    Leader
                  </Badge>
                )}
              </div>
              <Address
                address={comp.address}
                label={comp.label}
                chain={selectedChain}
                showCopy={false}
              />
              <div className="mt-3 pt-3 border-t border-matrix-border">
                <div className="text-lg font-mono text-matrix-success">
                  +{formatValue(comp.total_profit_wei)} BNB
                </div>
                <div className="flex justify-between text-sm text-matrix-text-muted mt-1">
                  <span>{comp.total_transactions || 0} txs</span>
                  <span>{comp.success_rate?.toFixed(1) || 0}% success</span>
                </div>
              </div>
            </div>
          )) || (
            <div className="col-span-5 text-center py-8 text-matrix-text-muted">
              No competitors tracked yet
            </div>
          )}
        </div>
      </Card>

      {/* Filters & Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-matrix-text-muted" />
          <input
            type="text"
            placeholder="Search by address or label..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4"
          />
        </div>
        <button
          onClick={() => setShowWatched(!showWatched)}
          className={clsx(
            'btn flex items-center gap-2',
            showWatched ? 'btn-primary' : 'btn-secondary'
          )}
        >
          {showWatched ? (
            <Eye className="w-4 h-4" />
          ) : (
            <EyeOff className="w-4 h-4" />
          )}
          {showWatched ? 'Watched Only' : 'All Competitors'}
        </button>
      </div>

      {/* Competitors Table */}
      <Card padding="none">
        <table className="data-table">
          <thead>
            <tr>
              <th>Address</th>
              <th>Total Profit</th>
              <th>Transactions</th>
              <th>Success Rate</th>
              <th>Last Active</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="text-center py-8">
                  <Activity className="w-6 h-6 animate-spin mx-auto text-matrix-primary" />
                </td>
              </tr>
            ) : filteredCompetitors.length > 0 ? (
              filteredCompetitors.map((comp: any) => (
                <tr key={comp.id} className="cursor-pointer">
                  <td>
                    <Address
                      address={comp.address}
                      label={comp.label}
                      chain={selectedChain}
                    />
                  </td>
                  <td className="font-mono text-matrix-success">
                    +{formatValue(comp.total_profit_wei)} BNB
                  </td>
                  <td className="font-mono">{comp.total_transactions || 0}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-matrix-bg rounded-full overflow-hidden max-w-[100px]">
                        <div
                          className="h-full bg-matrix-success rounded-full"
                          style={{
                            width: `${Math.min(comp.success_rate || 0, 100)}%`,
                          }}
                        />
                      </div>
                      <span className="text-sm font-mono">
                        {comp.success_rate?.toFixed(1) || 0}%
                      </span>
                    </div>
                  </td>
                  <td className="text-matrix-text-muted text-sm">
                    {comp.last_active_at
                      ? new Date(comp.last_active_at).toLocaleString()
                      : 'Never'}
                  </td>
                  <td>
                    {comp.is_watched ? (
                      <Badge variant="success">
                        <Eye className="w-3 h-3 mr-1" />
                        Watching
                      </Badge>
                    ) : (
                      <Badge>Tracked</Badge>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="text-center py-12">
                  <div className="text-matrix-text-muted">
                    <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No competitors found</p>
                    <p className="text-sm mt-1">
                      Add competitors to start tracking their activity
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
