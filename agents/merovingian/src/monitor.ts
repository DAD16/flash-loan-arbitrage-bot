/**
 * MEROVINGIAN - Mempool Monitor Implementation
 *
 * Monitors pending transactions across multiple EVM chains.
 * Detects DEX swaps, large transfers, and potential MEV opportunities.
 */

import { WebSocket } from 'ws';
import { AgentLogger, AgentBase, AgentStartupResult, AgentTask, type ChainId, type PendingTransaction } from '@matrix/shared';
import type { MempoolConfig, ConnectionStatus } from './types.js';

type TransactionHandler = (tx: PendingTransaction) => void;

interface RpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params: unknown[];
}

interface RpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

export class Merovingian extends AgentBase {
  private logger: AgentLogger;
  private config: MempoolConfig;
  private connections: Map<ChainId, WebSocket>;
  private connectionStatus: Map<ChainId, ConnectionStatus>;
  private handlers: TransactionHandler[];
  private isRunning: boolean;

  constructor(config: MempoolConfig) {
    this.logger = new AgentLogger('MEROVINGIAN');
    this.config = config;
    this.connections = new Map();
    this.connectionStatus = new Map();
    this.handlers = [];
    this.isRunning = false;

    this.logger.info('Merovingian initialized', {
      chain: config.chains.join(','),
    });
  }

  /**
   * Register a handler for pending transactions
   */
  onTransaction(handler: TransactionHandler): void {
    this.handlers.push(handler);
  }

  /**
   * Start monitoring all configured chains
   */
  async start(): Promise<void> {
    this.logger.info('Starting mempool monitoring...');
    this.isRunning = true;

    for (const chain of this.config.chains) {
      await this.connectToChain(chain);
    }

    this.logger.info('Mempool monitoring started', {
      chain: `${this.connections.size} chains connected`,
    });
  }

  /**
   * Stop monitoring
   */
  async stop(): Promise<void> {
    this.logger.info('Stopping mempool monitoring...');
    this.isRunning = false;

    for (const [chain, ws] of this.connections) {
      ws.close();
      this.logger.info(`Disconnected from ${chain}`);
    }

    this.connections.clear();
    this.connectionStatus.clear();
  }

  /**
   * Get connection status for all chains
   */
  getStatus(): ConnectionStatus[] {
    return Array.from(this.connectionStatus.values());
  }

  /**
   * Connect to a specific chain's mempool
   */
  private async connectToChain(chain: ChainId): Promise<void> {
    const wsUrl = this.config.wsUrls[chain];
    if (!wsUrl) {
      this.logger.warn(`No WebSocket URL configured for ${chain}`);
      return;
    }

    const status: ConnectionStatus = {
      chain,
      connected: false,
      reconnectAttempts: 0,
      lastMessageMs: 0,
      pendingTxCount: 0,
    };
    this.connectionStatus.set(chain, status);

    try {
      const ws = new WebSocket(wsUrl);

      ws.on('open', () => {
        this.logger.info(`Connected to ${chain} mempool`);
        status.connected = true;
        status.reconnectAttempts = 0;

        // Subscribe to pending transactions
        this.subscribeToPendingTx(ws, chain);
      });

      ws.on('message', (data) => {
        status.lastMessageMs = Date.now();
        this.handleMessage(chain, data.toString());
      });

      ws.on('close', () => {
        this.logger.warn(`Disconnected from ${chain}`);
        status.connected = false;
        this.connections.delete(chain);

        // Attempt reconnection
        if (this.isRunning) {
          this.scheduleReconnect(chain);
        }
      });

      ws.on('error', (error) => {
        this.logger.error(`WebSocket error on ${chain}`, {
          error: error as Error,
        });
      });

      this.connections.set(chain, ws);
    } catch (error) {
      this.logger.error(`Failed to connect to ${chain}`, {
        error: error as Error,
      });
      this.scheduleReconnect(chain);
    }
  }

