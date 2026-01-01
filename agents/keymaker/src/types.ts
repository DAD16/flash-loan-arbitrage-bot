/**
 * KEYMAKER types
 */

export interface VaultConfig {
  endpoint: string;
  token?: string;
  roleId?: string;
  secretId?: string;
  namespace?: string;
  secretsPath: string;
}

export interface SecretConfig {
  name: string;
  path: string;
  version?: number;
}

export interface RotationPolicy {
  secretName: string;
  intervalHours: number;
  rotationFn?: () => Promise<string>;
  notifyOnRotation: boolean;
}

export interface WalletCredentials {
  address: string;
  privateKey: string;
  chainIds: number[];
}

export interface ApiCredentials {
  provider: string;
  apiKey: string;
  apiSecret?: string;
  expiresAt?: number;
}

export interface SecretMetadata {
  name: string;
  version: number;
  createdAt: number;
  expiresAt?: number;
  rotationPolicy?: string;
}

// ============================================
// Wallet Management Types
// ============================================

export type WalletRole = 'master' | 'gas_reserve' | 'executor';
export type ChainId = 1 | 56 | 137 | 42161 | 10 | 8453 | 11155111; // ETH, BSC, Polygon, Arbitrum, Optimism, Base, Sepolia

export interface ManagedWallet {
  id: string;
  address: string;
  chain: ChainId;
  role: WalletRole;
  label: string;
  derivationPath: string;
  createdAt: number;
  lastFundedAt: number | null;
  isActive: boolean;
}

export interface WalletAssignment {
  walletId: string;
  contractAddress: string;
  chain: ChainId;
  authorizedAt: number;
  txHash: string;
}

export interface WalletBalance {
  walletId: string;
  address: string;
  chain: ChainId;
  balanceWei: string;
  balanceFormatted: string;
  symbol: string;
  updatedAt: number;
  isLow: boolean;
}

export interface FundingTransaction {
  id: string;
  fromWalletId: string;
  toWalletId: string;
  chain: ChainId;
  amountWei: string;
  txHash: string;
  status: 'pending' | 'confirmed' | 'failed';
  createdAt: number;
  confirmedAt: number | null;
}

export interface WalletManagerConfig {
  dbPath: string;
  masterSeedEnvVar: string;
  chains: ChainConfig[];
  lowBalanceThresholds: Record<ChainId, string>; // in wei
  autoFundAmounts: Record<ChainId, string>; // in wei
  checkIntervalMs: number;
}

export interface ChainConfig {
  chainId: ChainId;
  name: string;
  symbol: string;
  rpcUrl: string;
  explorerUrl: string;
  decimals: number;
}

export interface WalletGenerationResult {
  wallet: ManagedWallet;
  privateKey: string; // Only returned during generation, not stored in DB
}

export interface WalletSummary {
  totalWallets: number;
  byChain: Record<ChainId, number>;
  byRole: Record<WalletRole, number>;
  lowBalanceCount: number;
  totalValueUsd: number;
}
