import { useEffect } from 'react';
import { X, CheckCircle, AlertTriangle, XCircle, Info, ExternalLink } from 'lucide-react';
import { useStore } from '../../store/useStore';
import clsx from 'clsx';

const iconMap = {
  success: CheckCircle,
  warning: AlertTriangle,
  error: XCircle,
  info: Info,
};

const colorMap = {
  success: 'border-matrix-success bg-matrix-success/10 text-matrix-success',
  warning: 'border-matrix-warning bg-matrix-warning/10 text-matrix-warning',
  error: 'border-matrix-danger bg-matrix-danger/10 text-matrix-danger',
  info: 'border-matrix-primary bg-matrix-primary/10 text-matrix-primary',
};

const explorerUrls: Record<string, string> = {
  bsc: 'https://bscscan.com/tx/',
  ethereum: 'https://etherscan.io/tx/',
  arbitrum: 'https://arbiscan.io/tx/',
  optimism: 'https://optimistic.etherscan.io/tx/',
  base: 'https://basescan.org/tx/',
};

export default function Toast() {
  const notifications = useStore((state) => state.notifications);
  const dismissNotification = useStore((state) => state.dismissNotification);

  // Auto-dismiss notifications after 5 seconds
  useEffect(() => {
    const timers = notifications.map((notification) => {
      return setTimeout(() => {
        dismissNotification(notification.id);
      }, 5000);
    });

    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [notifications, dismissNotification]);

  if (notifications.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-md">
      {notifications.map((notification) => {
        const Icon = iconMap[notification.type];
        return (
          <div
            key={notification.id}
            className={clsx(
              'flex items-start gap-3 p-4 rounded-lg border shadow-lg backdrop-blur-sm animate-slide-in',
              colorMap[notification.type]
            )}
          >
            <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-matrix-text">{notification.title}</h4>
              {notification.message && (
                <p className="text-sm text-matrix-text-muted mt-1">
                  {notification.message}
                </p>
              )}
              {notification.txHash && (
                <a
                  href={`${explorerUrls[notification.chain || 'bsc']}${notification.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-matrix-primary hover:underline mt-2"
                >
                  <span className="font-mono">
                    {notification.txHash.slice(0, 10)}...{notification.txHash.slice(-8)}
                  </span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            <button
              onClick={() => dismissNotification(notification.id)}
              className="text-matrix-text-muted hover:text-matrix-text transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
