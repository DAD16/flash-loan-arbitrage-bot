import { useState } from 'react';
import { Save, RotateCcw, AlertTriangle, Zap, Fuel, Shield, Settings2, ListOrdered } from 'lucide-react';
import Card, { CardHeader } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import ExecutionConfigPanel, { ExecutionConfig } from '../components/ExecutionConfigPanel';
import ExecutionQueue from '../components/ExecutionQueue';
import { useCurrentStrategy, useDexes, useTokens, useSaveStrategy } from '../hooks/useApi';
import { useStore } from '../store/useStore';
import clsx from 'clsx';

export default function Strategy() {
  const selectedChain = useStore((state) => state.selectedChain);
  const { data: strategy, isLoading } = useCurrentStrategy();
  const { data: dexes } = useDexes();
  const { data: tokens } = useTokens();
  const saveStrategy = useSaveStrategy();

  // Local state for form
  const [formData, setFormData] = useState({
    minProfitWei: '100000000000000000',
    targetProfitWei: '500000000000000000',
    maxPositionWei: '10000000000000000000',
    baseGasGwei: 3.0,
    maxGasGwei: 10.0,
    priorityFeeGwei: 1.0,
    hourlyLossLimitWei: '500000000000000000',
    dailyLossLimitWei: '2000000000000000000',
    consecutiveFailures: 5,
    cooldownSeconds: 300,
  });

  // Execution config state
  const [executionConfig, setExecutionConfig] = useState<ExecutionConfig | null>(null);

  // Execution queue state
  const [queuePaused, setQueuePaused] = useState(false);

  // Handle execution config changes
  const handleExecutionConfigChange = (config: ExecutionConfig) => {
    setExecutionConfig(config);
    console.log('Execution config updated:', config);
    // TODO: Save to backend via API
  };

  // Handle queue actions
  const handleQueuePauseToggle = () => {
    setQueuePaused(!queuePaused);
    // TODO: Call API to pause/resume queue
  };

  const handleCancelQueueItem = (itemId: string) => {
    console.log('Cancel queue item:', itemId);
    // TODO: Call API to cancel item
  };

  const handleRetryQueueItem = (itemId: string) => {
    console.log('Retry queue item:', itemId);
    // TODO: Call API to retry item
  };

  const handleClearCompleted = () => {
    console.log('Clear completed items');
    // TODO: Call API to clear completed items
  };

  const handleSave = async () => {
    try {
      await saveStrategy.mutateAsync({
        chain: selectedChain,
        min_profit_wei: formData.minProfitWei,
        target_profit_wei: formData.targetProfitWei,
        max_position_wei: formData.maxPositionWei,
        base_gas_gwei: formData.baseGasGwei,
        max_gas_gwei: formData.maxGasGwei,
        priority_fee_gwei: formData.priorityFeeGwei,
        hourly_loss_limit_wei: formData.hourlyLossLimitWei,
        daily_loss_limit_wei: formData.dailyLossLimitWei,
        circuit_breaker_config: {
          consecutiveFailures: formData.consecutiveFailures,
          lossThresholdWei: formData.dailyLossLimitWei,
          cooldownSeconds: formData.cooldownSeconds,
        },
        change_reason: 'Manual update from dashboard',
      });
    } catch (error) {
      console.error('Failed to save strategy:', error);
    }
  };

  const weiToEth = (wei: string): string => {
    try {
      return (parseFloat(wei) / 1e18).toFixed(4);
    } catch {
      return '0';
    }
  };

  const ethToWei = (eth: string): string => {
    try {
      return (parseFloat(eth) * 1e18).toString();
    } catch {
      return '0';
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-matrix-text">Strategy Center</h1>
          <p className="text-matrix-text-muted mt-1">
            Configure trading parameters and risk controls
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn btn-secondary flex items-center gap-2">
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={saveStrategy.isPending}
            className="btn btn-primary flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {saveStrategy.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Execution Configuration and Queue */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        {/* Execution Configuration Panel - takes 2 columns */}
        <div className="xl:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <Settings2 className="w-5 h-5 text-matrix-primary" />
            <h2 className="text-lg font-semibold text-matrix-text">Execution Configuration</h2>
          </div>
          <ExecutionConfigPanel onConfigChange={handleExecutionConfigChange} />
        </div>

        {/* Execution Queue - takes 1 column */}
        <div className="xl:col-span-1">
          <div className="flex items-center gap-2 mb-4">
            <ListOrdered className="w-5 h-5 text-matrix-warning" />
            <h2 className="text-lg font-semibold text-matrix-text">Execution Queue</h2>
          </div>
          <ExecutionQueue
            isPaused={queuePaused}
            onPauseToggle={handleQueuePauseToggle}
            onCancelItem={handleCancelQueueItem}
            onRetryItem={handleRetryQueueItem}
            onClearCompleted={handleClearCompleted}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profit Thresholds */}
        <Card>
          <CardHeader
            title="Profit Thresholds"
            subtitle="Minimum profit requirements"
            action={<Zap className="w-5 h-5 text-matrix-primary" />}
          />
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-matrix-text-muted mb-2">
                Minimum Profit (BNB)
              </label>
              <input
                type="number"
                step="0.01"
                value={weiToEth(formData.minProfitWei)}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    minProfitWei: ethToWei(e.target.value),
                  })
                }
                className="w-full font-mono"
              />
              <p className="text-xs text-matrix-text-muted mt-1">
                Skip opportunities below this threshold
              </p>
            </div>
            <div>
              <label className="block text-sm text-matrix-text-muted mb-2">
                Target Profit (BNB)
              </label>
              <input
                type="number"
                step="0.01"
                value={weiToEth(formData.targetProfitWei)}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    targetProfitWei: ethToWei(e.target.value),
                  })
                }
                className="w-full font-mono"
              />
              <p className="text-xs text-matrix-text-muted mt-1">
                Prioritize opportunities above this level
              </p>
            </div>
            <div>
              <label className="block text-sm text-matrix-text-muted mb-2">
                Max Position Size (BNB)
              </label>
              <input
                type="number"
                step="0.1"
                value={weiToEth(formData.maxPositionWei)}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    maxPositionWei: ethToWei(e.target.value),
                  })
                }
                className="w-full font-mono"
              />
              <p className="text-xs text-matrix-text-muted mt-1">
                Maximum flash loan amount per trade
              </p>
            </div>
          </div>
        </Card>

        {/* Gas Strategy */}
        <Card>
          <CardHeader
            title="Gas Strategy"
            subtitle="Transaction fee settings"
            action={<Fuel className="w-5 h-5 text-matrix-warning" />}
          />
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-matrix-text-muted mb-2">
                Base Gas Price (Gwei)
              </label>
              <input
                type="number"
                step="0.1"
                value={formData.baseGasGwei}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    baseGasGwei: parseFloat(e.target.value),
                  })
                }
                className="w-full font-mono"
              />
            </div>
            <div>
              <label className="block text-sm text-matrix-text-muted mb-2">
                Max Gas Price (Gwei)
              </label>
              <input
                type="number"
                step="0.1"
                value={formData.maxGasGwei}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    maxGasGwei: parseFloat(e.target.value),
                  })
                }
                className="w-full font-mono"
              />
              <p className="text-xs text-matrix-text-muted mt-1">
                Will not execute if gas exceeds this
              </p>
            </div>
            <div>
              <label className="block text-sm text-matrix-text-muted mb-2">
                Priority Fee (Gwei)
              </label>
              <input
                type="number"
                step="0.1"
                value={formData.priorityFeeGwei}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    priorityFeeGwei: parseFloat(e.target.value),
                  })
                }
                className="w-full font-mono"
              />
              <p className="text-xs text-matrix-text-muted mt-1">
                Tip for faster inclusion
              </p>
            </div>
          </div>
        </Card>

        {/* Risk Controls */}
        <Card>
          <CardHeader
            title="Risk Controls"
            subtitle="Loss limits and circuit breakers"
            action={<Shield className="w-5 h-5 text-matrix-danger" />}
          />
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-matrix-text-muted mb-2">
                Hourly Loss Limit (BNB)
              </label>
              <input
                type="number"
                step="0.1"
                value={weiToEth(formData.hourlyLossLimitWei)}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    hourlyLossLimitWei: ethToWei(e.target.value),
                  })
                }
                className="w-full font-mono"
              />
            </div>
            <div>
              <label className="block text-sm text-matrix-text-muted mb-2">
                Daily Loss Limit (BNB)
              </label>
              <input
                type="number"
                step="0.1"
                value={weiToEth(formData.dailyLossLimitWei)}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    dailyLossLimitWei: ethToWei(e.target.value),
                  })
                }
                className="w-full font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-matrix-text-muted mb-2">
                  Max Consecutive Failures
                </label>
                <input
                  type="number"
                  value={formData.consecutiveFailures}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      consecutiveFailures: parseInt(e.target.value),
                    })
                  }
                  className="w-full font-mono"
                />
              </div>
              <div>
                <label className="block text-sm text-matrix-text-muted mb-2">
                  Cooldown (seconds)
                </label>
                <input
                  type="number"
                  value={formData.cooldownSeconds}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      cooldownSeconds: parseInt(e.target.value),
                    })
                  }
                  className="w-full font-mono"
                />
              </div>
            </div>
            <div className="p-3 bg-matrix-danger/10 border border-matrix-danger/30 rounded-lg">
              <div className="flex items-center gap-2 text-matrix-danger text-sm">
                <AlertTriangle className="w-4 h-4" />
                Circuit breaker triggers after {formData.consecutiveFailures} failures
              </div>
            </div>
          </div>
        </Card>

        {/* DEX Configuration */}
        <Card padding="none">
          <div className="p-4 border-b border-matrix-border">
            <CardHeader
              title="DEX Configuration"
              subtitle="Enable/disable trading venues"
            />
          </div>
          <div className="max-h-64 overflow-auto">
            <table className="data-table">
              <thead className="sticky top-0 bg-matrix-surface">
                <tr>
                  <th>DEX</th>
                  <th>Type</th>
                  <th>Fee</th>
                  <th>Max Slippage</th>
                  <th>Enabled</th>
                </tr>
              </thead>
              <tbody>
                {dexes?.map((dex: any) => (
                  <tr key={dex.id}>
                    <td className="font-medium">{dex.name}</td>
                    <td>
                      <Badge>{dex.dex_type || 'v2'}</Badge>
                    </td>
                    <td className="font-mono">{dex.fee_bps / 100}%</td>
                    <td className="font-mono">{dex.max_slippage_bps / 100}%</td>
                    <td>
                      <button
                        className={clsx(
                          'w-10 h-5 rounded-full transition-colors relative',
                          dex.is_enabled
                            ? 'bg-matrix-success'
                            : 'bg-matrix-border'
                        )}
                      >
                        <span
                          className={clsx(
                            'absolute w-4 h-4 rounded-full bg-white top-0.5 transition-transform',
                            dex.is_enabled ? 'translate-x-5' : 'translate-x-0.5'
                          )}
                        />
                      </button>
                    </td>
                  </tr>
                )) || (
                  <tr>
                    <td colSpan={5} className="text-center py-4 text-matrix-text-muted">
                      No DEXes configured
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Token Pairs */}
      <Card padding="none">
        <div className="p-4 border-b border-matrix-border">
          <CardHeader
            title="Enabled Tokens"
            subtitle="Tokens available for arbitrage"
          />
        </div>
        <div className="p-4">
          <div className="flex flex-wrap gap-2">
            {tokens?.map((token: any) => (
              <button
                key={token.id}
                className={clsx(
                  'px-3 py-2 rounded-lg border transition-all flex items-center gap-2',
                  token.is_enabled
                    ? 'bg-matrix-primary/10 border-matrix-primary text-matrix-primary'
                    : 'bg-matrix-bg border-matrix-border text-matrix-text-muted hover:border-matrix-primary/50'
                )}
              >
                <span className="font-medium">{token.symbol}</span>
                <span className="text-xs opacity-75">{token.name}</span>
              </button>
            )) || (
              <span className="text-matrix-text-muted">No tokens configured</span>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
