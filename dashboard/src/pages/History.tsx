import { useState } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Calendar, TrendingUp, Activity, DollarSign } from 'lucide-react';
import Card, { CardHeader } from '../components/ui/Card';
import StatCard from '../components/ui/StatCard';
import Badge, { StatusBadge } from '../components/ui/Badge';
import { TxHash } from '../components/ui/Address';
import {
  useDailyPerformance,
  usePerformanceSummary,
  useExecutions,
} from '../hooks/useApi';
import { useStore } from '../store/useStore';
import { formatEther } from 'viem';
import clsx from 'clsx';

type TimeRange = '7d' | '30d' | '90d';

export default function History() {
  const selectedChain = useStore((state) => state.selectedChain);
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');

  const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
  const { data: dailyData } = useDailyPerformance(days);
  const { data: summary } = usePerformanceSummary();
  const { data: executionsData } = useExecutions();

  const executions = executionsData?.data || [];

  const formatValue = (wei: string | number | null | undefined): string => {
    if (wei === null || wei === undefined || wei === '') return '0';
    try {
      const weiStr = typeof wei === 'number' ? wei.toString() : String(wei);
      const value = formatEther(BigInt(weiStr));
      return parseFloat(value).toFixed(4);
    } catch {
      return '0';
    }
  };

  // Transform data for charts
  const chartData = (dailyData || [])
    .slice()
    .reverse()
    .map((day: any) => ({
      date: new Date(day.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      profit: parseFloat(formatValue(day.net_profit_wei)),
      executions: day.total_executions || 0,
      successRate: day.success_rate || 0,
      opportunities: day.total_opportunities || 0,
    }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-matrix-surface border border-matrix-border rounded-lg p-3 shadow-lg">
          <p className="text-matrix-text font-medium mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p
              key={index}
              className="text-sm"
              style={{ color: entry.color }}
            >
              {entry.name}: {entry.value}
              {entry.name === 'profit' ? ' BNB' : ''}
              {entry.name === 'successRate' ? '%' : ''}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-matrix-text">
            Historical Analysis
          </h1>
          <p className="text-matrix-text-muted mt-1">
            Performance metrics and transaction history
          </p>
        </div>
        <div className="flex items-center gap-1 bg-matrix-surface rounded-lg p-1">
          {(['7d', '30d', '90d'] as TimeRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={clsx(
                'px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                timeRange === range
                  ? 'bg-matrix-primary/20 text-matrix-primary'
                  : 'text-matrix-text-muted hover:text-matrix-text'
              )}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Profit"
          value={`${formatValue(summary?.all_time?.net_profit_wei)} BNB`}
          subtitle="All time"
          icon={<DollarSign className="w-5 h-5 text-matrix-primary" />}
          variant="success"
        />
        <StatCard
          title={`${timeRange} Profit`}
          value={
            timeRange === '7d'
              ? `${formatValue(summary?.week?.net_profit_wei)} BNB`
              : `${formatValue(summary?.month?.net_profit_wei)} BNB`
          }
          subtitle={`Last ${days} days`}
          icon={<TrendingUp className="w-5 h-5 text-matrix-success" />}
        />
        <StatCard
          title="Total Executions"
          value={summary?.all_time?.total_executions || 0}
          subtitle={`${summary?.all_time?.successful_executions || 0} successful`}
          icon={<Activity className="w-5 h-5 text-matrix-warning" />}
        />
        <StatCard
          title="Avg Success Rate"
          value={`${(summary?.all_time?.avg_success_rate || 0).toFixed(1)}%`}
          subtitle="All time average"
          icon={<Calendar className="w-5 h-5 text-blue-400" />}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profit Chart */}
        <Card>
          <CardHeader title="Daily Profit" subtitle={`Last ${days} days`} />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00ff41" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#00ff41" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="date" stroke="#888" fontSize={12} />
                <YAxis stroke="#888" fontSize={12} />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="profit"
                  stroke="#00ff41"
                  fill="url(#profitGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Executions Chart */}
        <Card>
          <CardHeader title="Daily Executions" subtitle={`Last ${days} days`} />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="date" stroke="#888" fontSize={12} />
                <YAxis stroke="#888" fontSize={12} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="executions" fill="#00ff41" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Success Rate Trend */}
      <Card>
        <CardHeader
          title="Success Rate & Opportunities"
          subtitle="Daily trends"
        />
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="date" stroke="#888" fontSize={12} />
              <YAxis yAxisId="left" stroke="#888" fontSize={12} />
              <YAxis yAxisId="right" orientation="right" stroke="#888" fontSize={12} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="successRate"
                name="Success Rate (%)"
                stroke="#00ff41"
                strokeWidth={2}
                dot={false}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="opportunities"
                name="Opportunities"
                stroke="#ffbb00"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Execution Log */}
      <Card padding="none">
        <div className="p-4 border-b border-matrix-border">
          <CardHeader
            title="Execution Log"
            subtitle="Recent transaction history"
          />
        </div>
        <div className="max-h-96 overflow-auto">
          <table className="data-table">
            <thead className="sticky top-0 bg-matrix-surface">
              <tr>
                <th>Transaction</th>
                <th>Route</th>
                <th>Expected</th>
                <th>Actual</th>
                <th>Gas Cost</th>
                <th>Status</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {executions.length > 0 ? (
                executions.map((exec: any) => (
                  <tr key={exec.id}>
                    <td>
                      {exec.tx_hash ? (
                        <TxHash hash={exec.tx_hash} chain={selectedChain} />
                      ) : (
                        <span className="text-matrix-text-muted">-</span>
                      )}
                    </td>
                    <td>
                      <span className="text-sm text-matrix-text-muted">
                        {exec.route_token_symbols
                          ? (() => {
                              try {
                                const symbols = JSON.parse(exec.route_token_symbols);
                                return Array.isArray(symbols) ? symbols.join(' → ') : '-';
                              } catch {
                                return '-';
                              }
                            })()
                          : '-'}
                      </span>
                    </td>
                    <td className="font-mono text-matrix-text-muted">
                      {exec.expected_profit_wei
                        ? `${formatValue(exec.expected_profit_wei)} BNB`
                        : '-'}
                    </td>
                    <td
                      className={clsx(
                        'font-mono',
                        exec.status === 'success'
                          ? 'text-matrix-success'
                          : 'text-matrix-text-muted'
                      )}
                    >
                      {exec.status === 'success' && exec.net_profit_wei
                        ? `+${formatValue(exec.net_profit_wei)} BNB`
                        : '-'}
                    </td>
                    <td className="font-mono text-matrix-text-muted">
                      {exec.gas_cost_wei
                        ? `${formatValue(exec.gas_cost_wei)} BNB`
                        : '-'}
                    </td>
                    <td>
                      <StatusBadge status={exec.status} />
                    </td>
                    <td className="text-matrix-text-muted text-sm">
                      {new Date(exec.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <Activity className="w-12 h-12 mx-auto mb-3 opacity-50 text-matrix-text-muted" />
                    <p className="text-matrix-text-muted">No executions yet</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
