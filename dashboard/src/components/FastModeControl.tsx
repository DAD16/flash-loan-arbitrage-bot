/**
 * Fast Mode Control Component
 *
 * Prominent toggle for enabling/disabling Fast Execution Mode.
 * Shows real-time latency metrics and execution status.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Zap,
  ZapOff,
  AlertTriangle,
  Activity,
  Clock,
  Settings,
  Shield,
} from 'lucide-react';
import clsx from 'clsx';
import { useFastMode, type FastModeConfig } from '../hooks/useWebSocket';
import { useStore } from '../store/useStore';

interface FastModeControlProps {
  compact?: boolean;
}

export default function FastModeControl({ compact = false }: FastModeControlProps) {
  const { addNotification } = useStore();
  const { connected, config, latency, enable, disable, setConfig } = useFastMode();
  const [showSettings, setShowSettings] = useState(false);
  const [localConfig, setLocalConfig] = useState<Partial<FastModeConfig>>({});

  // Sync local config with server config
  useEffect(() => {
    if (config) {
      setLocalConfig(config);
    }
  }, [config]);

  const handleToggle = useCallback(() => {
    if (config?.enabled) {
      disable();
      addNotification({
        type: 'warning',
        title: 'Fast Mode Disabled',
        message: 'Automated execution stopped',
      });
    } else {
      enable(localConfig.autoExecute ?? false);
      addNotification({
        type: 'success',
        title: 'Fast Mode Enabled',
        message: localConfig.autoExecute
          ? 'Auto-execution active - monitoring for opportunities'
          : 'Manual execution mode - faster price updates',
      });
    }
  }, [config, localConfig, enable, disable, addNotification]);

  const handleSaveSettings = useCallback(() => {
    setConfig(localConfig);
    setShowSettings(false);
    addNotification({
      type: 'info',
      title: 'Settings Updated',
      message: 'Fast Mode configuration saved',
    });
  }, [localConfig, setConfig, addNotification]);

  const isEnabled = config?.enabled ?? false;
  const isAutoExecute = config?.autoExecute ?? false;

  if (compact) {
    return (
      <button
        onClick={handleToggle}
        disabled={!connected}
        className={clsx(
          'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all',
          isEnabled
            ? isAutoExecute
              ? 'bg-red-500/30 text-red-400 border-2 border-red-500 animate-pulse'
              : 'bg-yellow-500/30 text-yellow-400 border border-yellow-500'
            : 'bg-matrix-surface text-matrix-text-muted hover:text-matrix-text border border-matrix-border',
          !connected && 'opacity-50 cursor-not-allowed'
        )}
      >
        {isEnabled ? (
          <>
            <Zap className="w-4 h-4" />
            Fast Mode {isAutoExecute ? '(AUTO)' : ''}
          </>
        ) : (
          <>
            <ZapOff className="w-4 h-4" />
            Fast Mode
          </>
        )}
      </button>
    );
  }

  return (
    <div className={clsx(
      'rounded-lg border p-4',
      isEnabled
        ? isAutoExecute
          ? 'bg-red-500/10 border-red-500'
          : 'bg-yellow-500/10 border-yellow-500'
        : 'bg-matrix-surface border-matrix-border'
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {isEnabled ? (
            <div className={clsx(
              'p-2 rounded-lg',
              isAutoExecute ? 'bg-red-500/20' : 'bg-yellow-500/20'
            )}>
              <Zap className={clsx(
                'w-6 h-6',
                isAutoExecute ? 'text-red-400 animate-pulse' : 'text-yellow-400'
              )} />
            </div>
          ) : (
            <div className="p-2 rounded-lg bg-matrix-bg">
              <ZapOff className="w-6 h-6 text-matrix-text-muted" />
            </div>
          )}
          <div>
            <h3 className="text-lg font-semibold text-matrix-text">
              Fast Mode
            </h3>
            <p className={clsx(
              'text-sm',
              isEnabled
                ? isAutoExecute
                  ? 'text-red-400'
                  : 'text-yellow-400'
                : 'text-matrix-text-muted'
            )}>
              {isEnabled
                ? isAutoExecute
                  ? 'AUTO-EXECUTE ACTIVE'
                  : 'Manual execution mode'
                : 'Disabled - using standard polling'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-lg bg-matrix-bg hover:bg-matrix-surface-hover transition-colors"
          >
            <Settings className="w-5 h-5 text-matrix-text-muted" />
          </button>

          {/* Main Toggle */}
          <button
            onClick={handleToggle}
            disabled={!connected}
            className={clsx(
              'px-6 py-2 rounded-lg font-semibold transition-all',
              isEnabled
                ? 'bg-red-500 text-white hover:bg-red-600'
                : 'bg-matrix-primary text-black hover:bg-matrix-primary/80',
              !connected && 'opacity-50 cursor-not-allowed'
            )}
          >
            {isEnabled ? 'STOP' : 'ENABLE'}
          </button>
        </div>
      </div>

      {/* Latency Metrics */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="p-3 rounded-lg bg-matrix-bg">
          <div className="flex items-center gap-2 text-matrix-text-muted text-sm mb-1">
            <Clock className="w-4 h-4" />
            RPC Latency
          </div>
          <p className="text-xl font-mono text-matrix-text">
            {latency?.rpcLatencyMs ?? '--'}
            <span className="text-sm text-matrix-text-muted ml-1">ms</span>
          </p>
        </div>

        <div className="p-3 rounded-lg bg-matrix-bg">
          <div className="flex items-center gap-2 text-matrix-text-muted text-sm mb-1">
            <Activity className="w-4 h-4" />
            Process Time
          </div>
          <p className="text-xl font-mono text-matrix-text">
            {latency?.processLatencyMs ?? '--'}
            <span className="text-sm text-matrix-text-muted ml-1">ms</span>
          </p>
        </div>

        <div className="p-3 rounded-lg bg-matrix-bg">
          <div className="flex items-center gap-2 text-matrix-text-muted text-sm mb-1">
            <Zap className="w-4 h-4" />
            Total Latency
          </div>
          <p className={clsx(
            'text-xl font-mono',
            (latency?.totalLatencyMs ?? 0) < 200
              ? 'text-green-400'
              : (latency?.totalLatencyMs ?? 0) < 500
                ? 'text-yellow-400'
                : 'text-red-400'
          )}>
            {latency?.totalLatencyMs ?? '--'}
            <span className="text-sm text-matrix-text-muted ml-1">ms</span>
          </p>
        </div>
      </div>

      {/* Warning for Auto-Execute */}
      {isEnabled && isAutoExecute && (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/20 border border-red-500/50 mb-4">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-red-400 font-semibold">Auto-Execute Active</p>
            <p className="text-red-300/80">
              Trades will execute automatically when opportunities exceed{' '}
              {(config?.minProfitThresholdBps ?? 50) / 100}% profit threshold.
            </p>
          </div>
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <div className="border-t border-matrix-border pt-4 mt-4 space-y-4">
          <h4 className="font-semibold text-matrix-text flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Configuration
          </h4>

          <div className="grid grid-cols-2 gap-4">
            {/* Auto Execute Toggle */}
            <div className="p-3 rounded-lg bg-matrix-bg">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-matrix-text">Auto-Execute</span>
                <input
                  type="checkbox"
                  checked={localConfig.autoExecute ?? false}
                  onChange={(e) => setLocalConfig((prev) => ({ ...prev, autoExecute: e.target.checked }))}
                  className="w-5 h-5 rounded accent-matrix-primary"
                />
              </label>
              <p className="text-xs text-matrix-text-muted mt-1">
                Execute trades without confirmation
              </p>
            </div>

            {/* Private Mempool */}
            <div className="p-3 rounded-lg bg-matrix-bg">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-matrix-text flex items-center gap-1">
                  <Shield className="w-3 h-3" />
                  Private Mempool
                </span>
                <input
                  type="checkbox"
                  checked={localConfig.usePrivateMempool ?? false}
                  onChange={(e) => setLocalConfig((prev) => ({ ...prev, usePrivateMempool: e.target.checked }))}
                  className="w-5 h-5 rounded accent-matrix-primary"
                />
              </label>
              <p className="text-xs text-matrix-text-muted mt-1">
                MEV protection via Flashbots
              </p>
            </div>

            {/* Min Profit Threshold */}
            <div className="p-3 rounded-lg bg-matrix-bg">
              <label className="text-sm text-matrix-text block mb-2">
                Min Profit (bps)
              </label>
              <input
                type="number"
                value={localConfig.minProfitThresholdBps ?? 50}
                onChange={(e) => setLocalConfig((prev) => ({ ...prev, minProfitThresholdBps: parseInt(e.target.value) }))}
                className="w-full p-2 rounded bg-matrix-surface border border-matrix-border text-matrix-text"
                min={0}
                step={10}
              />
              <p className="text-xs text-matrix-text-muted mt-1">
                {((localConfig.minProfitThresholdBps ?? 50) / 100).toFixed(2)}% minimum
              </p>
            </div>

            {/* Max Gas */}
            <div className="p-3 rounded-lg bg-matrix-bg">
              <label className="text-sm text-matrix-text block mb-2">
                Max Gas (gwei)
              </label>
              <input
                type="number"
                value={localConfig.maxGasGwei ?? 10}
                onChange={(e) => setLocalConfig((prev) => ({ ...prev, maxGasGwei: parseInt(e.target.value) }))}
                className="w-full p-2 rounded bg-matrix-surface border border-matrix-border text-matrix-text"
                min={1}
              />
            </div>

            {/* Max Slippage */}
            <div className="p-3 rounded-lg bg-matrix-bg">
              <label className="text-sm text-matrix-text block mb-2">
                Max Slippage (bps)
              </label>
              <input
                type="number"
                value={localConfig.maxSlippageBps ?? 100}
                onChange={(e) => setLocalConfig((prev) => ({ ...prev, maxSlippageBps: parseInt(e.target.value) }))}
                className="w-full p-2 rounded bg-matrix-surface border border-matrix-border text-matrix-text"
                min={0}
                step={10}
              />
              <p className="text-xs text-matrix-text-muted mt-1">
                {((localConfig.maxSlippageBps ?? 100) / 100).toFixed(2)}% max
              </p>
            </div>

            {/* Cooldown */}
            <div className="p-3 rounded-lg bg-matrix-bg">
              <label className="text-sm text-matrix-text block mb-2">
                Cooldown (ms)
              </label>
              <input
                type="number"
                value={localConfig.cooldownMs ?? 5000}
                onChange={(e) => setLocalConfig((prev) => ({ ...prev, cooldownMs: parseInt(e.target.value) }))}
                className="w-full p-2 rounded bg-matrix-surface border border-matrix-border text-matrix-text"
                min={0}
                step={1000}
              />
              <p className="text-xs text-matrix-text-muted mt-1">
                {((localConfig.cooldownMs ?? 5000) / 1000).toFixed(1)}s between trades
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowSettings(false)}
              className="px-4 py-2 rounded-lg bg-matrix-bg text-matrix-text-muted hover:text-matrix-text transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveSettings}
              className="px-4 py-2 rounded-lg bg-matrix-primary text-black font-medium hover:bg-matrix-primary/80 transition-colors"
            >
              Save Settings
            </button>
          </div>
        </div>
      )}

      {/* Connection Status */}
      <div className="flex items-center justify-between text-sm text-matrix-text-muted pt-2 border-t border-matrix-border mt-4">
        <div className="flex items-center gap-2">
          <div className={clsx(
            'w-2 h-2 rounded-full',
            connected ? 'bg-green-500' : 'bg-red-500'
          )} />
          <span>WebSocket {connected ? 'connected' : 'disconnected'}</span>
        </div>
        <span>ws://localhost:9082</span>
      </div>
    </div>
  );
}
