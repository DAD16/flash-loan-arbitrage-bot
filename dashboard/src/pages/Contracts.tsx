import { useState, useEffect, useCallback } from 'react';
import {
  FileCode,
  RefreshCw,
  ExternalLink,
  Copy,
  ChevronDown,
  ChevronRight,
  Activity,
  Zap,
  Code2,
  List,
  Clock,
  Hash,
} from 'lucide-react';
import clsx from 'clsx';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { useStore } from '../store/useStore';

interface ContractDeployment {
  name: string;
  address: string;
  chain: string;
  chainId: number;
  explorer: string;
  verified: boolean;
  deployedAt: string;
  configuration?: Record<string, any>;
}

interface ContractFunction {
  name: string;
  signature: string;
  stateMutability: string;
  inputs: Array<{ name: string; type: string }>;
  outputs: Array<{ name: string; type: string }>;
}

interface ContractEvent {
  name: string;
  signature: string;
  inputs: Array<{ name: string; type: string; indexed: boolean }>;
}

interface ContractDetails extends ContractDeployment {
  abi: any[];
  functions: ContractFunction[];
  events: ContractEvent[];
  codeSize: number;
}

interface ContractEventLog {
  transactionHash: string;
  blockNumber: number;
  topics: string[];
  data: string;
  logIndex: number;
}

interface ContractTransaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  blockNumber: number;
  timestamp: number;
  gasPrice: string;
  data: string;
}

const CHAIN_NAMES: Record<string, string> = {
  bsc: 'BSC',
  sepolia: 'Sepolia',
  mainnet: 'Ethereum',
  arbitrum: 'Arbitrum',
};

const API_BASE = 'http://localhost:9081';

