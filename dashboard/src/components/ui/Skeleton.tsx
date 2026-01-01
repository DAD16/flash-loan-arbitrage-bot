import clsx from 'clsx';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'rectangular' | 'circular';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'wave' | 'none';
}

export default function Skeleton({
  className,
  variant = 'rectangular',
  width,
  height,
  animation = 'pulse',
}: SkeletonProps) {
  const variantClasses = {
    text: 'rounded',
    rectangular: 'rounded-lg',
    circular: 'rounded-full',
  };

  const animationClasses = {
    pulse: 'animate-pulse',
    wave: 'animate-pulse',
    none: '',
  };

  return (
    <div
      className={clsx(
        'bg-matrix-surface-hover',
        variantClasses[variant],
        animationClasses[animation],
        className
      )}
      style={{
        width: width,
        height: height,
      }}
    />
  );
}

// Skeleton for a card
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={clsx(
        'bg-matrix-surface border border-matrix-border rounded-lg p-4',
        className
      )}
    >
      <Skeleton variant="text" className="h-4 w-1/3 mb-2" />
      <Skeleton variant="text" className="h-8 w-1/2 mb-4" />
      <Skeleton variant="text" className="h-3 w-full" />
    </div>
  );
}

// Skeleton for a table row
export function TableRowSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <tr>
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="py-3 px-4">
          <Skeleton variant="text" className="h-4 w-full" />
        </td>
      ))}
    </tr>
  );
}

// Skeleton for a stat card
export function StatCardSkeleton() {
  return (
    <div className="bg-matrix-surface border border-matrix-border rounded-lg p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <Skeleton variant="text" className="h-3 w-20 mb-2" />
          <Skeleton variant="text" className="h-6 w-32 mb-2" />
          <Skeleton variant="text" className="h-3 w-24" />
        </div>
        <Skeleton variant="circular" width={40} height={40} />
      </div>
    </div>
  );
}
