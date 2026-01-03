import { useState } from 'react';
import {
  Play,
  Pause,
  X,
  Clock,
  Loader2,
  CheckCircle,
  XCircle,
  ArrowRight,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import Card, { CardHeader } from './ui/Card';
import Badge from './ui/Badge';
import clsx from 'clsx';

export type QueueItemStatus = 'pending' | 'executing' | 'completed' | 'failed' | 'cancelled';

export interface QueueItem {
  id: string;
  opportunityId: string;
  route: string[];
  dexes: string[];
  expectedProfit: string;
  expectedProfitUsd?: number;
  status: QueueItemStatus;
  queuedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  txHash?: string;
  retryCount?: number;
}

interface ExecutionQueueProps {
  items?: QueueItem[];
  isPaused?: boolean;
  maxQueueSize?: number;
  onPauseToggle?: () => void;
  onCancelItem?: (itemId: string) => void;
  onRetryItem?: (itemId: string) => void;
  onClearCompleted?: () => void;
  className?: string;
}

// Mock data for development
const MOCK_QUEUE_ITEMS: QueueItem[] = [
  {
    id: 'q1',
    opportunityId: 'opp1',
    route: ['WBNB', 'BUSD', 'CAKE', 'WBNB'],
    dexes: ['PancakeV3', 'BiSwap', 'PancakeV2'],
    expectedProfit: '0.0234',
    expectedProfitUsd: 15.42,
    status: 'executing',
    queuedAt: new Date(Date.now() - 5000),
    startedAt: new Date(Date.now() - 2000),
  },
  {
    id: 'q2',
    opportunityId: 'opp2',
    route: ['WBNB', 'ETH', 'WBNB'],
    dexes: ['PancakeV3', 'DODO'],
    expectedProfit: '0.0156',
    expectedProfitUsd: 10.28,
    status: 'pending',
    queuedAt: new Date(Date.now() - 3000),
  },
  {
    id: 'q3',
    opportunityId: 'opp3',
    route: ['USDT', 'BUSD', 'USDC', 'USDT'],
    dexes: ['Curve', 'PancakeV3', 'BiSwap'],
    expectedProfit: '0.0089',
    expectedProfitUsd: 5.87,
    status: 'pending',
    queuedAt: new Date(Date.now() - 1000),
  },
  {
    id: 'q4',
    opportunityId: 'opp4',
    route: ['WBNB', 'BTC', 'WBNB'],
    dexes: ['PancakeV3', 'PancakeV2'],
    expectedProfit: '0.0312',
    expectedProfitUsd: 20.58,
    status: 'completed',
    queuedAt: new Date(Date.now() - 30000),
    startedAt: new Date(Date.now() - 28000),
    completedAt: new Date(Date.now() - 25000),
    txHash: '0x1234...abcd',
  },
  {
    id: 'q5',
    opportunityId: 'opp5',
    route: ['WBNB', 'LINK', 'WBNB'],
    dexes: ['BiSwap', 'PancakeV3'],
    expectedProfit: '0.0045',
    expectedProfitUsd: 2.97,
    status: 'failed',
    queuedAt: new Date(Date.now() - 60000),
    startedAt: new Date(Date.now() - 58000),
    completedAt: new Date(Date.now() - 55000),
    error: 'Insufficient output amount',
    retryCount: 1,
  },
];

export default function ExecutionQueue({
  items = MOCK_QUEUE_ITEMS,
  isPaused = false,
  maxQueueSize = 10,
  onPauseToggle,
  onCancelItem,
  onRetryItem,
  onClearCompleted,
  className,
}: ExecutionQueueProps) {
  const [showCompleted, setShowCompleted] = useState(true);

  const pendingItems = items.filter((item) => item.status === 'pending');
  const executingItems = items.filter((item) => item.status === 'executing');
  const completedItems = items.filter((item) =>
    item.status === 'completed' || item.status === 'failed' || item.status === 'cancelled'
  );

  const activeCount = pendingItems.length + executingItems.length;

  const getStatusIcon = (status: QueueItemStatus) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-matrix-text-muted" />;
      case 'executing':
        return <Loader2 className="w-4 h-4 text-matrix-warning animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-matrix-success" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-matrix-danger" />;
      case 'cancelled':
        return <X className="w-4 h-4 text-matrix-text-muted" />;
    }
  };

  const getStatusBadge = (status: QueueItemStatus) => {
    const config: Record<QueueItemStatus, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' }> = {
      pending: { label: 'Pending', variant: 'default' },
      executing: { label: 'Executing', variant: 'warning' },
      completed: { label: 'Completed', variant: 'success' },
      failed: { label: 'Failed', variant: 'danger' },
      cancelled: { label: 'Cancelled', variant: 'default' },
    };
    const { label, variant } = config[status];
    return <Badge variant={variant}>{label}</Badge>;
  };

  const formatTime = (date: Date) => {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return date.toLocaleTimeString();
  };

  return (
    <Card className={className}>
      <CardHeader
        title="Execution Queue"
        subtitle={`${activeCount} active, ${completedItems.length} completed`}
        action={
          <div className="flex items-center gap-2">
            {/* Queue Status Indicator */}
            <div className={clsx(
              'flex items-center gap-2 px-3 py-1 rounded-full text-sm',
              isPaused
                ? 'bg-matrix-warning/20 text-matrix-warning'
                : 'bg-matrix-success/20 text-matrix-success'
            )}>
              <div className={clsx(
                'w-2 h-2 rounded-full',
                isPaused ? 'bg-matrix-warning' : 'bg-matrix-success animate-pulse'
              )} />
              {isPaused ? 'Paused' : 'Running'}
            </div>

            {/* Pause/Resume Button */}
            <button
              onClick={onPauseToggle}
              className={clsx(
                'p-2 rounded-lg transition-colors',
                isPaused
                  ? 'bg-matrix-success/20 text-matrix-success hover:bg-matrix-success/30'
                  : 'bg-matrix-warning/20 text-matrix-warning hover:bg-matrix-warning/30'
              )}
              title={isPaused ? 'Resume Queue' : 'Pause Queue'}
            >
              {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </button>
          </div>
        }
      />

      {/* Queue Capacity */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-matrix-text-muted mb-1">
          <span>Queue Capacity</span>
          <span>{activeCount}/{maxQueueSize}</span>
        </div>
        <div className="h-2 bg-matrix-bg rounded-full overflow-hidden">
          <div
            className={clsx(
              'h-full transition-all duration-300 rounded-full',
              activeCount / maxQueueSize > 0.8 ? 'bg-matrix-danger' :
              activeCount / maxQueueSize > 0.5 ? 'bg-matrix-warning' : 'bg-matrix-success'
            )}
            style={{ width: `${(activeCount / maxQueueSize) * 100}%` }}
          />
        </div>
      </div>

      {/* Active Queue Items */}
      <div className="space-y-2 mb-4">
        {executingItems.length === 0 && pendingItems.length === 0 ? (
          <div className="text-center py-6 text-matrix-text-muted">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Queue is empty</p>
          </div>
        ) : (
          <>
            {/* Executing Items */}
            {executingItems.map((item) => (
              <QueueItemRow
                key={item.id}
                item={item}
                onCancel={onCancelItem}
                onRetry={onRetryItem}
              />
            ))}

            {/* Pending Items */}
            {pendingItems.map((item) => (
              <QueueItemRow
                key={item.id}
                item={item}
                onCancel={onCancelItem}
                onRetry={onRetryItem}
              />
            ))}
          </>
        )}
      </div>

      {/* Completed Items Section */}
      {completedItems.length > 0 && (
        <div className="border-t border-matrix-border pt-4">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setShowCompleted(!showCompleted)}
              className="text-sm text-matrix-text-muted hover:text-matrix-text transition-colors"
            >
              {showCompleted ? 'Hide' : 'Show'} Completed ({completedItems.length})
            </button>
            {onClearCompleted && (
              <button
                onClick={onClearCompleted}
                className="text-xs text-matrix-text-muted hover:text-matrix-danger transition-colors"
              >
                Clear All
              </button>
            )}
          </div>

          {showCompleted && (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {completedItems.map((item) => (
                <QueueItemRow
                  key={item.id}
                  item={item}
                  onCancel={onCancelItem}
                  onRetry={onRetryItem}
                  compact
                />
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// Individual queue item row
function QueueItemRow({
  item,
  onCancel,
  onRetry,
  compact = false,
}: {
  item: QueueItem;
  onCancel?: (id: string) => void;
  onRetry?: (id: string) => void;
  compact?: boolean;
}) {
  const getStatusIcon = (status: QueueItemStatus) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-matrix-text-muted" />;
      case 'executing':
        return <Loader2 className="w-4 h-4 text-matrix-warning animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-matrix-success" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-matrix-danger" />;
      case 'cancelled':
        return <X className="w-4 h-4 text-matrix-text-muted" />;
    }
  };

  return (
    <div
      className={clsx(
        'p-3 rounded-lg border transition-colors',
        item.status === 'executing' && 'border-matrix-warning/30 bg-matrix-warning/5',
        item.status === 'pending' && 'border-matrix-border bg-matrix-bg',
        item.status === 'completed' && 'border-matrix-success/20 bg-matrix-bg opacity-75',
        item.status === 'failed' && 'border-matrix-danger/30 bg-matrix-danger/5',
        item.status === 'cancelled' && 'border-matrix-border bg-matrix-bg opacity-50',
        compact && 'py-2'
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Status Icon */}
          {getStatusIcon(item.status)}

          {/* Route */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 text-sm truncate">
              {item.route.map((token, index) => (
                <span key={index} className="flex items-center gap-1">
                  <span className="font-medium text-matrix-text">{token}</span>
                  {index < item.route.length - 1 && (
                    <ArrowRight className="w-3 h-3 text-matrix-text-muted flex-shrink-0" />
                  )}
                </span>
              ))}
            </div>
            {!compact && (
              <div className="text-xs text-matrix-text-muted mt-0.5">
                via {item.dexes.join(' → ')}
              </div>
            )}
          </div>
        </div>

        {/* Expected Profit */}
        <div className="text-right mr-3">
          <div className="font-mono text-sm text-matrix-success">
            +{item.expectedProfit} BNB
          </div>
          {item.expectedProfitUsd && !compact && (
            <div className="text-xs text-matrix-text-muted">
              ~${item.expectedProfitUsd.toFixed(2)}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {item.status === 'failed' && onRetry && (
            <button
              onClick={() => onRetry(item.id)}
              className="p-1.5 rounded hover:bg-matrix-surface-hover text-matrix-warning transition-colors"
              title="Retry"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
          {(item.status === 'pending' || item.status === 'executing') && onCancel && (
            <button
              onClick={() => onCancel(item.id)}
              className="p-1.5 rounded hover:bg-matrix-danger/20 text-matrix-text-muted hover:text-matrix-danger transition-colors"
              title="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Error Message */}
      {item.status === 'failed' && item.error && !compact && (
        <div className="mt-2 flex items-start gap-2 text-xs text-matrix-danger bg-matrix-danger/10 p-2 rounded">
          <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
          <span>{item.error}</span>
          {item.retryCount !== undefined && item.retryCount > 0 && (
            <span className="text-matrix-text-muted">(Retried {item.retryCount}x)</span>
          )}
        </div>
      )}
    </div>
  );
}

// Queue Status Badge for use in header
export function QueueStatusBadge({
  activeCount,
  isPaused,
  onClick,
}: {
  activeCount: number;
  isPaused: boolean;
  onClick?: () => void;
}) {
  if (activeCount === 0 && !isPaused) {
    return null;
  }

  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
        isPaused
          ? 'bg-matrix-warning/20 text-matrix-warning hover:bg-matrix-warning/30'
          : 'bg-matrix-primary/20 text-matrix-primary hover:bg-matrix-primary/30'
      )}
    >
      {isPaused ? (
        <Pause className="w-4 h-4" />
      ) : (
        <Loader2 className="w-4 h-4 animate-spin" />
      )}
      <span>
        {isPaused ? 'Paused' : `${activeCount} in queue`}
      </span>
    </button>
  );
}
