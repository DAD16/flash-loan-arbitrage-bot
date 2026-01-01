import { ReactNode } from 'react';
import clsx from 'clsx';

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export default function Card({
  children,
  className,
  hover = false,
  padding = 'md',
}: CardProps) {
  const paddingClasses = {
    none: '',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
  };

  return (
    <div
      className={clsx(
        'bg-matrix-surface border border-matrix-border rounded-lg',
        paddingClasses[padding],
        hover && 'card-hover cursor-pointer',
        className
      )}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function CardHeader({ title, subtitle, action }: CardHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h3 className="text-lg font-semibold text-matrix-text">{title}</h3>
        {subtitle && (
          <p className="text-sm text-matrix-text-muted">{subtitle}</p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