  /**
   * Subscribe to pending transactions on a WebSocket
   */
  private subscribeToPendingTx(ws: WebSocket, chain: ChainId): void {
    // Standard eth_subscribe for pending transactions
    const subscribeMsg = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_subscribe',
      params: ['newPendingTransactions'],
    });

    ws.send(subscribeMsg);
    this.logger.debug(`Subscribed to pending transactions on ${chain}`);
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(chain: ChainId, data: string): void {
    try {
      const message = JSON.parse(data);

      // Handle subscription confirmation
      if (message.id && message.result) {
        this.logger.debug(`Subscription confirmed on ${chain}: ${message.result}`);
        return;
      }

      // Handle pending transaction notification
      if (message.method === 'eth_subscription' && message.params?.result) {
        const txHash = message.params.result;
        this.handlePendingTxHash(chain, txHash);
      }
    } catch (error) {
      this.logger.error(`Failed to parse message from ${chain}`, {
        error: error as Error,
      });
    }
  }

  /**
   * Handle a pending transaction hash
   */
  private async handlePendingTxHash(chain: ChainId, txHash: string): Promise<void> {
    const status = this.connectionStatus.get(chain);
    if (status) {
      status.pendingTxCount++;
    }

    // Fetch full transaction details
    const txDetails = await this.fetchTransaction(chain, txHash);
    if (!txDetails) {
      return; // Transaction may have been dropped or included
    }

    const pendingTx: PendingTransaction = {
      hash: txHash as `0x${string}`,
      from: (txDetails.from || '0x0') as `0x${string}`,
      to: (txDetails.to || '0x0') as `0x${string}`,
      value: BigInt(txDetails.value || '0'),
      data: (txDetails.input || '0x') as `0x${string}`,
      gasPrice: BigInt(txDetails.gasPrice || txDetails.maxFeePerGas || '0'),
      gasLimit: BigInt(txDetails.gas || '0'),
      nonce: parseInt(txDetails.nonce || '0', 16),
      chainId: this.getChainId(chain),
      timestampMs: Date.now(),
    };

    // Notify all handlers
    for (const handler of this.handlers) {
      try {
        handler(pendingTx);
      } catch (error) {
        this.logger.error('Handler error', { error: error as Error });
      }
    }
  }

  /**
   * Fetch full transaction details via JSON-RPC
   */
  private async fetchTransaction(
    chain: ChainId,
    txHash: string
  ): Promise<Record<string, string> | null> {
    const ws = this.connections.get(chain);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return null;
    }

    return new Promise((resolve) => {
      const requestId = Date.now();
      const request: RpcRequest = {
        jsonrpc: '2.0',
        id: requestId,
        method: 'eth_getTransactionByHash',
        params: [txHash],
      };

      const timeout = setTimeout(() => {
        resolve(null);
      }, 2000); // 2 second timeout

      const messageHandler = (data: Buffer) => {
        try {
          const response: RpcResponse = JSON.parse(data.toString());
          if (response.id === requestId) {
            clearTimeout(timeout);
            ws.off('message', messageHandler);
            resolve(response.result as Record<string, string> | null);
          }
        } catch {
          // Ignore parse errors from subscription messages
        }
      };

      ws.on('message', messageHandler);
      ws.send(JSON.stringify(request));
    });
  }

  /**
   * Schedule a reconnection attempt
   */
  private scheduleReconnect(chain: ChainId): void {
    const status = this.connectionStatus.get(chain);
    if (!status) return;

    if (status.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.logger.error(`Max reconnect attempts reached for ${chain}`);
      return;
    }

    status.reconnectAttempts++;
    const delay = this.config.reconnectDelayMs * status.reconnectAttempts;

    this.logger.info(`Scheduling reconnect for ${chain} in ${delay}ms`, {
      chain,
    });

    setTimeout(() => {
      if (this.isRunning) {
        this.connectToChain(chain);
      }
    }, delay);
  }

  /**
   * Get numeric chain ID
   */
  private getChainId(chain: ChainId): number {
    const chainIds: Record<ChainId, number> = {
      ethereum: 1,
      arbitrum: 42161,
      optimism: 10,
      base: 8453,
      bsc: 56,
    };
    return chainIds[chain] ?? 1;
  }
}
