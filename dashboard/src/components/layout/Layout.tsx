import { ReactNode } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import { useStore } from '../../store/useStore';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const sidebarCollapsed = useStore((state) => state.sidebarCollapsed);

  return (
    <div className="flex h-screen bg-matrix-bg">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div
        className={`flex-1 flex flex-col transition-all duration-300 ${
          sidebarCollapsed ? 'ml-16' : 'ml-64'
        }`}
      >
        {/* Header */}
        <Header />

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
