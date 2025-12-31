/**
 * KEYMAKER - Secrets and Authentication Management
 *
 * "I have been doing this for a very long time. It is what I do."
 *
 * Manages keys to access all systems. Provides secure storage of private keys,
 * API credentials, and handles secret rotation.
 */

export { Keymaker } from './vault.js';
export { SecretRotator } from './rotation.js';
export type { VaultConfig, SecretConfig, RotationPolicy } from './types.js';
