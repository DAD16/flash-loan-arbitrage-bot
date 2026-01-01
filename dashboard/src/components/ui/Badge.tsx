import clsx from 'clsx';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  size?: 'sm' | 'md';
}

export default function Badge({
  children,
  variant = 'default',
  size = 'sm',
}: BadgeProps) {
  const variantClasses = {
    default: 'bg-matrix-border/50 text-matrix-text',
    success: 'bg-matrix-success/20 text-matrix-success',
    warning: 'bg-matrix-warning/20 text-matrix-warning',
    danger: 'bg-matrix-danger/20 text-matrix-danger',
    info: 'bg-blue-500/20 text-blue-400',
  };

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center rounded font-medium',
        variantClasses[variant],
        sizeClasses[size]
      )}
    >
      {children}
    </span>
  );
}

// Confidence Badge
export function ConfidenceBadge({
  confidence,
}: {
  confidence?: 'low' | 'medium' | 'high' | 'very_high' | string | null;
}) {
  const config: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' }> = {
    low: { label: 'Low', variant: 'default' },
    medium: { label: 'Medium', variant: 'warning' },
    high: { label: 'High', variant: 'success' },
    very_high: { label: 'Very High', variant: 'success' },
  };

  const safeConfidence = confidence || 'low';
  const { label, variant } = config[safeConfidence] || { label: 'Unknown', variant: 'default' };

  return (
    <Badge variant={variant}>
      {label}
    </Badge>
  );
}

// Status Badge
export function StatusBadge({
  status,
}: {
  status?: 'pending' | 'success' | 'failed' | 'reverted' | 'detected' | 'executing' | 'completed' | 'skipped' | string | null;
}) {
  const config: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' }> = {
    pending: { label: 'Pending', variant: 'warning' },
    success: { label: 'Success', variant: 'success' },
    failed: { label: 'Failed', variant: 'danger' },
    reverted: { label: 'Reverted', variant: 'danger' },
    detected: { label: 'Detected', variant: 'info' },
    executing: { label: 'Executing', variant: 'warning' },
    completed: { label: 'Completed', variant: 'success' },
    skipped: { label: 'Skipped', variant: 'default' },
  };

  const safeStatus = status || 'pending';
  const { label, variant } = config[safeStatus] || { label: String(safeStatus), variant: 'default' as const };

  return (
    <Badge variant={variant}>
      {label}
    </Badge>
  );
}

// Priority Badge
export function PriorityBadge({
  priority,
}: {
  priority?: 'info' | 'warning' | 'critical' | string | null;
}) {
  const config: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' }> = {
    info: { label: 'Info', variant: 'info' },
    warning: { label: 'Warning', variant: 'warning' },
    critical: { label: 'Critical', variant: 'danger' },
  };

  const safePriority = priority || 'info';
  const { label, variant } = config[safePriority] || { label: String(safePriority), variant: 'info' as const };

  return (
    <Badge variant={variant}>
      {label}
    </Badge>
  );
}
