import {
  DollarSign,
  TrendingUp,
  Zap,
  Brain,
  Users,
  Activity,
} from 'lucide-react';
import Card, { CardHeader } from '../components/ui/Card';
import StatCard from '../components/ui/StatCard';
import Badge, { StatusBadge, ConfidenceBadge } from '../components/ui/Badge';
import Address, { TxHash } from '../components/ui/Address';
import {
  useOverview,
  usePendingOpportunities,
  useRecentExecutions,
  usePendingRecommendations,
} from '../hooks/useApi';
import { useStore } from '../store/useStore';
import { formatEther } from 'viem';

export default function Overview() {
  const selectedChain = useStore((state) => state.selectedChain);
  const { data: overview, isLoading: overviewLoading } = useOverview();
  const { data: pendingOpps } = usePendingOpportunities();
  const { data: recentExecs } = useRecentExecutions();
  const { data: recommendations } = usePendingRecommendations();

  // Format BNB/ETH value - handles both string and number types
  const formatValue = (wei: string | number | null | undefined): string => {
    if (wei === null || wei === undefined || wei === '') return '0.00';
    try {
      // Convert to string first if it's a number to avoid precision loss
      const weiStr = typeof wei === 'number' ? wei.toString() : String(wei);
      // Handle non-numeric strings gracefully
      if (!/^-?\d+$/.test(weiStr)) {
        console.warn('Invalid wei value:', weiStr);
        return '0.00';
      }
      const value = formatEther(BigInt(weiStr));
      return parseFloat(value).toFixed(4);
    } catch (e) {
      console.error('formatValue error:', e, 'input:', wei);
      return '0.00';
    }
  };

  // Parse JSON array safely (handles both string and array inputs)
  const parseJsonArray = (value: string | string[] | null | undefined): string[] => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-bold text-matrix-text">
          Command Center Overview
        </h1>
        <p className="text-matrix-text-muted mt-1">
          Real-time monitoring of arbitrage operations on{' '}
          <span className="text-matrix-primary">{selectedChain.toUpperCase()}</span>
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Profit"
          value={`${formatValue(overview?.total_profit?.total_profit_wei)} BNB`}
          subtitle="All time"
          icon={<DollarSign className="w-5 h-5 text-matrix-primary" />}
          variant="success"
        />
        <StatCard
          title="Today's Profit"
          value={`${formatValue(overview?.today?.net_profit_wei)} BNB`}
          subtitle={overview?.today?.total_executions ? `${overview.today.total_executions} executions` : 'No executions yet'}
          change={overview?.today?.success_rate || 0}
          icon={<TrendingUp className="w-5 h-5 text-matrix-success" />}
        />
        <StatCard
          title="Pending Opportunities"
          value={overview?.pending_opportunities || 0}
          subtitle="Ready for execution"
          icon={<Zap className="w-5 h-5 text-matrix-warning" />}
          variant={(overview?.pending_opportunities ?? 0) > 0 ? 'warning' : 'default'}
        />
        <StatCard
          title="AI Recommendations"
          value={overview?.pending_recommendations || 0}
          subtitle="Awaiting review"
          icon={<Brain className="w-5 h-5 text-blue-400" />}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pending Opportunities */}
        <Card className="lg:col-span-2" padding="none">
          <div className="p-4 border-b border-matrix-border">
            <CardHeader
              title="Live Opportunity Feed"
              subtitle={`${pendingOpps?.length || 0} opportunities detected`}
              action={
                <Badge variant="success">
                  <Activity className="w-3 h-3 mr-1" />
                  Live
                </Badge>
              }
            />
          </div>
          <div className="max-h-80 overflow-auto">
            {pendingOpps && pendingOpps.length > 0 ? (
              <table className="data-table">
                <thead className="sticky top-0 bg-matrix-surface">
                  <tr>
                    <th>Route</th>
                    <th>Expected Profit</th>
                    <th>Confidence</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingOpps.slice(0, 10).map((opp, index) => (
                    <tr key={opp.id || `opp-${index}`}>
                      <td>
                        <div className="flex items-center gap-1 text-sm">
                          {parseJsonArray(opp.route_token_symbols).join(' -> ') ||
                            parseJsonArray(opp.route_dexes).join(' -> ') ||
                            'Unknown route'}
                        </div>
                      </td>
                      <td className="font-mono text-matrix-success">
                        +{formatValue(opp.expected_net_profit_wei)} BNB
                      </td>
                      <td>
                        <ConfidenceBadge confidence={opp.confidence} />
                      </td>
                      <td>
                        <StatusBadge status={opp.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-8 text-center text-matrix-text-muted">
                <Zap className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No pending opportunities</p>
                <p className="text-sm mt-1">
                  Waiting for profitable arbitrage routes...
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* Top Competitors */}
        <Card padding="none">
          <div className="p-4 border-b border-matrix-border">
            <CardHeader
              title="Top Competitors"
              subtitle="24h leaderboard"
              action={
                <a
                  href="/competitors"
                  className="text-sm text-matrix-primary hover:underline"
                >
                  View all
                </a>
              }
            />
          </div>
          <div className="max-h-80 overflow-auto p-4 space-y-3">
            {overview?.top_competitors && overview.top_competitors.length > 0 ? (
              overview.top_competitors.map((comp, index) => (
                <div
                  key={comp.id || `competitor-${index}`}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-matrix-surface-hover"
                >
                  <div className="text-lg font-bold text-matrix-text-muted w-6">
                    #{index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <Address
                      address={comp.address || '0x0000000000000000000000000000000000000000'}
                      label={comp.label || undefined}
                      chain={selectedChain}
                      showLink={false}
                    />
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-matrix-success text-sm">
                      +{formatValue(comp.total_profit_wei)} BNB
                    </div>
                    <div className="text-xs text-matrix-text-muted">
                      {(comp.success_rate ?? 0).toFixed(1)}% success
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center text-matrix-text-muted py-8">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No competitors tracked yet</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Recent Executions & AI Recommendations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Executions */}
        <Card padding="none">
          <div className="p-4 border-b border-matrix-border">
            <CardHeader
              title="Recent Executions"
              subtitle="Latest trade attempts"
            />
          </div>
          <div className="max-h-64 overflow-auto">
            {recentExecs && recentExecs.length > 0 ? (
              <table className="data-table">
                <thead className="sticky top-0 bg-matrix-surface">
                  <tr>
                    <th>Transaction</th>
                    <th>Profit</th>
                    <th>Status</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {recentExecs.slice(0, 5).map((exec, index) => (
                    <tr key={exec.id || `exec-${index}`}>
                      <td>
                        {exec.tx_hash ? (
                          <TxHash hash={exec.tx_hash} chain={selectedChain} />
                        ) : (
                          <span className="text-matrix-text-muted text-sm">
                            Pending...
                          </span>
                        )}
                      </td>
                      <td
                        className={`font-mono ${
                          exec.status === 'success'
                            ? 'text-matrix-success'
                            : 'text-matrix-text-muted'
                        }`}
                      >
                        {exec.status === 'success'
                          ? `+${formatValue(exec.net_profit_wei)} BNB`
                          : '-'}
                      </td>
                      <td>
                        <StatusBadge status={exec.status} />
                      </td>
                      <td className="text-matrix-text-muted text-sm">
                        {exec.created_at ? new Date(exec.created_at).toLocaleTimeString() : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-8 text-center text-matrix-text-muted">
                <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No executions yet</p>
              </div>
            )}
          </div>
        </Card>

        {/* AI Recommendations */}
        <Card padding="none">
          <div className="p-4 border-b border-matrix-border">
            <CardHeader
              title="AI Recommendations"
              subtitle="Strategy improvements"
              action={
                <a
                  href="/ai-insights"
                  className="text-sm text-matrix-primary hover:underline"
                >
                  View all
                </a>
              }
            />
          </div>
          <div className="max-h-64 overflow-auto p-4 space-y-3">
            {recommendations && recommendations.length > 0 ? (
              recommendations.slice(0, 5).map((rec, index) => (
                <div
                  key={rec.id || `rec-${index}`}
                  className="p-3 rounded-lg bg-matrix-bg border border-matrix-border hover:border-matrix-primary/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            rec.priority === 'critical'
                              ? 'danger'
                              : rec.priority === 'warning'
                              ? 'warning'
                              : 'info'
                          }
                        >
                          {rec.priority || 'info'}
                        </Badge>
                        <Badge>{rec.category || 'General'}</Badge>
                      </div>
                      <h4 className="font-medium text-matrix-text mt-2">
                        {rec.title || 'Recommendation'}
                      </h4>
                      <p className="text-sm text-matrix-text-muted mt-1 line-clamp-2">
                        {rec.description || 'No description available'}
                      </p>
                    </div>
                    {rec.expected_profit_increase_pct != null && (
                      <div className="text-right">
                        <div className="text-matrix-success font-semibold">
                          +{rec.expected_profit_increase_pct}%
                        </div>
                        <div className="text-xs text-matrix-text-muted">
                          expected
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center text-matrix-text-muted py-8">
                <Brain className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No recommendations</p>
                <p className="text-sm mt-1">AI analysis will appear here</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Agent Status Grid */}
      <Card>
        <CardHeader
          title="Agent Status"
          subtitle="Matrix system components"
        />
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { name: 'NEO', status: 'online', role: 'Orchestrator' },
            { name: 'MORPHEUS', status: 'online', role: 'Market Data' },
            { name: 'ORACLE', status: 'online', role: 'Analysis' },
            { name: 'TRINITY', status: 'online', role: 'Execution' },
            { name: 'SERAPH', status: 'online', role: 'Validator' },
            { name: 'CYPHER', status: 'online', role: 'Risk' },
            { name: 'SATI', status: 'idle', role: 'ML Models' },
          ].map((agent) => (
            <div
              key={agent.name}
              className="p-3 bg-matrix-bg rounded-lg border border-matrix-border text-center"
            >
              <div
                className={`status-dot mx-auto mb-2 ${
                  agent.status === 'online' ? 'success' : 'warning'
                }`}
              />
              <div className="font-semibold text-matrix-primary text-sm">
                {agent.name}
              </div>
              <div className="text-xs text-matrix-text-muted">{agent.role}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
