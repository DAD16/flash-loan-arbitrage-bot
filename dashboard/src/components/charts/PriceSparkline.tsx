import { useMemo, memo } from 'react';
import {
  LineChart,
  Line,
  ResponsiveContainer,
  YAxis,
  ReferenceLine,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import clsx from 'clsx';

interface PricePoint {
  timestamp: number;
  price: number;
}

interface PriceSparklineProps {
  /** Array of price points (last 60 recommended) */
  data: PricePoint[];
  /** Width of the sparkline in pixels */
  width?: number;
  /** Height of the sparkline in pixels */
  height?: number;
  /** Show price direction indicator */
  showDirection?: boolean;
  /** Show percentage change */
  showChange?: boolean;
  /** Show tooltip on hover */
  showTooltip?: boolean;
  /** Callback when sparkline is clicked for expansion */
  onClick?: () => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * PriceSparkline - A compact sparkline chart showing recent price movement
 * Uses Recharts library for rendering
 */
function PriceSparkline({
  data,
  width = 120,
  height = 32,
  showDirection = true,
  showChange = true,
  onClick,
  className,
}: PriceSparklineProps) {
  // Calculate price statistics
  const stats = useMemo(() => {
    if (!data || data.length < 2) {
      return {
        direction: 'neutral' as const,
        changePercent: 0,
        min: 0,
        max: 0,
        current: 0,
        first: 0,
      };
    }

    const prices = data.map((d) => d.price);
    const first = prices[0];
    const current = prices[prices.length - 1];
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const changePercent = first !== 0 ? ((current - first) / first) * 100 : 0;

    let direction: 'up' | 'down' | 'neutral' = 'neutral';
    if (changePercent > 0.01) direction = 'up';
    else if (changePercent < -0.01) direction = 'down';

    return { direction, changePercent, min, max, current, first };
  }, [data]);

  // Determine line color based on direction
  const lineColor = useMemo(() => {
    switch (stats.direction) {
      case 'up':
        return '#00ff41'; // matrix-success
      case 'down':
        return '#ff4444'; // matrix-danger
      default:
        return '#888888'; // matrix-text-muted
    }
  }, [stats.direction]);

  // Reference line at the starting price
  const referencePrice = stats.first;

  // Normalized data for smoother visualization
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data.map((point, index) => ({
      index,
      price: point.price,
    }));
  }, [data]);

  // Direction icon component
  const DirectionIcon = () => {
    switch (stats.direction) {
      case 'up':
        return <TrendingUp className="w-3 h-3 text-matrix-success" />;
      case 'down':
        return <TrendingDown className="w-3 h-3 text-matrix-danger" />;
      default:
        return <Minus className="w-3 h-3 text-matrix-text-muted" />;
    }
  };

  // Handle empty or insufficient data
  if (!data || data.length < 2) {
    return (
      <div
        className={clsx(
          'flex items-center justify-center text-matrix-text-muted text-xs',
          className
        )}
        style={{ width, height }}
      >
        No data
      </div>
    );
  }

  return (
    <div
      className={clsx(
        'flex items-center gap-2',
        onClick && 'cursor-pointer hover:opacity-80 transition-opacity',
        className
      )}
      onClick={onClick}
      title={onClick ? 'Click to expand chart' : undefined}
    >
      {/* Sparkline Chart */}
      <div style={{ width, height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
            <YAxis
              domain={[stats.min * 0.999, stats.max * 1.001]}
              hide
            />
            <ReferenceLine
              y={referencePrice}
              stroke="#333333"
              strokeDasharray="2 2"
              strokeWidth={1}
            />
            <Line
              type="monotone"
              dataKey="price"
              stroke={lineColor}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Direction and Change Indicators */}
      {(showDirection || showChange) && (
        <div className="flex flex-col items-end min-w-[48px]">
          {showDirection && (
            <div className="flex items-center gap-1">
              <DirectionIcon />
            </div>
          )}
          {showChange && (
            <span
              className={clsx(
                'text-xs font-mono',
                stats.direction === 'up' && 'text-matrix-success',
                stats.direction === 'down' && 'text-matrix-danger',
                stats.direction === 'neutral' && 'text-matrix-text-muted'
              )}
            >
              {stats.changePercent >= 0 ? '+' : ''}
              {stats.changePercent.toFixed(2)}%
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// Memoize for performance in data tables
export default memo(PriceSparkline);

// Helper function to generate mock price data for testing
export function generateMockPriceData(
  basePrice: number,
  points: number = 60,
  volatility: number = 0.02
): PricePoint[] {
  const now = Date.now();
  const data: PricePoint[] = [];
  let currentPrice = basePrice;

  for (let i = 0; i < points; i++) {
    // Random walk with mean reversion
    const change = (Math.random() - 0.5) * 2 * volatility * basePrice;
    currentPrice = currentPrice + change;
    // Keep price positive
    currentPrice = Math.max(currentPrice, basePrice * 0.5);

    data.push({
      timestamp: now - (points - i) * 500, // 500ms intervals
      price: currentPrice,
    });
  }

  return data;
}

// Compact version for table cells
export const PriceSparklineMini = memo(function PriceSparklineMini({
  data,
  onClick,
}: {
  data: PricePoint[];
  onClick?: () => void;
}) {
  return (
    <PriceSparkline
      data={data}
      width={80}
      height={24}
      showDirection={true}
      showChange={true}
      onClick={onClick}
    />
  );
});

export type { PricePoint };
