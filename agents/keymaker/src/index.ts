/**
 * KEYMAKER - Secrets, Authentication, and Wallet Management
 *
 * "I have been doing this for a very long time. It is what I do."
 *
 * Manages keys to access all systems. Provides secure storage of private keys,
 * API credentials, handles secret rotation, and manages HD wallets across chains.
 */

// Vault & Secrets
export { Keymaker } from './vault.js';
export { SecretRotator } from './rotation.js';

// Wallet Management
export { WalletManager } from './walletManager.js';
export { WalletDatabase } from './database.js';

// Types
export type {
  // Vault types
  VaultConfig,
  SecretConfig,
  RotationPolicy,
  WalletCredentials,
  ApiCredentials,
  SecretMetadata,
  // Wallet types
  ManagedWallet,
  WalletAssignment,
  WalletBalance,
  FundingTransaction,
  WalletManagerConfig,
  WalletGenerationResult,
  WalletSummary,
  ChainId,
  WalletRole,
  ChainConfig,
} from './types.js';
