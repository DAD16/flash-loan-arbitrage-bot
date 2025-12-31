/**
 * KEYMAKER - HashiCorp Vault Integration
 */

import { AgentLogger } from '@matrix/shared';
import type {
  VaultConfig,
  WalletCredentials,
  ApiCredentials,
  SecretMetadata,
} from './types.js';

export class Keymaker {
  private logger: AgentLogger;
  private config: VaultConfig;
  private token: string | null = null;
  private secretsCache: Map<string, { value: unknown; expiresAt: number }>;

  constructor(config: VaultConfig) {
    this.logger = new AgentLogger('KEYMAKER');
    this.config = config;
    this.secretsCache = new Map();

    this.logger.info('Keymaker initialized');
  }

  /**
   * Authenticate with Vault
   */
  async authenticate(): Promise<void> {
    this.logger.info('Authenticating with Vault...');

    try {
      if (this.config.token) {
        // Token-based auth (development)
        this.token = this.config.token;
      } else if (this.config.roleId && this.config.secretId) {
        // AppRole auth (production)
        this.token = await this.appRoleLogin();
      } else {
        throw new Error('No authentication method configured');
      }

      this.logger.info('Successfully authenticated with Vault');
    } catch (error) {
      this.logger.error('Vault authentication failed', { error: error as Error });
      throw error;
    }
  }

  /**
   * Get wallet credentials by name
   */
  async getWalletCredentials(name: string): Promise<WalletCredentials> {
    const path = `${this.config.secretsPath}/wallets/${name}`;
    const secret = await this.getSecret<WalletCredentials>(path);

    if (!secret.address || !secret.privateKey) {
      throw new Error(`Invalid wallet credentials for ${name}`);
    }

    return secret;
  }

  /**
   * Get API credentials by provider name
   */
  async getApiCredentials(provider: string): Promise<ApiCredentials> {
    const path = `${this.config.secretsPath}/api/${provider}`;
    const secret = await this.getSecret<ApiCredentials>(path);

    if (!secret.apiKey) {
      throw new Error(`Invalid API credentials for ${provider}`);
    }

    return secret;
  }

  /**
   * Store a secret
   */
  async storeSecret<T>(path: string, data: T): Promise<void> {
    this.logger.info(`Storing secret at ${path}`);

    // In production, this would call Vault API
    // For now, we store in cache
    this.secretsCache.set(path, {
      value: data,
      expiresAt: Date.now() + 3600000, // 1 hour
    });
  }

  /**
   * Get a secret
   */
  async getSecret<T>(path: string): Promise<T> {
    // Check cache first
    const cached = this.secretsCache.get(path);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as T;
    }

    // In production, this would call Vault API
    this.logger.debug(`Fetching secret from ${path}`);

    // For development, try environment variables
    const envKey = this.pathToEnvKey(path);
    const envValue = process.env[envKey];

    if (envValue) {
      try {
        const parsed = JSON.parse(envValue) as T;
        this.secretsCache.set(path, {
          value: parsed,
          expiresAt: Date.now() + 3600000,
        });
        return parsed;
      } catch {
        // Not JSON, return as string
        return envValue as T;
      }
    }

    throw new Error(`Secret not found: ${path}`);
  }

  /**
   * Get secret metadata
   */
  async getSecretMetadata(path: string): Promise<SecretMetadata> {
    // In production, this would call Vault API
    return {
      name: path.split('/').pop() || path,
      version: 1,
      createdAt: Date.now(),
    };
  }

  /**
   * Revoke a secret
   */
  async revokeSecret(path: string): Promise<void> {
    this.logger.warn(`Revoking secret at ${path}`);
    this.secretsCache.delete(path);
    // In production, this would call Vault API
  }

  /**
   * List secrets at a path
   */
  async listSecrets(path: string): Promise<string[]> {
    this.logger.debug(`Listing secrets at ${path}`);

    // In production, this would call Vault API
    const secrets: string[] = [];
    for (const key of this.secretsCache.keys()) {
      if (key.startsWith(path)) {
        secrets.push(key);
      }
    }
    return secrets;
  }

  /**
   * Clear the secrets cache
   */
  clearCache(): void {
    this.logger.info('Clearing secrets cache');
    this.secretsCache.clear();
  }

  /**
   * AppRole login (production auth method)
   */
  private async appRoleLogin(): Promise<string> {
    // In production, this would call Vault API
    throw new Error('AppRole login not implemented');
  }

  /**
   * Convert a Vault path to environment variable key
   */
  private pathToEnvKey(path: string): string {
    return path.toUpperCase().replace(/\//g, '_').replace(/-/g, '_');
  }
}