export default function Contracts() {
  const { addNotification } = useStore();
  const [contracts, setContracts] = useState<ContractDeployment[]>([]);
  const [selectedContract, setSelectedContract] = useState<ContractDetails | null>(null);
  const [events, setEvents] = useState<ContractEventLog[]>([]);
  const [transactions, setTransactions] = useState<ContractTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'functions' | 'events' | 'transactions' | 'config'>('functions');
  const [expandedFunctions, setExpandedFunctions] = useState<Set<string>>(new Set());

  const fetchContracts = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/contracts`);
      const data = await response.json();
      if (data.success) {
        setContracts(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching contracts:', error);
    }
    setLoading(false);
  }, []);

  const fetchContractDetails = async (address: string, chainId: number) => {
    try {
      const response = await fetch(`${API_BASE}/api/contracts/${address}?chainId=${chainId}`);
      const data = await response.json();
      if (data.success) {
        setSelectedContract(data.data);
        // Also fetch events and transactions
        fetchEvents(address, chainId);
        fetchTransactions(address, chainId);
      }
    } catch (error) {
      console.error('Error fetching contract details:', error);
    }
  };

  const fetchEvents = async (address: string, chainId: number) => {
    try {
      const response = await fetch(`${API_BASE}/api/contracts/${address}/events?chainId=${chainId}&limit=20`);
      const data = await response.json();
      if (data.success) {
        setEvents(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching events:', error);
    }
  };

  const fetchTransactions = async (address: string, chainId: number) => {
    try {
      const response = await fetch(`${API_BASE}/api/contracts/${address}/transactions?chainId=${chainId}&blocks=200`);
      const data = await response.json();
      if (data.success) {
        setTransactions(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
  };

  useEffect(() => {
    fetchContracts();
  }, [fetchContracts]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchContracts();
    if (selectedContract) {
      await fetchContractDetails(selectedContract.address, selectedContract.chainId);
    }
    setRefreshing(false);
    addNotification({
      type: 'success',
      title: 'Refreshed',
      message: 'Contract data updated',
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    addNotification({
      type: 'info',
      title: 'Copied',
      message: 'Copied to clipboard',
    });
  };

  const toggleFunction = (name: string) => {
    setExpandedFunctions((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const getStateMutabilityColor = (sm: string) => {
    switch (sm) {
      case 'view':
      case 'pure':
        return 'text-blue-400';
      case 'payable':
        return 'text-yellow-400';
      default:
        return 'text-red-400';
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-matrix-surface rounded w-1/4" />
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
            <FileCode className="w-6 h-6 text-matrix-primary" />
            Smart Contract Viewer
          </h1>
          <p className="text-matrix-text-muted mt-1">
            View deployed contracts, ABIs, events, and transactions
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-2 rounded-lg bg-matrix-surface hover:bg-matrix-surface-hover transition-colors"
        >
          <RefreshCw className={clsx('w-5 h-5 text-matrix-text-muted', refreshing && 'animate-spin')} />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Contract List */}
        <Card className="lg:col-span-1">
          <div className="p-4 border-b border-matrix-border">
            <h2 className="text-lg font-semibold text-matrix-text flex items-center gap-2">
              <List className="w-5 h-5 text-matrix-primary" />
              Deployed Contracts
            </h2>
          </div>
          <div className="p-2 space-y-1 max-h-[600px] overflow-y-auto">
            {contracts.length === 0 ? (
              <p className="p-4 text-center text-matrix-text-muted">
                No contracts deployed yet
              </p>
            ) : (
              contracts.map((contract) => (
                <button
                  key={`${contract.chain}-${contract.address}`}
                  onClick={() => fetchContractDetails(contract.address, contract.chainId)}
                  className={clsx(
                    'w-full p-3 rounded-lg text-left transition-colors',
                    selectedContract?.address === contract.address
                      ? 'bg-matrix-primary/20 border border-matrix-primary'
                      : 'hover:bg-matrix-surface-hover'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-matrix-text">{contract.name}</span>
                    <Badge variant="default">{CHAIN_NAMES[contract.chain] || contract.chain}</Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-mono text-xs text-matrix-text-muted">
                      {contract.address.slice(0, 8)}...{contract.address.slice(-6)}
                    </span>
                    {contract.verified && (
                      <Badge variant="success">Verified</Badge>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </Card>

        {/* Contract Details */}
        <Card className="lg:col-span-2">
          {selectedContract ? (
            <>
              <div className="p-4 border-b border-matrix-border">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-matrix-text">
                      {selectedContract.name}
                    </h2>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-mono text-sm text-matrix-text-muted">
                        {selectedContract.address}
                      </span>
                      <button
                        onClick={() => copyToClipboard(selectedContract.address)}
                        className="p-1 hover:bg-matrix-surface rounded"
                      >
                        <Copy className="w-3 h-3 text-matrix-text-muted" />
                      </button>
                      {selectedContract.explorer && (
                        <a
                          href={selectedContract.explorer}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 hover:bg-matrix-surface rounded"
                        >
                          <ExternalLink className="w-3 h-3 text-matrix-text-muted" />
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <p className="text-matrix-text-muted">Code Size</p>
                    <p className="text-matrix-text font-mono">{selectedContract.codeSize} bytes</p>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 mt-4">
                  {(['functions', 'events', 'transactions', 'config'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={clsx(
                        'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize',
                        activeTab === tab
                          ? 'bg-matrix-primary/20 text-matrix-primary'
                          : 'text-matrix-text-muted hover:text-matrix-text hover:bg-matrix-surface'
                      )}
                    >
                      {tab === 'functions' && <Code2 className="w-4 h-4 inline mr-1" />}
                      {tab === 'events' && <Zap className="w-4 h-4 inline mr-1" />}
                      {tab === 'transactions' && <Activity className="w-4 h-4 inline mr-1" />}
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 max-h-[500px] overflow-y-auto">
                {/* Functions Tab */}
                {activeTab === 'functions' && (
                  <div className="space-y-2">
                    {selectedContract.functions.length === 0 ? (
                      <p className="text-matrix-text-muted text-center py-4">No functions found</p>
                    ) : (
                      selectedContract.functions.map((fn) => (
                        <div
                          key={fn.signature}
                          className="border border-matrix-border rounded-lg overflow-hidden"
                        >
                          <button
                            onClick={() => toggleFunction(fn.name)}
                            className="w-full p-3 flex items-center justify-between hover:bg-matrix-surface-hover transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              {expandedFunctions.has(fn.name) ? (
                                <ChevronDown className="w-4 h-4 text-matrix-text-muted" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-matrix-text-muted" />
                              )}
                              <span className="font-mono text-matrix-text">{fn.name}</span>
                              <span className={clsx('text-xs', getStateMutabilityColor(fn.stateMutability))}>
                                {fn.stateMutability}
                              </span>
                            </div>
                          </button>
                          {expandedFunctions.has(fn.name) && (
                            <div className="p-3 bg-matrix-bg border-t border-matrix-border">
                              <p className="text-xs text-matrix-text-muted mb-2">Signature:</p>
                              <p className="font-mono text-sm text-matrix-text mb-3">{fn.signature}</p>
                              {fn.inputs.length > 0 && (
                                <>
                                  <p className="text-xs text-matrix-text-muted mb-1">Inputs:</p>
                                  <div className="space-y-1 mb-3">
                                    {fn.inputs.map((input, i) => (
                                      <div key={i} className="flex gap-2 text-sm">
                                        <span className="text-blue-400 font-mono">{input.type}</span>
                                        <span className="text-matrix-text">{input.name}</span>
                                      </div>
                                    ))}
                                  </div>
                                </>
                              )}
                              {fn.outputs.length > 0 && (
                                <>
                                  <p className="text-xs text-matrix-text-muted mb-1">Outputs:</p>
                                  <div className="space-y-1">
                                    {fn.outputs.map((output, i) => (
                                      <div key={i} className="flex gap-2 text-sm">
                                        <span className="text-green-400 font-mono">{output.type}</span>
                                        <span className="text-matrix-text">{output.name || `output${i}`}</span>
                                      </div>
                                    ))}
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Events Tab */}
                {activeTab === 'events' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-matrix-text-muted">Event Definitions</h3>
                      {selectedContract.events.map((event) => (
                        <div key={event.signature} className="p-3 bg-matrix-bg rounded-lg">
                          <p className="font-mono text-matrix-text">{event.name}</p>
                          <div className="mt-1 space-y-1">
                            {event.inputs.map((input, i) => (
                              <div key={i} className="flex gap-2 text-sm">
                                <span className={input.indexed ? 'text-yellow-400' : 'text-blue-400'}>
                                  {input.type}
                                </span>
                                <span className="text-matrix-text">{input.name}</span>
                                {input.indexed && (
                                  <Badge variant="warning">indexed</Badge>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-matrix-text-muted">Recent Event Logs</h3>
                      {events.length === 0 ? (
                        <p className="text-matrix-text-muted text-center py-4">No recent events</p>
                      ) : (
                        events.map((event, i) => (
                          <div key={i} className="p-3 bg-matrix-bg rounded-lg">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Hash className="w-4 h-4 text-matrix-text-muted" />
                                <span className="font-mono text-sm text-matrix-text">
                                  {event.transactionHash.slice(0, 16)}...
                                </span>
                              </div>
                              <span className="text-xs text-matrix-text-muted">
                                Block #{event.blockNumber}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* Transactions Tab */}
                {activeTab === 'transactions' && (
                  <div className="space-y-2">
                    {transactions.length === 0 ? (
                      <p className="text-matrix-text-muted text-center py-4">No recent transactions</p>
                    ) : (
                      transactions.map((tx) => (
                        <div key={tx.hash} className="p-3 bg-matrix-bg rounded-lg">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Activity className="w-4 h-4 text-matrix-primary" />
                              <span className="font-mono text-sm text-matrix-text">
                                {tx.hash.slice(0, 16)}...
                              </span>
                            </div>
                            <Badge variant="default">Block #{tx.blockNumber}</Badge>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="text-matrix-text-muted">From: </span>
                              <span className="font-mono text-matrix-text">
                                {tx.from.slice(0, 8)}...{tx.from.slice(-6)}
                              </span>
                            </div>
                            <div>
                              <span className="text-matrix-text-muted">Value: </span>
                              <span className="text-matrix-text">
                                {(Number(tx.value) / 1e18).toFixed(4)} ETH
                              </span>
                            </div>
                          </div>
                          {tx.data && tx.data !== '0x' && (
                            <div className="mt-2">
                              <span className="text-xs text-matrix-text-muted">Data: </span>
                              <span className="font-mono text-xs text-matrix-text-muted">
                                {tx.data}
                              </span>
                            </div>
                          )}
                          <div className="mt-2 flex items-center gap-1 text-xs text-matrix-text-muted">
                            <Clock className="w-3 h-3" />
                            {new Date(tx.timestamp * 1000).toLocaleString()}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Config Tab */}
                {activeTab === 'config' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-matrix-text-muted mb-1">Chain</p>
                        <p className="text-matrix-text">
                          {CHAIN_NAMES[selectedContract.chain] || selectedContract.chain} ({selectedContract.chainId})
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-matrix-text-muted mb-1">Deployed At</p>
                        <p className="text-matrix-text">
                          {selectedContract.deployedAt ? new Date(selectedContract.deployedAt).toLocaleDateString() : 'Unknown'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-matrix-text-muted mb-1">Verified</p>
                        <p className="text-matrix-text">{selectedContract.verified ? 'Yes' : 'No'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-matrix-text-muted mb-1">Functions</p>
                        <p className="text-matrix-text">{selectedContract.functions.length}</p>
                      </div>
                    </div>

                    {selectedContract.configuration && Object.keys(selectedContract.configuration).length > 0 && (
                      <div>
                        <p className="text-xs text-matrix-text-muted mb-2">Configuration</p>
                        <div className="bg-matrix-bg rounded-lg p-3">
                          <pre className="text-sm text-matrix-text overflow-x-auto">
                            {JSON.stringify(selectedContract.configuration, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="p-12 text-center text-matrix-text-muted">
              <FileCode className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Select a contract to view details</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
