/**
 * MEROVINGIAN types
 */

import type { ChainId } from '@matrix/shared';

export interface MempoolConfig {
  chains: ChainId[];
  wsUrls: Record<ChainId, string>;
  reconnectDelayMs: number;
  maxReconnectAttempts: number;
  pendingTxBufferSize: number;
}

export interface DetectorConfig {
  minSwapValueEth: number;
  maxBlocksAhead: number;
  whaleThresholdEth: number;
  knownRouters: string[];
  knownDexPools: string[];
}

export interface ConnectionStatus {
  chain: ChainId;
  connected: boolean;
  reconnectAttempts: number;
  lastMessageMs: number;
  pendingTxCount: number;
}
