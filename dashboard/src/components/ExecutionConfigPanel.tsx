import { useState } from 'react';
import {
  Settings,
  Shield,
  Clock,
  Zap,
  RefreshCw,
  AlertTriangle,
  Info,
} from 'lucide-react';
import Card, { CardHeader } from './ui/Card';
import Badge from './ui/Badge';
import clsx from 'clsx';

export type ExecutionMode = 'auto' | 'semi-auto' | 'manual' | 'simulation';

interface ExecutionConfig {
  // Execution mode
  executionMode: ExecutionMode;

  // MEV Protection
  flashbotsEnabled: boolean;
  privateMempoolEnabled: boolean;
  maxSlippageOverride: number | null;

  // Transaction settings
  nonceMode: 'auto' | 'manual';
  gasMultiplier: number;
  maxPendingTransactions: number;

  // Timing controls
  executionDelayMs: number;
  validityWindowMs: number;
  retryCount: number;
  retryBackoffMs: number;
}

interface ExecutionConfigPanelProps {
  config?: Partial<ExecutionConfig>;
  onConfigChange?: (config: ExecutionConfig) => void;
  className?: string;
}

const DEFAULT_CONFIG: ExecutionConfig = {
  executionMode: 'auto',
  flashbotsEnabled: false,
  privateMempoolEnabled: true,
  maxSlippageOverride: null,
  nonceMode: 'auto',
  gasMultiplier: 1.1,
  maxPendingTransactions: 3,
  executionDelayMs: 0,
  validityWindowMs: 30000,
  retryCount: 2,
  retryBackoffMs: 1000,
};

const EXECUTION_MODES: { id: ExecutionMode; label: string; description: string; icon: React.ReactNode }[] = [
  {
    id: 'auto',
    label: 'Auto-Execute',
    description: 'Fully automated trading',
    icon: <Zap className="w-4 h-4" />,
  },
  {
    id: 'semi-auto',
    label: 'Semi-Auto',
    description: 'Auto-detect, manual approve',
    icon: <RefreshCw className="w-4 h-4" />,
  },
  {
    id: 'manual',
    label: 'Manual',
    description: 'Manual trigger only',
    icon: <Settings className="w-4 h-4" />,
  },
  {
    id: 'simulation',
    label: 'Simulation',
    description: 'Dry-run mode (no real txs)',
    icon: <AlertTriangle className="w-4 h-4" />,
  },
];

