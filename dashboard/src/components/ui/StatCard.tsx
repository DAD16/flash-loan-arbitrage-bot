import { ReactNode } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import clsx from 'clsx';
import Card from './Card';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  change?: number;
  icon?: ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger';
}

export default function StatCard({
  title,
  value,
  subtitle,
  change,
  icon,
  variant = 'default',
}: StatCardProps) {
  const variantClasses = {
    default: 'text-matrix-text',
    success: 'text-matrix-success',
    warning: 'text-matrix-warning',
    danger: 'text-matrix-danger',
  };

  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-matrix-text-muted">{title}</p>
          <p className={clsx('text-2xl font-bold font-mono mt-1', variantClasses[variant])}>
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-matrix-text-muted mt-1">{subtitle}</p>
          )}
          {change !== undefined && (
            <div
              className={clsx(
                'flex items-center gap-1 text-sm mt-2',
                change >= 0 ? 'text-matrix-success' : 'text-matrix-danger'
              )}
            >
              {change >= 0 ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              <span>{change >= 0 ? '+' : ''}{change}%</span>
              <span className="text-matrix-text-muted">vs yesterday</span>
            </div>
          )}
        </div>
        {icon && (
          <div className="p-2 bg-matrix-bg rounded-lg">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}
