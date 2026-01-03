import { useState } from 'react';
import { Copy, Check, Zap, ArrowRightLeft, Layers } from 'lucide-react';
import Badge from './Badge';
import clsx from 'clsx';

export type CallType = 'router' | 'direct' | 'hybrid';

interface DirectPoolIndicatorProps {
  callType: CallType;
  poolAddress?: string;
  poolType?: 'UniV2' | 'UniV3' | 'PancakeV2' | 'PancakeV3' | 'Curve' | 'Balancer' | 'DODO' | string;
  gasEstimateDirect?: number;
  gasEstimateRouter?: number;
  showDetails?: boolean;
  chain?: string;
  className?: string;
}

// Call type badge component for table use
export function CallTypeBadge({ callType }: { callType: CallType }) {
  const config: Record<CallType, { label: string; variant: 'success' | 'warning' | 'info'; icon: React.ReactNode }> = {
    direct: {
      label: 'Direct Pool',
      variant: 'success',
      icon: <Zap className="w-3 h-3" />,
    },
    router: {
      label: 'Router',
      variant: 'warning',
      icon: <ArrowRightLeft className="w-3 h-3" />,
    },
    hybrid: {
      label: 'Hybrid',
      variant: 'info',
      icon: <Layers className="w-3 h-3" />,
    },
  };

  const { label, variant, icon } = config[callType] || config.router;

  return (
    <Badge variant={variant}>
      <span className="flex items-center gap-1">
        {icon}
        {label}
      </span>
    </Badge>
  );
}

// Gas savings indicator
export function GasSavingsIndicator({
  gasEstimateDirect,
  gasEstimateRouter,
  className,
}: {
  gasEstimateDirect?: number;
  gasEstimateRouter?: number;
  className?: string;
}) {
  if (!gasEstimateDirect || !gasEstimateRouter || gasEstimateDirect >= gasEstimateRouter) {
    return null;
  }

  const savingsGas = gasEstimateRouter - gasEstimateDirect;
  const savingsPercent = ((savingsGas / gasEstimateRouter) * 100).toFixed(1);
  // Estimate savings in native token (assuming ~5 gwei gas price as baseline)
  const savingsNative = (savingsGas * 5 / 1e9).toFixed(6);

  return (
    <div className={clsx('flex items-center gap-1 text-xs text-matrix-success', className)}>
      <Zap className="w-3 h-3" />
      <span className="font-mono">-{savingsPercent}% gas</span>
      <span className="text-matrix-text-muted">({savingsNative} native)</span>
    </div>
  );
}

export default function DirectPoolIndicator({
  callType,
  poolAddress,
  poolType,
  gasEstimateDirect,
  gasEstimateRouter,
  showDetails = true,
  chain = 'bsc',
  className,
}: DirectPoolIndicatorProps) {
  const [copied, setCopied] = useState(false);

  const explorerUrls: Record<string, string> = {
    bsc: 'https://bscscan.com/address/',
    ethereum: 'https://etherscan.io/address/',
    arbitrum: 'https://arbiscan.io/address/',
    optimism: 'https://optimistic.etherscan.io/address/',
    base: 'https://basescan.org/address/',
  };

  const handleCopy = async () => {
    if (!poolAddress) return;
    await navigator.clipboard.writeText(poolAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const truncatedAddress = poolAddress
    ? `${poolAddress.slice(0, 6)}...${poolAddress.slice(-4)}`
    : null;

  const explorerUrl = poolAddress
    ? (explorerUrls[chain] || explorerUrls.bsc) + poolAddress
    : null;

  const gasSavings = gasEstimateDirect && gasEstimateRouter && gasEstimateDirect < gasEstimateRouter
    ? gasEstimateRouter - gasEstimateDirect
    : null;

  const gasSavingsPercent = gasSavings && gasEstimateRouter
    ? ((gasSavings / gasEstimateRouter) * 100).toFixed(1)
    : null;

  return (
    <div className={clsx('space-y-2', className)}>
      {/* Call Type Badge */}
      <div className="flex items-center gap-2">
        <CallTypeBadge callType={callType} />
        {poolType && (
          <span className="text-xs text-matrix-text-muted">({poolType})</span>
        )}
      </div>

      {/* Pool Address (if direct or hybrid) */}
      {showDetails && poolAddress && (callType === 'direct' || callType === 'hybrid') && (
        <div className="flex items-center gap-2 p-2 bg-matrix-bg rounded-lg border border-matrix-border">
          <span className="text-xs text-matrix-text-muted">Pool:</span>
          <a
            href={explorerUrl || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            {truncatedAddress}
          </a>
          <button
            onClick={handleCopy}
            className="p-1 hover:bg-matrix-surface-hover rounded transition-colors ml-auto"
            title="Copy pool address"
          >
            {copied ? (
              <Check className="w-3 h-3 text-matrix-success" />
            ) : (
              <Copy className="w-3 h-3 text-matrix-text-muted" />
            )}
          </button>
        </div>
      )}

      {/* Gas Comparison */}
      {showDetails && gasEstimateDirect && gasEstimateRouter && (
        <div className="p-2 bg-matrix-bg rounded-lg border border-matrix-border space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-matrix-text-muted">Direct Gas:</span>
            <span className="font-mono text-matrix-success">
              {gasEstimateDirect.toLocaleString()} gas
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-matrix-text-muted">Router Gas:</span>
            <span className="font-mono text-matrix-warning">
              {gasEstimateRouter.toLocaleString()} gas
            </span>
          </div>
          {gasSavings && (
            <div className="flex items-center justify-between text-xs pt-1 border-t border-matrix-border">
              <span className="text-matrix-text-muted">Savings:</span>
              <span className="font-mono text-matrix-success flex items-center gap-1">
                <Zap className="w-3 h-3" />
                -{gasSavings.toLocaleString()} ({gasSavingsPercent}%)
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
