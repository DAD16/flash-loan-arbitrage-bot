import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Wallet,
  Plus,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  Copy,
  Send,
  Activity,
  Database,
  Key,
  Shield,
} from 'lucide-react';
import clsx from 'clsx';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { StatusBadge } from '../components/ui/Badge';
import { useStore } from '../store/useStore';

// Types matching the KEYMAKER wallet manager
interface ManagedWallet {
  id: string;
  address: string;
  chain: number;
  role: 'master' | 'gas_reserve' | 'executor';
  label: string;
  derivationPath: string;
  createdAt: number;
  lastFundedAt: number | null;
  isActive: boolean;
}

interface WalletBalance {
  walletId: string;
  address: string;
  chain: number;
  balanceWei: string;
  balanceFormatted: string;
  symbol: string;
  updatedAt: number;
  isLow: boolean;
}

interface WalletAssignment {
  walletId: string;
  contractAddress: string;
  chain: number;
  authorizedAt: number;
  txHash: string;
}

interface FundingTransaction {
  id: string;
  fromWalletId: string;
  toWalletId: string;
  chain: number;
  amountWei: string;
  txHash: string;
  status: 'pending' | 'confirmed' | 'failed';
  createdAt: number;
  confirmedAt: number | null;
}

interface WalletSummary {
  totalWallets: number;
  byChain: Record<number, number>;
  byRole: Record<string, number>;
  lowBalanceCount: number;
  totalValueUsd: number;
}

interface WalletDetails {
  wallet: ManagedWallet;
  balance: WalletBalance | null;
  assignments: WalletAssignment[];
  fundingHistory: FundingTransaction[];
}

const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum',
  56: 'BSC',
  137: 'Polygon',
  42161: 'Arbitrum',
  10: 'Optimism',
  8453: 'Base',
  11155111: 'Sepolia',
};

const CHAIN_SYMBOLS: Record<number, string> = {
  1: 'ETH',
  56: 'BNB',
  137: 'MATIC',
  42161: 'ETH',
  10: 'ETH',
  8453: 'ETH',
  11155111: 'ETH',
};

const CHAIN_EXPLORERS: Record<number, string> = {
  1: 'https://etherscan.io',
  56: 'https://bscscan.com',
  137: 'https://polygonscan.com',
  42161: 'https://arbiscan.io',
  10: 'https://optimistic.etherscan.io',
  8453: 'https://basescan.org',
  11155111: 'https://sepolia.etherscan.io',
};

const API_BASE = 'http://localhost:9081';

