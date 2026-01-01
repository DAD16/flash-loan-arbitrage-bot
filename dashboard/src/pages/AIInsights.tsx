import { Brain, Lightbulb, TrendingUp, Check, X, AlertTriangle } from 'lucide-react';
import Card, { CardHeader } from '../components/ui/Card';
import StatCard from '../components/ui/StatCard';
import Badge, { PriorityBadge } from '../components/ui/Badge';
import {
  usePendingRecommendations,
  useRecommendations,
  useApplyRecommendation,
  useDismissRecommendation,
} from '../hooks/useApi';
import { useStore } from '../store/useStore';
import clsx from 'clsx';

export default function AIInsights() {
  const selectedChain = useStore((state) => state.selectedChain);
  const { data: pendingRecs } = usePendingRecommendations();
  const { data: allRecsData } = useRecommendations();
  const applyMutation = useApplyRecommendation();
  const dismissMutation = useDismissRecommendation();

  const allRecs = allRecsData?.data || [];
  const appliedRecs = allRecs.filter((r: any) => r.status === 'applied');
  const dismissedRecs = allRecs.filter((r: any) => r.status === 'dismissed');

  const handleApply = async (id: string) => {
    try {
      await applyMutation.mutateAsync(id);
    } catch (error) {
      console.error('Failed to apply recommendation:', error);
    }
  };

  const handleDismiss = async (id: string, reason?: string) => {
    try {
      await dismissMutation.mutateAsync({ id, reason });
    } catch (error) {
      console.error('Failed to dismiss recommendation:', error);
    }
  };

  // Group by category
  const categorizedRecs = (pendingRecs || []).reduce((acc: any, rec: any) => {
    if (!acc[rec.category]) {
      acc[rec.category] = [];
    }
    acc[rec.category].push(rec);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-bold text-matrix-text">AI Insights</h1>
        <p className="text-matrix-text-muted mt-1">
          AI-powered recommendations to optimize your strategy
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Pending"
          value={pendingRecs?.length || 0}
          subtitle="Awaiting review"
          icon={<Brain className="w-5 h-5 text-matrix-primary" />}
        />
        <StatCard
          title="Critical"
          value={pendingRecs?.filter((r: any) => r.priority === 'critical').length || 0}
          subtitle="Needs attention"
          icon={<AlertTriangle className="w-5 h-5 text-matrix-danger" />}
          variant="danger"
        />
        <StatCard
          title="Applied"
          value={appliedRecs.length}
          subtitle="Implemented"
          icon={<Check className="w-5 h-5 text-matrix-success" />}
          variant="success"
        />
        <StatCard
          title="Avg Impact"
          value={
            pendingRecs?.length
              ? `+${(
                  pendingRecs.reduce(
                    (sum: number, r: any) =>
                      sum + (r.expected_profit_increase_pct || 0),
                    0
                  ) / pendingRecs.length
                ).toFixed(1)}%`
              : '0%'
          }
          subtitle="Expected improvement"
          icon={<TrendingUp className="w-5 h-5 text-matrix-success" />}
        />
      </div>

      {/* Quick Wins */}
      {pendingRecs && pendingRecs.filter((r: any) => (r.expected_profit_increase_pct || 0) > 5).length > 0 && (
        <Card className="border-matrix-success/30">
          <CardHeader
            title="Quick Wins"
            subtitle="High-impact, easy to implement"
            action={
              <Badge variant="success">
                <Lightbulb className="w-3 h-3 mr-1" />
                Recommended
              </Badge>
            }
          />
          <div className="space-y-3">
            {pendingRecs
              .filter((r: any) => (r.expected_profit_increase_pct || 0) > 5)
              .slice(0, 3)
              .map((rec: any) => (
                <div
                  key={rec.id}
                  className="p-4 bg-matrix-bg rounded-lg border border-matrix-border"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <PriorityBadge priority={rec.priority} />
                        <Badge>{rec.category}</Badge>
                      </div>
                      <h3 className="font-medium text-matrix-text">{rec.title}</h3>
                      <p className="text-sm text-matrix-text-muted mt-1">
                        {rec.description}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-2xl font-bold text-matrix-success">
                        +{rec.expected_profit_increase_pct}%
                      </div>
                      <div className="text-xs text-matrix-text-muted">
                        expected increase
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => handleApply(rec.id)}
                          disabled={applyMutation.isPending}
                          className="btn btn-primary text-sm"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDismiss(rec.id)}
                          disabled={dismissMutation.isPending}
                          className="btn btn-secondary text-sm"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </Card>
      )}

      {/* All Recommendations by Category */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Object.entries(categorizedRecs).map(([category, recs]: [string, any]) => (
          <Card key={category} padding="none">
            <div className="p-4 border-b border-matrix-border">
              <CardHeader
                title={category.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                subtitle={`${recs.length} recommendation${recs.length !== 1 ? 's' : ''}`}
              />
            </div>
            <div className="max-h-80 overflow-auto p-4 space-y-3">
              {recs.map((rec: any) => (
                <div
                  key={rec.id}
                  className={clsx(
                    'p-3 rounded-lg border transition-colors',
                    rec.priority === 'critical'
                      ? 'bg-matrix-danger/5 border-matrix-danger/30'
                      : 'bg-matrix-bg border-matrix-border hover:border-matrix-primary/30'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <PriorityBadge priority={rec.priority} />
                        {rec.expected_profit_increase_pct && (
                          <span className="text-xs text-matrix-success font-mono">
                            +{rec.expected_profit_increase_pct}%
                          </span>
                        )}
                      </div>
                      <h4 className="font-medium text-matrix-text text-sm truncate">
                        {rec.title}
                      </h4>
                      <p className="text-xs text-matrix-text-muted mt-1 line-clamp-2">
                        {rec.description}
                      </p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleApply(rec.id)}
                        className="p-1.5 rounded hover:bg-matrix-success/20 text-matrix-success transition-colors"
                        title="Apply"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDismiss(rec.id)}
                        className="p-1.5 rounded hover:bg-matrix-danger/20 text-matrix-danger transition-colors"
                        title="Dismiss"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}

        {Object.keys(categorizedRecs).length === 0 && (
          <Card className="lg:col-span-2">
            <div className="text-center py-12 text-matrix-text-muted">
              <Brain className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg">No pending recommendations</p>
              <p className="text-sm mt-2">
                The AI analysis system will generate insights based on your trading activity
              </p>
            </div>
          </Card>
        )}
      </div>

      {/* Applied History */}
      {appliedRecs.length > 0 && (
        <Card padding="none">
          <div className="p-4 border-b border-matrix-border">
            <CardHeader
              title="Applied Recommendations"
              subtitle="Previously implemented changes"
            />
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Category</th>
                <th>Expected Impact</th>
                <th>Actual Impact</th>
                <th>Applied</th>
              </tr>
            </thead>
            <tbody>
              {appliedRecs.slice(0, 10).map((rec: any) => (
                <tr key={rec.id}>
                  <td className="font-medium">{rec.title}</td>
                  <td>
                    <Badge>{rec.category}</Badge>
                  </td>
                  <td className="text-matrix-success font-mono">
                    +{rec.expected_profit_increase_pct || 0}%
                  </td>
                  <td
                    className={clsx(
                      'font-mono',
                      rec.actual_impact_pct
                        ? rec.actual_impact_pct >= 0
                          ? 'text-matrix-success'
                          : 'text-matrix-danger'
                        : 'text-matrix-text-muted'
                    )}
                  >
                    {rec.actual_impact_pct !== null
                      ? `${rec.actual_impact_pct >= 0 ? '+' : ''}${rec.actual_impact_pct}%`
                      : 'Pending validation'}
                  </td>
                  <td className="text-matrix-text-muted text-sm">
                    {rec.applied_at
                      ? new Date(rec.applied_at).toLocaleDateString()
                      : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
