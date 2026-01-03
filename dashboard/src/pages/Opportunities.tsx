import { useState } from 'react';
import { Zap, Clock, CheckCircle, XCircle, Filter, ArrowRight, Loader2 } from 'lucide-react';
import Card, { CardHeader } from '../components/ui/Card';
import StatCard from '../components/ui/StatCard';
import Badge, { ConfidenceBadge, StatusBadge } from '../components/ui/Badge';
import { CallTypeBadge, GasSavingsIndicator, type CallType } from '../components/ui/DirectPoolIndicator';
import {
  useOpportunities,
  usePendingOpportunities,
  useOpportunityStats,
  useExecuteOpportunity,
} from '../hooks/useApi';
import { useStore } from '../store/useStore';
import { formatEther } from 'viem';
import clsx from 'clsx';
import axios from 'axios';

type StatusFilter = 'all' | 'detected' | 'executing' | 'completed' | 'failed' | 'skipped';
type CallTypeFilter = 'all' | 'router' | 'direct' | 'hybrid';

export default function Opportunities() {
  const selectedChain = useStore((state) => state.selectedChain);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [confidenceFilter, setConfidenceFilter] = useState<string>('all');
  const [callTypeFilter, setCallTypeFilter] = useState<CallTypeFilter>('all');
  const [executingId, setExecutingId] = useState<string | null>(null);
  const addNotification = useStore((state) => state.addNotification);

  const { data: pendingOpps } = usePendingOpportunities();
  const { data: opportunitiesData } = useOpportunities(
    statusFilter !== 'all' ? statusFilter : undefined
  );
  const { data: stats } = useOpportunityStats();
  const executeMutation = useExecuteOpportunity();

  const handleExecute = async (opportunityId: string) => {
    setExecutingId(opportunityId);
    try {
      const result = await executeMutation.mutateAsync(opportunityId);

      // Poll for execution result
      const pollForResult = async (executionId: string, attempts = 0): Promise<void> => {
        if (attempts > 20) {
          addNotification({
            type: 'warning',
            title: 'Execution Timeout',
            message: 'Could not confirm execution status. Check history for results.',
          });
          return;
        }

        try {
          const { data } = await axios.get(`/api/executions/${executionId}`);
          const execution = data.data;

          if (execution.status === 'success') {
            const netProfit = execution.net_profit_wei
              ? (Number(execution.net_profit_wei) / 1e18).toFixed(6)
              : '0';
            addNotification({
              type: 'success',
              title: 'Execution Successful',
              message: `Profit: +${netProfit} BNB ($${execution.net_profit_usd?.toFixed(2) || '0'})`,
              txHash: execution.tx_hash,
              chain: execution.chain || selectedChain,
            });
          } else if (execution.status === 'reverted' || execution.status === 'failed') {
            addNotification({
              type: 'error',
              title: 'Execution Failed',
              message: execution.revert_reason || execution.error_message || 'Transaction reverted',
              txHash: execution.tx_hash,
              chain: execution.chain || selectedChain,
            });
          } else {
            // Still pending, poll again
            setTimeout(() => pollForResult(executionId, attempts + 1), 250);
          }
        } catch {
          // Retry on error
          setTimeout(() => pollForResult(executionId, attempts + 1), 250);
        }
      };

      // Start polling for result
      await pollForResult(result.execution_id);
    } catch (error) {
      console.error('Execution failed:', error);
      addNotification({
        type: 'error',
        title: 'Execution Error',
        message: 'Failed to submit execution. Please try again.',
      });
    } finally {
      setExecutingId(null);
    }
  };

  const opportunities = opportunitiesData?.data || [];

  const formatValue = (wei: string | number | null | undefined): string => {
    if (wei === null || wei === undefined || wei === '') return '0.00';
    try {
      const weiStr = typeof wei === 'number' ? wei.toString() : String(wei);
      if (!/^-?\d+$/.test(weiStr)) return '0.00';
      const value = formatEther(BigInt(weiStr));
      return parseFloat(value).toFixed(4);
    } catch {
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

  // Helper to determine call type from opportunity data
  const getCallType = (opp: any): CallType => {
    // Check for explicit call_type field first
    if (opp.call_type) return opp.call_type as CallType;
    // Fallback: infer from data (mock logic - real implementation would use API data)
    if (opp.pool_addresses && opp.pool_addresses.length > 0) return 'direct';
    if (opp.uses_router === false) return 'direct';
    if (opp.hybrid_route) return 'hybrid';
    return 'router';
  };

  const filteredOpportunities = opportunities.filter((opp: any) => {
    if (confidenceFilter !== 'all' && opp.confidence !== confidenceFilter) {
      return false;
    }
    if (callTypeFilter !== 'all') {
      const oppCallType = getCallType(opp);
      if (oppCallType !== callTypeFilter) {
        return false;
      }
    }
    return true;
  });

  const statusFilters: { id: StatusFilter; label: string; count?: number }[] = [
    { id: 'all', label: 'All' },
    { id: 'detected', label: 'Pending', count: stats?.pending || 0 },
    { id: 'executing', label: 'Executing' },
    { id: 'completed', label: 'Completed', count: stats?.completed || 0 },
    { id: 'failed', label: 'Failed', count: stats?.failed || 0 },
    { id: 'skipped', label: 'Skipped', count: stats?.skipped || 0 },
  ];

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-bold text-matrix-text">Our Opportunities</h1>
        <p className="text-matrix-text-muted mt-1">
          Detected arbitrage opportunities and execution history
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Detected"
          value={stats?.total_opportunities || 0}
          subtitle="All time"
          icon={<Zap className="w-5 h-5 text-matrix-primary" />}
        />
        <StatCard
          title="Pending"
          value={pendingOpps?.length || 0}
          subtitle="Ready to execute"
          icon={<Clock className="w-5 h-5 text-matrix-warning" />}
          variant={(pendingOpps?.length ?? 0) > 0 ? 'warning' : 'default'}
        />
        <StatCard
          title="Completed"
          value={stats?.completed || 0}
          subtitle="Successfully executed"
          icon={<CheckCircle className="w-5 h-5 text-matrix-success" />}
          variant="success"
        />
        <StatCard
          title="High Confidence"
          value={stats?.high_confidence_count || 0}
          subtitle="High or very high"
          icon={<Zap className="w-5 h-5 text-matrix-primary" />}
        />
      </div>

      {/* Pending Opportunities - Priority Section */}
      {pendingOpps && pendingOpps.length > 0 && (
        <Card className="border-matrix-primary/30">
          <CardHeader
            title="Ready for Execution"
            subtitle={`${pendingOpps.length} opportunities awaiting execution`}
            action={
              <Badge variant="success">
                <Zap className="w-3 h-3 mr-1" />
                Live
              </Badge>
            }
          />
          <div className="space-y-3">
            {pendingOpps.slice(0, 5).map((opp) => (
              <div
                key={opp.id}
                className="p-4 bg-matrix-bg rounded-lg border border-matrix-border hover:border-matrix-primary/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    {/* Route Display */}
                    <div className="flex items-center gap-2 text-sm">
                      {(() => {
                        const symbols = parseJsonArray(opp.route_token_symbols);
                        return symbols.length > 0 ? symbols.map((symbol, index) => (
                          <span key={index} className="flex items-center gap-1">
                            <span className="font-medium text-matrix-text">
                              {symbol}
                            </span>
                            {index < symbols.length - 1 && (
                              <ArrowRight className="w-3 h-3 text-matrix-text-muted" />
                            )}
                          </span>
                        )) : (
                          <span className="text-matrix-text-muted">
                            {parseJsonArray(opp.route_dexes).join(' → ') || 'Unknown route'}
                          </span>
                        );
                      })()}
                    </div>
                    {/* DEX Path */}
                    <div className="text-xs text-matrix-text-muted mt-1">
                      via {parseJsonArray(opp.route_dexes).join(', ') || '-'}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {/* Confidence */}
                    <ConfidenceBadge confidence={opp.confidence} />

                    {/* Expected Profit */}
                    <div className="text-right">
                      <div className="text-lg font-mono text-matrix-success">
                        +{formatValue(opp.expected_net_profit_wei)} BNB
                      </div>
                      {opp.expected_profit_usd && (
                        <div className="text-xs text-matrix-text-muted">
                          ~${opp.expected_profit_usd.toFixed(2)}
                        </div>
                      )}
                    </div>

                    {/* Execute Button */}
                    <button
                      className="btn btn-primary flex items-center gap-2"
                      onClick={() => handleExecute(opp.id)}
                      disabled={executingId === opp.id}
                    >
                      {executingId === opp.id ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Executing...
                        </>
                      ) : (
                        'Execute'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* Status Filter */}
        <div className="flex items-center gap-1 bg-matrix-surface rounded-lg p-1">
          {statusFilters.map((filter) => (
            <button
              key={filter.id}
              onClick={() => setStatusFilter(filter.id)}
              className={clsx(
                'px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                statusFilter === filter.id
                  ? 'bg-matrix-primary/20 text-matrix-primary'
                  : 'text-matrix-text-muted hover:text-matrix-text'
              )}
            >
              {filter.label}
              {filter.count !== undefined && filter.count > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-matrix-border text-xs">
                  {filter.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Confidence Filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-matrix-text-muted" />
          <select
            value={confidenceFilter}
            onChange={(e) => setConfidenceFilter(e.target.value)}
            className="bg-matrix-surface border-matrix-border"
          >
            <option value="all">All Confidence</option>
            <option value="very_high">Very High</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        {/* Call Type Filter */}
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-matrix-text-muted" />
          <select
            value={callTypeFilter}
            onChange={(e) => setCallTypeFilter(e.target.value as CallTypeFilter)}
            className="bg-matrix-surface border-matrix-border"
          >
            <option value="all">All Call Types</option>
            <option value="direct">Direct Pool</option>
            <option value="router">Router</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </div>
      </div>

      {/* Opportunities Table */}
      <Card padding="none">
        <table className="data-table">
          <thead>
            <tr>
              <th>Route</th>
              <th>DEXes</th>
              <th>Call Type</th>
              <th>Expected Profit</th>
              <th>Confidence</th>
              <th>Status</th>
              <th>Detected</th>
            </tr>
          </thead>
          <tbody>
            {filteredOpportunities.length > 0 ? (
              filteredOpportunities.map((opp: any) => (
                <tr key={opp.id}>
                  <td>
                    <div className="flex items-center gap-1 text-sm">
                      {(() => {
                        const symbols = parseJsonArray(opp.route_token_symbols);
                        return symbols.length > 0 ? symbols.map((symbol: string, index: number) => (
                          <span key={index} className="flex items-center gap-1">
                            <span className="font-medium">{symbol}</span>
                            {index < symbols.length - 1 && (
                              <ArrowRight className="w-3 h-3 text-matrix-text-muted" />
                            )}
                          </span>
                        )) : (
                          <span className="text-matrix-text-muted">-</span>
                        );
                      })()}
                    </div>
                  </td>
                  <td>
                    <div className="flex gap-1 flex-wrap">
                      {parseJsonArray(opp.route_dexes).map((dex: string, index: number) => (
                        <Badge key={index}>{dex}</Badge>
                      ))}
                    </div>
                  </td>
                  <td>
                    <div className="flex flex-col gap-1">
                      <CallTypeBadge callType={getCallType(opp)} />
                      <GasSavingsIndicator
                        gasEstimateDirect={opp.gas_estimate_direct}
                        gasEstimateRouter={opp.gas_estimate_router}
                      />
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
                  <td className="text-matrix-text-muted text-sm">
                    {new Date(opp.detected_at).toLocaleString()}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="text-center py-12">
                  <div className="text-matrix-text-muted">
                    <Zap className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No opportunities found</p>
                    <p className="text-sm mt-1">
                      Adjust filters or wait for new opportunities
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
