import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Zap,
  Settings,
  Brain,
  History,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import clsx from 'clsx';

const navItems = [
  { path: '/overview', icon: LayoutDashboard, label: 'Overview' },
  { path: '/prices', icon: TrendingUp, label: 'Live Prices' },
  { path: '/wallets', icon: Wallet, label: 'Wallets' },
  { path: '/competitors', icon: Users, label: 'Competitors' },
  { path: '/opportunities', icon: Zap, label: 'Opportunities' },
  { path: '/strategy', icon: Settings, label: 'Strategy' },
  { path: '/ai-insights', icon: Brain, label: 'AI Insights' },
  { path: '/history', icon: History, label: 'History' },
];

export default function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useStore();

  return (
    <aside
      className={clsx(
        'fixed left-0 top-0 h-screen bg-matrix-surface border-r border-matrix-border',
        'flex flex-col transition-all duration-300 z-50',
        sidebarCollapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="h-16 flex items-center justify-center border-b border-matrix-border">
        {sidebarCollapsed ? (
          <span className="text-2xl font-bold text-matrix-primary matrix-glow">M</span>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-matrix-primary matrix-glow">MATRIX</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4">
        <ul className="space-y-1 px-2">
          {navItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200',
                    'hover:bg-matrix-surface-hover',
                    isActive
                      ? 'bg-matrix-primary/10 text-matrix-primary border-l-2 border-matrix-primary'
                      : 'text-matrix-text-muted hover:text-matrix-text'
                  )
                }
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {!sidebarCollapsed && (
                  <span className="font-medium">{item.label}</span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Agent Status Indicator */}
      {!sidebarCollapsed && (
        <div className="px-4 py-3 border-t border-matrix-border">
          <div className="flex items-center gap-2 text-sm">
            <div className="status-dot success" />
            <span className="text-matrix-text-muted">System Online</span>
          </div>
          <div className="mt-2 text-xs text-matrix-text-muted">
            21 Agents Active
          </div>
        </div>
      )}

      {/* Collapse Toggle */}
      <button
        onClick={toggleSidebar}
        className={clsx(
          'absolute -right-3 top-20 w-6 h-6 rounded-full',
          'bg-matrix-surface border border-matrix-border',
          'flex items-center justify-center',
          'hover:bg-matrix-surface-hover hover:border-matrix-primary',
          'transition-all duration-200'
        )}
      >
        {sidebarCollapsed ? (
          <ChevronRight className="w-4 h-4 text-matrix-text-muted" />
        ) : (
          <ChevronLeft className="w-4 h-4 text-matrix-text-muted" />
        )}
      </button>
    </aside>
  );
}
