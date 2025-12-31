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
