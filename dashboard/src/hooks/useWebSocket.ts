/**
 * WebSocket Hook for Real-Time Updates
 *
 * Provides live price updates, opportunities, and Fast Mode status
 * via WebSocket connection. Part of Phase A Speed Optimization.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

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

export interface FastModeConfig {
  enabled: boolean;
  autoExecute: boolean;
  minProfitThresholdBps: number;
  maxGasGwei: number;
  maxSlippageBps: number;
  usePrivateMempool: boolean;
  cooldownMs: number;
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

export interface WebSocketState {
  connected: boolean;
  reconnecting: boolean;
  lastMessage: WSMessage | null;
  messageCount: number;
  latency: LatencyMetrics | null;
  fastModeConfig: FastModeConfig | null;
}

// ============================================================================
// HOOK
// ============================================================================

const WS_URL = 'ws://localhost:9082';
const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

export function useWebSocket() {
  const [state, setState] = useState<WebSocketState>({
    connected: false,
    reconnecting: false,
    lastMessage: null,
    messageCount: 0,
    latency: null,
    fastModeConfig: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);

  // Message handlers that can be set by consumers
  const handlersRef = useRef<{
    onPrice?: (update: PriceUpdate) => void;
    onOpportunity?: (update: OpportunityUpdate) => void;
    onExecution?: (update: ExecutionUpdate) => void;
    onLatency?: (update: LatencyMetrics) => void;
    onFastMode?: (update: FastModeUpdate) => void;
  }>({});

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WebSocket] Connected');
        reconnectAttempts.current = 0;
        setState((prev) => ({ ...prev, connected: true, reconnecting: false }));
      };

      ws.onmessage = (event) => {
        try {
          const message: WSMessage = JSON.parse(event.data);

          setState((prev) => ({
            ...prev,
            lastMessage: message,
            messageCount: prev.messageCount + 1,
            ...(message.type === 'LATENCY' ? { latency: message } : {}),
            ...(message.type === 'FAST_MODE_STATUS' ? { fastModeConfig: message.config } : {}),
          }));

          // Call specific handlers
          switch (message.type) {
            case 'PRICE_UPDATE':
              handlersRef.current.onPrice?.(message);
              break;
            case 'OPPORTUNITY':
              handlersRef.current.onOpportunity?.(message);
              break;
            case 'EXECUTION':
              handlersRef.current.onExecution?.(message);
              break;
            case 'LATENCY':
              handlersRef.current.onLatency?.(message);
              break;
            case 'FAST_MODE_STATUS':
              handlersRef.current.onFastMode?.(message);
              break;
          }
        } catch (error) {
          console.error('[WebSocket] Parse error:', error);
        }
      };

      ws.onclose = () => {
        console.log('[WebSocket] Disconnected');
        setState((prev) => ({ ...prev, connected: false }));

        // Attempt reconnection
        if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
          setState((prev) => ({ ...prev, reconnecting: true }));
          reconnectAttempts.current++;

          reconnectTimeout.current = setTimeout(() => {
            console.log(`[WebSocket] Reconnecting (attempt ${reconnectAttempts.current})...`);
            connect();
          }, RECONNECT_DELAY);
        }
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
      };
    } catch (error) {
      console.error('[WebSocket] Connection failed:', error);
    }
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setState((prev) => ({ ...prev, connected: false, reconnecting: false }));
  }, []);

  const send = useCallback((message: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  // Subscribe to specific channels
  const subscribe = useCallback((channels: string[]) => {
    send({ type: 'SUBSCRIBE', channels });
  }, [send]);

  const unsubscribe = useCallback((channels: string[]) => {
    send({ type: 'UNSUBSCRIBE', channels });
  }, [send]);

  // Fast Mode controls
  const setFastMode = useCallback((config: Partial<FastModeConfig>) => {
    send({ type: 'SET_FAST_MODE', config });
  }, [send]);

  const enableFastMode = useCallback((autoExecute: boolean = false) => {
    setFastMode({ enabled: true, autoExecute });
  }, [setFastMode]);

  const disableFastMode = useCallback(() => {
    setFastMode({ enabled: false, autoExecute: false });
  }, [setFastMode]);

  // Register message handlers
  const onPrice = useCallback((handler: (update: PriceUpdate) => void) => {
    handlersRef.current.onPrice = handler;
  }, []);

  const onOpportunity = useCallback((handler: (update: OpportunityUpdate) => void) => {
    handlersRef.current.onOpportunity = handler;
  }, []);

  const onExecution = useCallback((handler: (update: ExecutionUpdate) => void) => {
    handlersRef.current.onExecution = handler;
  }, []);

  const onLatency = useCallback((handler: (update: LatencyMetrics) => void) => {
    handlersRef.current.onLatency = handler;
  }, []);

  const onFastMode = useCallback((handler: (update: FastModeUpdate) => void) => {
    handlersRef.current.onFastMode = handler;
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    // State
    ...state,

    // Connection controls
    connect,
    disconnect,
    send,

    // Subscriptions
    subscribe,
    unsubscribe,

    // Fast Mode
    setFastMode,
    enableFastMode,
    disableFastMode,

    // Event handlers
    onPrice,
    onOpportunity,
    onExecution,
    onLatency,
    onFastMode,
  };
}

// ============================================================================
// SPECIALIZED HOOKS
// ============================================================================

/**
 * Hook for live price updates only
 */
export function useLivePrices() {
  const [prices, setPrices] = useState<Map<string, PriceUpdate>>(new Map());
  const { connected, onPrice, latency } = useWebSocket();

  useEffect(() => {
    onPrice((update) => {
      setPrices((prev) => {
        const key = `${update.pair}-${update.dex}`;
        const next = new Map(prev);
        next.set(key, update);
        return next;
      });
    });
  }, [onPrice]);

  return {
    connected,
    prices: Array.from(prices.values()),
    latency,
  };
}

/**
 * Hook for arbitrage opportunities only
 */
export function useLiveOpportunities() {
  const [opportunities, setOpportunities] = useState<OpportunityUpdate[]>([]);
  const { connected, onOpportunity } = useWebSocket();

  useEffect(() => {
    onOpportunity((update) => {
      setOpportunities((prev) => {
        // Keep last 50 opportunities
        const next = [update, ...prev].slice(0, 50);
        return next;
      });
    });
  }, [onOpportunity]);

  return {
    connected,
    opportunities,
  };
}

/**
 * Hook for Fast Mode controls
 */
export function useFastMode() {
  const {
    connected,
    fastModeConfig,
    setFastMode,
    enableFastMode,
    disableFastMode,
    latency,
  } = useWebSocket();

  return {
    connected,
    config: fastModeConfig,
    latency,
    setConfig: setFastMode,
    enable: enableFastMode,
    disable: disableFastMode,
  };
}