export default function ExecutionConfigPanel({
  config: initialConfig,
  onConfigChange,
  className,
}: ExecutionConfigPanelProps) {
  const [config, setConfig] = useState<ExecutionConfig>({
    ...DEFAULT_CONFIG,
    ...initialConfig,
  });

  const updateConfig = (updates: Partial<ExecutionConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    onConfigChange?.(newConfig);
  };

  return (
    <div className={clsx('space-y-6', className)}>
      {/* Execution Mode Card */}
      <Card>
        <CardHeader
          title="Execution Mode"
          subtitle="Control how opportunities are executed"
          action={
            <Badge variant={config.executionMode === 'simulation' ? 'warning' : 'success'}>
              {config.executionMode === 'simulation' ? 'DRY RUN' : 'LIVE'}
            </Badge>
          }
        />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {EXECUTION_MODES.map((mode) => (
            <button
              key={mode.id}
              onClick={() => updateConfig({ executionMode: mode.id })}
              className={clsx(
                'p-4 rounded-lg border-2 transition-all text-left',
                config.executionMode === mode.id
                  ? 'border-matrix-primary bg-matrix-primary/10'
                  : 'border-matrix-border hover:border-matrix-primary/50 bg-matrix-bg'
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={clsx(
                    config.executionMode === mode.id
                      ? 'text-matrix-primary'
                      : 'text-matrix-text-muted'
                  )}
                >
                  {mode.icon}
                </span>
                <span
                  className={clsx(
                    'font-medium',
                    config.executionMode === mode.id
                      ? 'text-matrix-primary'
                      : 'text-matrix-text'
                  )}
                >
                  {mode.label}
                </span>
              </div>
              <p className="text-xs text-matrix-text-muted">{mode.description}</p>
            </button>
          ))}
        </div>
        {config.executionMode === 'simulation' && (
          <div className="mt-4 p-3 bg-matrix-warning/10 border border-matrix-warning/30 rounded-lg">
            <div className="flex items-center gap-2 text-matrix-warning text-sm">
              <AlertTriangle className="w-4 h-4" />
              <span>Simulation mode - No real transactions will be sent</span>
            </div>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* MEV Protection Card */}
        <Card>
          <CardHeader
            title="MEV Protection"
            subtitle="Protect against front-running"
            action={<Shield className="w-5 h-5 text-matrix-primary" />}
          />
          <div className="space-y-4">
            {/* Flashbots Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-matrix-text">
                    Flashbots Bundle
                  </span>
                  <Badge variant="info" size="sm">ETH</Badge>
                </div>
                <p className="text-xs text-matrix-text-muted mt-1">
                  Use Flashbots on Ethereum mainnet
                </p>
              </div>
              <ToggleSwitch
                enabled={config.flashbotsEnabled}
                onChange={(enabled) => updateConfig({ flashbotsEnabled: enabled })}
              />
            </div>

            {/* Private Mempool Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-matrix-text">
                    Private Mempool
                  </span>
                  <Badge variant="warning" size="sm">BSC</Badge>
                </div>
                <p className="text-xs text-matrix-text-muted mt-1">
                  Submit to private RPC on BSC
                </p>
              </div>
              <ToggleSwitch
                enabled={config.privateMempoolEnabled}
                onChange={(enabled) => updateConfig({ privateMempoolEnabled: enabled })}
              />
            </div>

            {/* Max Slippage Override */}
            <div>
              <label className="block text-sm text-matrix-text-muted mb-2">
                Max Slippage Override (%)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="50"
                  value={config.maxSlippageOverride ?? ''}
                  placeholder="Auto"
                  onChange={(e) =>
                    updateConfig({
                      maxSlippageOverride: e.target.value
                        ? parseFloat(e.target.value)
                        : null,
                    })
                  }
                  className="flex-1 font-mono"
                />
                <button
                  onClick={() => updateConfig({ maxSlippageOverride: null })}
                  className="px-3 py-2 text-xs bg-matrix-surface-hover rounded text-matrix-text-muted hover:text-matrix-text"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>
        </Card>

        {/* Transaction Settings Card */}
        <Card>
          <CardHeader
            title="Transaction Settings"
            subtitle="Nonce and gas configuration"
            action={<Settings className="w-5 h-5 text-blue-400" />}
          />
          <div className="space-y-4">
            {/* Nonce Mode */}
            <div>
              <label className="block text-sm text-matrix-text-muted mb-2">
                Nonce Management
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => updateConfig({ nonceMode: 'auto' })}
                  className={clsx(
                    'flex-1 px-3 py-2 rounded text-sm font-medium transition-colors',
                    config.nonceMode === 'auto'
                      ? 'bg-matrix-primary/20 text-matrix-primary border border-matrix-primary'
                      : 'bg-matrix-surface border border-matrix-border text-matrix-text-muted hover:text-matrix-text'
                  )}
                >
                  Auto
                </button>
                <button
                  onClick={() => updateConfig({ nonceMode: 'manual' })}
                  className={clsx(
                    'flex-1 px-3 py-2 rounded text-sm font-medium transition-colors',
                    config.nonceMode === 'manual'
                      ? 'bg-matrix-primary/20 text-matrix-primary border border-matrix-primary'
                      : 'bg-matrix-surface border border-matrix-border text-matrix-text-muted hover:text-matrix-text'
                  )}
                >
                  Manual
                </button>
              </div>
            </div>

            {/* Gas Multiplier */}
            <div>
              <label className="block text-sm text-matrix-text-muted mb-2">
                Gas Estimation Multiplier
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="1"
                  max="2"
                  step="0.05"
                  value={config.gasMultiplier}
                  onChange={(e) =>
                    updateConfig({ gasMultiplier: parseFloat(e.target.value) })
                  }
                  className="flex-1 accent-matrix-primary"
                />
                <span className="w-16 text-right font-mono text-matrix-primary">
                  {config.gasMultiplier.toFixed(2)}x
                </span>
              </div>
            </div>

            {/* Max Pending Transactions */}
            <div>
              <label className="block text-sm text-matrix-text-muted mb-2">
                Max Pending Transactions
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={config.maxPendingTransactions}
                onChange={(e) =>
                  updateConfig({
                    maxPendingTransactions: parseInt(e.target.value) || 1,
                  })
                }
                className="w-full font-mono"
              />
              <p className="text-xs text-matrix-text-muted mt-1">
                Queue limit before pausing new executions
              </p>
            </div>
          </div>
        </Card>

        {/* Timing Controls Card */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Timing Controls"
            subtitle="Execution timing and retry settings"
            action={<Clock className="w-5 h-5 text-matrix-warning" />}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Execution Delay */}
            <div>
              <label className="block text-sm text-matrix-text-muted mb-2">
                Execution Delay (ms)
              </label>
              <input
                type="number"
                min="0"
                max="10000"
                step="100"
                value={config.executionDelayMs}
                onChange={(e) =>
                  updateConfig({ executionDelayMs: parseInt(e.target.value) || 0 })
                }
                className="w-full font-mono"
              />
              <p className="text-xs text-matrix-text-muted mt-1">
                Delay before execution
              </p>
            </div>

            {/* Validity Window */}
            <div>
              <label className="block text-sm text-matrix-text-muted mb-2">
                Validity Window (ms)
              </label>
              <input
                type="number"
                min="1000"
                max="120000"
                step="1000"
                value={config.validityWindowMs}
                onChange={(e) =>
                  updateConfig({
                    validityWindowMs: parseInt(e.target.value) || 30000,
                  })
                }
                className="w-full font-mono"
              />
              <p className="text-xs text-matrix-text-muted mt-1">
                How long opportunity stays valid
              </p>
            </div>

            {/* Retry Count */}
            <div>
              <label className="block text-sm text-matrix-text-muted mb-2">
                Retry Count
              </label>
              <input
                type="number"
                min="0"
                max="10"
                value={config.retryCount}
                onChange={(e) =>
                  updateConfig({ retryCount: parseInt(e.target.value) || 0 })
                }
                className="w-full font-mono"
              />
              <p className="text-xs text-matrix-text-muted mt-1">
                Retries on failure
              </p>
            </div>

            {/* Retry Backoff */}
            <div>
              <label className="block text-sm text-matrix-text-muted mb-2">
                Retry Backoff (ms)
              </label>
              <input
                type="number"
                min="100"
                max="10000"
                step="100"
                value={config.retryBackoffMs}
                onChange={(e) =>
                  updateConfig({
                    retryBackoffMs: parseInt(e.target.value) || 1000,
                  })
                }
                className="w-full font-mono"
              />
              <p className="text-xs text-matrix-text-muted mt-1">
                Wait between retries
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Configuration Summary */}
      <Card className="bg-matrix-bg border-matrix-primary/30">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-matrix-primary mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-medium text-matrix-text mb-2">
              Configuration Summary
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-matrix-text-muted">Mode:</span>
                <span className="ml-2 text-matrix-text font-medium">
                  {EXECUTION_MODES.find((m) => m.id === config.executionMode)?.label}
                </span>
              </div>
              <div>
                <span className="text-matrix-text-muted">MEV Protection:</span>
                <span className="ml-2 text-matrix-text font-medium">
                  {config.flashbotsEnabled || config.privateMempoolEnabled
                    ? 'Enabled'
                    : 'Disabled'}
                </span>
              </div>
              <div>
                <span className="text-matrix-text-muted">Gas Multiplier:</span>
                <span className="ml-2 text-matrix-text font-medium">
                  {config.gasMultiplier.toFixed(2)}x
                </span>
              </div>
              <div>
                <span className="text-matrix-text-muted">Max Queue:</span>
                <span className="ml-2 text-matrix-text font-medium">
                  {config.maxPendingTransactions} txs
                </span>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

// Toggle Switch Component
function ToggleSwitch({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={clsx(
        'w-11 h-6 rounded-full transition-colors relative',
        enabled ? 'bg-matrix-success' : 'bg-matrix-border'
      )}
    >
      <span
        className={clsx(
          'absolute w-5 h-5 rounded-full bg-white top-0.5 transition-transform',
          enabled ? 'translate-x-5' : 'translate-x-0.5'
        )}
      />
    </button>
  );
}

export type { ExecutionConfig };
