import { create } from 'zustand';

export type Chain = 'bsc' | 'ethereum' | 'arbitrum' | 'optimism' | 'base';

interface AppState {
  // Chain selection
  selectedChain: Chain;
  setSelectedChain: (chain: Chain) => void;

  // Sidebar state
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // Real-time updates
  autoRefresh: boolean;
  toggleAutoRefresh: () => void;

  // Notifications
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp'>) => void;
  dismissNotification: (id: string) => void;
}

interface Notification {
  id: string;
  type: 'success' | 'warning' | 'error' | 'info';
  title: string;
  message?: string;
  txHash?: string;
  chain?: string;
  timestamp: number;
}

export const useStore = create<AppState>((set) => ({
  // Chain selection - default to BSC
  selectedChain: 'bsc',
  setSelectedChain: (chain) => set({ selectedChain: chain }),

  // Sidebar - start expanded
  sidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  // Auto refresh - enabled by default
  autoRefresh: true,
  toggleAutoRefresh: () => set((state) => ({ autoRefresh: !state.autoRefresh })),

  // Notifications
  notifications: [],
  addNotification: (notification) =>
    set((state) => ({
      notifications: [
        ...state.notifications,
        {
          ...notification,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
        },
      ],
    })),
  dismissNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),
}));

export default useStore;
