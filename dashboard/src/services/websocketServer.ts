/**
 * WebSocket Server for Real-Time Price Streaming
 *
 * Provides low-latency price updates to connected clients.
 * Part of Phase A Speed Optimization.
 *
 * Agent: ORACLE (Price Prediction Engine)
 */

import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';

// ============================================================================
// TYPES
// ============================================================================

export interface PriceUpdate {
  type: 'PRICE_UPDATE';
  chain: string;
  pair: string;
  dex: string;
  price: number;
  reserves: {
    token0: string;
    token1: string;
  };
  timestamp: number;
}

export interface OpportunityUpdate {
  type: 'OPPORTUNITY';
  chain: string;
  id: string;
  pair: string;
  buyDex: string;
  sellDex: string;
  buyPrice: number;
  sellPrice: number;
  spreadBps: number;
  netProfitBps: number;
  estimatedProfitUsd: number;
  timestamp: number;
}

export interface FastModeUpdate {
  type: 'FAST_MODE_STATUS';
  enabled: boolean;
  config: FastModeConfig;
}

export interface ExecutionUpdate {
  type: 'EXECUTION';
  id: string;
  status: 'pending' | 'submitted' | 'confirmed' | 'failed';
  txHash?: string;
  pair: string;
  profitUsd?: number;
  timestamp: number;
}

export interface LatencyMetrics {
  type: 'LATENCY';
  rpcLatencyMs: number;
  processLatencyMs: number;
  totalLatencyMs: number;
  timestamp: number;
}

export type WSMessage = PriceUpdate | OpportunityUpdate | FastModeUpdate | ExecutionUpdate | LatencyMetrics;

export interface FastModeConfig {
  enabled: boolean;
  autoExecute: boolean;
  minProfitThresholdBps: number;
  maxGasGwei: number;
  maxSlippageBps: number;
  usePrivateMempool: boolean;
  cooldownMs: number;
}

export interface ClientSubscription {
  prices: boolean;
  opportunities: boolean;
  executions: boolean;
  latency: boolean;
}

// ============================================================================
// WEBSOCKET SERVER
// ============================================================================