export default function Wallets() {
  const { addNotification } = useStore();
  const [wallets, setWallets] = useState<ManagedWallet[]>([]);
  const [balances, setBalances] = useState<WalletBalance[]>([]);
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [selectedWallet, setSelectedWallet] = useState<WalletDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [funding, setFunding] = useState<string | null>(null);
  const [monitoringActive, setMonitoringActive] = useState(false);

  // Form state for generating new wallet
  const [newWalletChain, setNewWalletChain] = useState<number>(56);
  const [newWalletRole, setNewWalletRole] = useState<'executor' | 'gas_reserve'>('executor');
  const [newWalletLabel, setNewWalletLabel] = useState('');

  // Optimized: Single API call for all data
  const fetchAll = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/wallets/all`);
      const data = await response.json();
      if (data.success) {
        setWallets(data.data.wallets || []);
        setBalances(data.data.balances || []);
        setSummary(data.data.summary || null);
      }
    } catch (error) {
      console.error('Error fetching wallet data:', error);
    }
    setLoading(false);
  }, []);

  // Fallback individual fetches for refresh with fresh balances
  const fetchFreshBalances = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/wallets/balances?cached=false`);
      const data = await response.json();
      if (data.success) {
        setBalances(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching balances:', error);
    }
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    // Fetch fresh balances (bypass cache)
    await fetchFreshBalances();
    // Also refresh full data
    await fetchAll();
    setRefreshing(false);
    addNotification({
      type: 'success',
      title: 'Refreshed',
      message: 'Wallet data updated with fresh balances',
    });
  };

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const fetchWalletDetails = async (walletId: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/wallets/${walletId}`);
      const data = await response.json();
      if (data.success) {
        setSelectedWallet(data.data);
      }
    } catch (error) {
      console.error('Error fetching wallet details:', error);
    }
  };

  const handleGenerateWallet = async () => {
    setGenerating(true);
    try {
      const response = await fetch(`${API_BASE}/api/wallets/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chain: newWalletChain,
          role: newWalletRole,
          label: newWalletLabel || undefined,
        }),
      });
      const data = await response.json();

      if (data.success) {
        addNotification({
          type: 'success',
          title: 'Wallet Generated',
          message: `Created ${data.data.wallet.address.slice(0, 10)}...`,
        });
        setShowGenerateModal(false);
        setNewWalletLabel('');
        fetchAll();
      } else {
        addNotification({
          type: 'error',
          title: 'Generation Failed',
          message: data.error || 'Unknown error',
        });
      }
    } catch (error) {
      addNotification({
        type: 'error',
        title: 'Generation Failed',
        message: 'Could not connect to API',
      });
    }
    setGenerating(false);
  };

  const handleFundWallet = async (walletId: string) => {
    setFunding(walletId);
    try {
      const response = await fetch(`${API_BASE}/api/wallets/${walletId}/fund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json();

      if (data.success) {
        addNotification({
          type: 'success',
          title: 'Funding Initiated',
          message: `TX: ${data.data.txHash.slice(0, 16)}...`,
        });
        fetchFreshBalances();
      } else {
        addNotification({
          type: 'error',
          title: 'Funding Failed',
          message: data.error || 'Unknown error',
        });
      }
    } catch (error) {
      addNotification({
        type: 'error',
        title: 'Funding Failed',
        message: 'Could not connect to API',
      });
    }
    setFunding(null);
  };

  const handleAutoFund = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/wallets/auto-fund`, {
        method: 'POST',
      });
      const data = await response.json();

      if (data.success) {
        addNotification({
          type: 'success',
          title: 'Auto-Fund Complete',
          message: `${data.count} transactions submitted`,
        });
        fetchFreshBalances();
      } else {
        addNotification({
          type: 'error',
          title: 'Auto-Fund Failed',
          message: data.error || 'Unknown error',
        });
      }
    } catch (error) {
      addNotification({
        type: 'error',
        title: 'Auto-Fund Failed',
        message: 'Could not connect to API',
      });
    }
  };

  const handleToggleMonitoring = async () => {
    const endpoint = monitoringActive ? 'stop' : 'start';
    try {
      const response = await fetch(`${API_BASE}/api/wallets/monitoring/${endpoint}`, {
        method: 'POST',
      });
      const data = await response.json();

      if (data.success) {
        setMonitoringActive(!monitoringActive);
        addNotification({
          type: 'success',
          title: monitoringActive ? 'Monitoring Stopped' : 'Monitoring Started',
          message: data.message,
        });
      }
    } catch (error) {
      addNotification({
        type: 'error',
        title: 'Error',
        message: 'Could not toggle monitoring',
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    addNotification({
      type: 'info',
      title: 'Copied',
      message: 'Address copied to clipboard',
    });
  };

  // Use Map for O(1) balance lookups instead of O(n) array search
  const balanceMap = useMemo(() => {
    const map = new Map<string, WalletBalance>();
    for (const b of balances) {
      map.set(b.walletId, b);
    }
    return map;
  }, [balances]);

  const getBalanceForWallet = (walletId: string) => {
    return balanceMap.get(walletId);
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'master':
        return 'warning';
      case 'gas_reserve':
        return 'info';
      case 'executor':
        return 'success';
      default:
        return 'default';
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-matrix-surface rounded w-1/4" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-matrix-surface rounded" />
            ))}
          </div>
          <div className="h-96 bg-matrix-surface rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-matrix-text flex items-center gap-2">
            <Wallet className="w-6 h-6 text-matrix-primary" />
            Wallet Management
          </h1>
          <p className="text-matrix-text-muted mt-1">
            KEYMAKER - Multi-chain wallet management and auto-funding
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleToggleMonitoring}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors',
              monitoringActive
                ? 'bg-green-500/20 text-green-400'
                : 'bg-matrix-surface text-matrix-text-muted hover:text-matrix-text'
            )}
          >
            <Activity className={clsx('w-4 h-4', monitoringActive && 'animate-pulse')} />
            {monitoringActive ? 'Monitoring' : 'Start Monitor'}
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 rounded-lg bg-matrix-surface hover:bg-matrix-surface-hover transition-colors"
          >
            <RefreshCw className={clsx('w-5 h-5 text-matrix-text-muted', refreshing && 'animate-spin')} />
          </button>
          <button
            onClick={() => setShowGenerateModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium bg-matrix-primary/20 text-matrix-primary hover:bg-matrix-primary/30 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Generate Wallet
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-matrix-text-muted text-sm">Total Wallets</p>
              <p className="text-2xl font-bold text-matrix-text mt-1">
                {summary?.totalWallets || 0}
              </p>
            </div>
            <Database className="w-8 h-8 text-matrix-primary opacity-50" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-matrix-text-muted text-sm">Executors</p>
              <p className="text-2xl font-bold text-green-400 mt-1">
                {summary?.byRole?.executor || 0}
              </p>
            </div>
            <Key className="w-8 h-8 text-green-400 opacity-50" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-matrix-text-muted text-sm">Gas Reserves</p>
              <p className="text-2xl font-bold text-blue-400 mt-1">
                {summary?.byRole?.gas_reserve || 0}
              </p>
            </div>
            <Shield className="w-8 h-8 text-blue-400 opacity-50" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-matrix-text-muted text-sm">Low Balance</p>
              <p className={clsx(
                'text-2xl font-bold mt-1',
                (summary?.lowBalanceCount || 0) > 0 ? 'text-red-400' : 'text-matrix-text'
              )}>
                {summary?.lowBalanceCount || 0}
              </p>
            </div>
            <AlertTriangle className={clsx(
              'w-8 h-8 opacity-50',
              (summary?.lowBalanceCount || 0) > 0 ? 'text-red-400' : 'text-matrix-text-muted'
            )} />
          </div>
          {(summary?.lowBalanceCount || 0) > 0 && (
            <button
              onClick={handleAutoFund}
              className="mt-3 w-full text-sm px-3 py-1.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
            >
              Auto-Fund All
            </button>
          )}
        </Card>
      </div>

      {/* Wallet List */}
      <Card>
        <div className="p-4 border-b border-matrix-border">
          <h2 className="text-lg font-semibold text-matrix-text flex items-center gap-2">
            <Wallet className="w-5 h-5 text-matrix-primary" />
            Managed Wallets
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-matrix-text-muted text-sm border-b border-matrix-border">
                <th className="p-4">Label</th>
                <th className="p-4">Address</th>
                <th className="p-4">Chain</th>
                <th className="p-4">Role</th>
                <th className="p-4 text-right">Balance</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {wallets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-matrix-text-muted">
                    No wallets found. Generate your first wallet to get started.
                  </td>
                </tr>
              ) : (
                wallets.map((wallet) => {
                  const balance = getBalanceForWallet(wallet.id);
                  return (
                    <tr
                      key={wallet.id}
                      className={clsx(
                        'border-b border-matrix-border hover:bg-matrix-surface-hover transition-colors cursor-pointer',
                        balance?.isLow && 'bg-red-500/5'
                      )}
                      onClick={() => fetchWalletDetails(wallet.id)}
                    >
                      <td className="p-4">
                        <span className="font-medium text-matrix-text">{wallet.label}</span>
                        <p className="text-xs text-matrix-text-muted mt-0.5">
                          {wallet.derivationPath}
                        </p>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm text-matrix-text">
                            {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(wallet.address);
                            }}
                            className="p-1 hover:bg-matrix-surface rounded"
                          >
                            <Copy className="w-3 h-3 text-matrix-text-muted" />
                          </button>
                          <a
                            href={`${CHAIN_EXPLORERS[wallet.chain]}/address/${wallet.address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-1 hover:bg-matrix-surface rounded"
                          >
                            <ExternalLink className="w-3 h-3 text-matrix-text-muted" />
                          </a>
                        </div>
                      </td>
                      <td className="p-4">
                        <Badge variant="default">{CHAIN_NAMES[wallet.chain] || `Chain ${wallet.chain}`}</Badge>
                      </td>
                      <td className="p-4">
                        <Badge variant={getRoleBadgeVariant(wallet.role) as any}>
                          {wallet.role.replace('_', ' ')}
                        </Badge>
                      </td>
                      <td className="p-4 text-right">
                        {balance ? (
                          <div>
                            <span className={clsx(
                              'font-mono',
                              balance.isLow ? 'text-red-400' : 'text-matrix-text'
                            )}>
                              {parseFloat(balance.balanceFormatted).toFixed(4)}
                            </span>
                            <span className="text-matrix-text-muted ml-1">
                              {balance.symbol}
                            </span>
                          </div>
                        ) : (
                          <span className="text-matrix-text-muted">-</span>
                        )}
                      </td>
                      <td className="p-4">
                        {balance?.isLow ? (
                          <span className="flex items-center gap-1 text-red-400 text-sm">
                            <AlertTriangle className="w-4 h-4" />
                            Low
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-green-400 text-sm">
                            <CheckCircle className="w-4 h-4" />
                            OK
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleFundWallet(wallet.id);
                          }}
                          disabled={funding === wallet.id || wallet.role === 'gas_reserve'}
                          className={clsx(
                            'flex items-center gap-1 px-3 py-1.5 rounded text-sm transition-colors ml-auto',
                            wallet.role === 'gas_reserve'
                              ? 'bg-matrix-border/50 text-matrix-text-muted cursor-not-allowed'
                              : 'bg-matrix-primary/20 text-matrix-primary hover:bg-matrix-primary/30'
                          )}
                        >
                          <Send className="w-3 h-3" />
                          {funding === wallet.id ? 'Funding...' : 'Fund'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Wallet Details Modal */}
      {selectedWallet && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl max-h-[80vh] overflow-auto m-4">
            <div className="p-4 border-b border-matrix-border flex items-center justify-between">
              <h3 className="text-lg font-semibold text-matrix-text">
                {selectedWallet.wallet.label}
              </h3>
              <button
                onClick={() => setSelectedWallet(null)}
                className="text-matrix-text-muted hover:text-matrix-text"
              >
                &times;
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* Wallet Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-matrix-text-muted text-sm">Address</p>
                  <p className="font-mono text-matrix-text">{selectedWallet.wallet.address}</p>
                </div>
                <div>
                  <p className="text-matrix-text-muted text-sm">Chain</p>
                  <p className="text-matrix-text">{CHAIN_NAMES[selectedWallet.wallet.chain]}</p>
                </div>
                <div>
                  <p className="text-matrix-text-muted text-sm">Role</p>
                  <Badge variant={getRoleBadgeVariant(selectedWallet.wallet.role) as any}>
                    {selectedWallet.wallet.role}
                  </Badge>
                </div>
                <div>
                  <p className="text-matrix-text-muted text-sm">Balance</p>
                  <p className="text-matrix-text font-mono">
                    {selectedWallet.balance?.balanceFormatted || '0'} {CHAIN_SYMBOLS[selectedWallet.wallet.chain]}
                  </p>
                </div>
              </div>

              {/* Assignments */}
              {selectedWallet.assignments.length > 0 && (
                <div>
                  <p className="text-matrix-text-muted text-sm mb-2">Contract Authorizations</p>
                  <div className="space-y-2">
                    {selectedWallet.assignments.map((a, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-matrix-bg rounded">
                        <span className="font-mono text-sm text-matrix-text">
                          {a.contractAddress.slice(0, 10)}...{a.contractAddress.slice(-8)}
                        </span>
                        <span className="text-xs text-matrix-text-muted">
                          {new Date(a.authorizedAt).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Funding History */}
              {selectedWallet.fundingHistory.length > 0 && (
                <div>
                  <p className="text-matrix-text-muted text-sm mb-2">Funding History</p>
                  <div className="space-y-2">
                    {selectedWallet.fundingHistory.slice(0, 5).map((tx) => (
                      <div key={tx.id} className="flex items-center justify-between p-2 bg-matrix-bg rounded">
                        <div>
                          <span className="font-mono text-sm text-matrix-text">
                            {tx.txHash.slice(0, 12)}...
                          </span>
                          <StatusBadge status={tx.status} />
                        </div>
                        <span className="text-xs text-matrix-text-muted">
                          {new Date(tx.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Generate Wallet Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md m-4">
            <div className="p-4 border-b border-matrix-border flex items-center justify-between">
              <h3 className="text-lg font-semibold text-matrix-text flex items-center gap-2">
                <Plus className="w-5 h-5 text-matrix-primary" />
                Generate New Wallet
              </h3>
              <button
                onClick={() => setShowGenerateModal(false)}
                className="text-matrix-text-muted hover:text-matrix-text text-2xl"
              >
                &times;
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm text-matrix-text-muted mb-1">Chain</label>
                <select
                  value={newWalletChain}
                  onChange={(e) => setNewWalletChain(parseInt(e.target.value))}
                  className="w-full p-2 rounded bg-matrix-bg border border-matrix-border text-matrix-text"
                >
                  <option value={56}>BSC</option>
                  <option value={1}>Ethereum</option>
                  <option value={137}>Polygon</option>
                  <option value={42161}>Arbitrum</option>
                  <option value={11155111}>Sepolia (Testnet)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-matrix-text-muted mb-1">Role</label>
                <select
                  value={newWalletRole}
                  onChange={(e) => setNewWalletRole(e.target.value as any)}
                  className="w-full p-2 rounded bg-matrix-bg border border-matrix-border text-matrix-text"
                >
                  <option value="executor">Executor</option>
                  <option value="gas_reserve">Gas Reserve</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-matrix-text-muted mb-1">Label (optional)</label>
                <input
                  type="text"
                  value={newWalletLabel}
                  onChange={(e) => setNewWalletLabel(e.target.value)}
                  placeholder={`${CHAIN_NAMES[newWalletChain]}-${newWalletRole}`}
                  className="w-full p-2 rounded bg-matrix-bg border border-matrix-border text-matrix-text placeholder-matrix-text-muted"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowGenerateModal(false)}
                  className="flex-1 px-4 py-2 rounded bg-matrix-surface text-matrix-text-muted hover:text-matrix-text transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGenerateWallet}
                  disabled={generating}
                  className="flex-1 px-4 py-2 rounded bg-matrix-primary/20 text-matrix-primary hover:bg-matrix-primary/30 transition-colors disabled:opacity-50"
                >
                  {generating ? 'Generating...' : 'Generate'}
                </button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