export class PriceWebSocketServer extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private clients: Map<WebSocket, ClientSubscription> = new Map();
  private port: number;
  private fastModeConfig: FastModeConfig;
  private latencyHistory: number[] = [];
  private messageCount: number = 0;

  constructor(port: number = 9082) {
    super();
    this.port = port;
    this.fastModeConfig = {
      enabled: false,
      autoExecute: false,
      minProfitThresholdBps: 50, // 0.5%
      maxGasGwei: 10,
      maxSlippageBps: 100, // 1%
      usePrivateMempool: false,
      cooldownMs: 5000,
    };
  }

  start(): void {
    if (this.wss) {
      console.log('[WebSocket] Server already running');
      return;
    }

    this.wss = new WebSocketServer({ port: this.port });

    console.log(`\n⚡ WebSocket Server started on ws://localhost:${this.port}`);
    console.log('   Channels: prices, opportunities, executions, latency\n');

    this.wss.on('connection', (ws: WebSocket, req) => {
      const clientId = req.socket.remoteAddress || 'unknown';
      console.log(`[WebSocket] Client connected: ${clientId}`);

      // Default subscription: all channels
      this.clients.set(ws, {
        prices: true,
        opportunities: true,
        executions: true,
        latency: true,
      });

      // Send current Fast Mode status
      this.sendToClient(ws, {
        type: 'FAST_MODE_STATUS',
        enabled: this.fastModeConfig.enabled,
        config: this.fastModeConfig,
      });

      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleClientMessage(ws, message);
        } catch (error) {
          console.error('[WebSocket] Invalid message:', error);
        }
      });

      ws.on('close', () => {
        console.log(`[WebSocket] Client disconnected: ${clientId}`);
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error(`[WebSocket] Client error: ${error.message}`);
        this.clients.delete(ws);
      });
    });

    this.wss.on('error', (error) => {
      console.error('[WebSocket] Server error:', error);
    });
  }

  stop(): void {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
      this.clients.clear();
      console.log('[WebSocket] Server stopped');
    }
  }

  // ============================================================================
  // CLIENT MESSAGE HANDLING
  // ============================================================================

  private handleClientMessage(ws: WebSocket, message: any): void {
    switch (message.type) {
      case 'SUBSCRIBE':
        this.handleSubscribe(ws, message.channels);
        break;

      case 'UNSUBSCRIBE':
        this.handleUnsubscribe(ws, message.channels);
        break;

      case 'SET_FAST_MODE':
        this.handleSetFastMode(message.config);
        break;

      case 'PING':
        this.sendToClient(ws, { type: 'PONG', timestamp: Date.now() });
        break;

      default:
        console.log('[WebSocket] Unknown message type:', message.type);
    }
  }

  private handleSubscribe(ws: WebSocket, channels: string[]): void {
    const subscription = this.clients.get(ws);
    if (!subscription) return;

    for (const channel of channels) {
      if (channel in subscription) {
        (subscription as any)[channel] = true;
      }
    }
    console.log(`[WebSocket] Client subscribed to: ${channels.join(', ')}`);
  }

  private handleUnsubscribe(ws: WebSocket, channels: string[]): void {
    const subscription = this.clients.get(ws);
    if (!subscription) return;

    for (const channel of channels) {
      if (channel in subscription) {
        (subscription as any)[channel] = false;
      }
    }
    console.log(`[WebSocket] Client unsubscribed from: ${channels.join(', ')}`);
  }

  private handleSetFastMode(config: Partial<FastModeConfig>): void {
    this.fastModeConfig = { ...this.fastModeConfig, ...config };
    console.log(`[WebSocket] Fast Mode ${this.fastModeConfig.enabled ? 'ENABLED' : 'DISABLED'}`);

    // Broadcast to all clients
    this.broadcast({
      type: 'FAST_MODE_STATUS',
      enabled: this.fastModeConfig.enabled,
      config: this.fastModeConfig,
    });

    // Emit event for other services to react
    this.emit('fastModeChanged', this.fastModeConfig);
  }

  // ============================================================================
  // BROADCASTING
  // ============================================================================

  private sendToClient(ws: WebSocket, message: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  broadcast(message: WSMessage): void {
    if (!this.wss) return;

    this.messageCount++;
    const channel = this.getChannelForMessage(message);

    for (const [ws, subscription] of this.clients) {
      if (subscription[channel as keyof ClientSubscription]) {
        this.sendToClient(ws, message);
      }
    }
  }

  private getChannelForMessage(message: WSMessage): string {
    switch (message.type) {
      case 'PRICE_UPDATE':
        return 'prices';
      case 'OPPORTUNITY':
        return 'opportunities';
      case 'EXECUTION':
        return 'executions';
      case 'LATENCY':
        return 'latency';
      default:
        return 'prices';
    }
  }

  // ============================================================================
  // PRICE UPDATE METHODS (called by PriceIngestionService)
  // ============================================================================

  broadcastPriceUpdate(update: Omit<PriceUpdate, 'type'>): void {
    this.broadcast({
      type: 'PRICE_UPDATE',
      ...update,
    });
  }

  broadcastOpportunity(update: Omit<OpportunityUpdate, 'type'>): void {
    this.broadcast({
      type: 'OPPORTUNITY',
      ...update,
    });

    // If Fast Mode with autoExecute, emit event
    if (this.fastModeConfig.enabled && this.fastModeConfig.autoExecute) {
      if (update.netProfitBps >= this.fastModeConfig.minProfitThresholdBps) {
        this.emit('autoExecute', update);
      }
    }
  }

  broadcastExecution(update: Omit<ExecutionUpdate, 'type'>): void {
    this.broadcast({
      type: 'EXECUTION',
      ...update,
    });
  }

  broadcastLatency(rpcLatencyMs: number, processLatencyMs: number): void {
    const totalLatencyMs = rpcLatencyMs + processLatencyMs;

    // Track latency history (last 100 samples)
    this.latencyHistory.push(totalLatencyMs);
    if (this.latencyHistory.length > 100) {
      this.latencyHistory.shift();
    }

    this.broadcast({
      type: 'LATENCY',
      rpcLatencyMs,
      processLatencyMs,
      totalLatencyMs,
      timestamp: Date.now(),
    });
  }

  // ============================================================================
  // GETTERS
  // ============================================================================

  getFastModeConfig(): FastModeConfig {
    return { ...this.fastModeConfig };
  }

  setFastModeConfig(config: Partial<FastModeConfig>): void {
    this.handleSetFastMode(config);
  }

  getStats(): {
    clients: number;
    messageCount: number;
    avgLatencyMs: number;
    fastModeEnabled: boolean;
  } {
    const avgLatency =
      this.latencyHistory.length > 0
        ? this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length
        : 0;

    return {
      clients: this.clients.size,
      messageCount: this.messageCount,
      avgLatencyMs: Math.round(avgLatency),
      fastModeEnabled: this.fastModeConfig.enabled,
    };
  }

  getClientCount(): number {
    return this.clients.size;
  }

  isRunning(): boolean {
    return this.wss !== null;
  }
}

// Singleton instance
let wsServer: PriceWebSocketServer | null = null;

export function getWebSocketServer(port?: number): PriceWebSocketServer {
  if (!wsServer) {
    wsServer = new PriceWebSocketServer(port);
  }
  return wsServer;
}

export function startWebSocketServer(port?: number): PriceWebSocketServer {
  const server = getWebSocketServer(port);
  server.start();
  return server;
}

export function stopWebSocketServer(): void {
  if (wsServer) {
    wsServer.stop();
    wsServer = null;
  }
}
