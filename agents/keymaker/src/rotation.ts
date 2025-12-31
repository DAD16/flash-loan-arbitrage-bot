/**
 * KEYMAKER - Secret Rotation
 */

import { AgentLogger } from '@matrix/shared';
import type { Keymaker } from './vault.js';
import type { RotationPolicy } from './types.js';

type RotationCallback = (secretName: string, newValue: string) => void;

export class SecretRotator {
  private logger: AgentLogger;
  private keymaker: Keymaker;
  private policies: Map<string, RotationPolicy>;
  private timers: Map<string, ReturnType<typeof setInterval>>;
  private callbacks: RotationCallback[];
  private isRunning: boolean;

  constructor(keymaker: Keymaker) {
    this.logger = new AgentLogger('KEYMAKER-ROTATOR');
    this.keymaker = keymaker;
    this.policies = new Map();
    this.timers = new Map();
    this.callbacks = [];
    this.isRunning = false;
  }

  /**
   * Register a rotation policy
   */
  registerPolicy(policy: RotationPolicy): void {
    this.logger.info(`Registering rotation policy for ${policy.secretName}`);
    this.policies.set(policy.secretName, policy);

    if (this.isRunning) {
      this.scheduleRotation(policy);
    }
  }

  /**
   * Register a callback for rotation events
   */
  onRotation(callback: RotationCallback): void {
    this.callbacks.push(callback);
  }

  /**
   * Start the rotation scheduler
   */
  start(): void {
    this.logger.info('Starting secret rotation scheduler');
    this.isRunning = true;

    for (const policy of this.policies.values()) {
      this.scheduleRotation(policy);
    }
  }

  /**
   * Stop the rotation scheduler
   */
  stop(): void {
    this.logger.info('Stopping secret rotation scheduler');
    this.isRunning = false;

    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();
  }

  /**
   * Force rotate a specific secret
   */
  async rotateNow(secretName: string): Promise<void> {
    const policy = this.policies.get(secretName);
    if (!policy) {
      throw new Error(`No rotation policy found for ${secretName}`);
    }

    await this.executeRotation(policy);
  }

  /**
   * Get rotation status for all secrets
   */
  getStatus(): Array<{
    secretName: string;
    intervalHours: number;
    nextRotation: Date;
  }> {
    return Array.from(this.policies.values()).map((policy) => ({
      secretName: policy.secretName,
      intervalHours: policy.intervalHours,
      nextRotation: new Date(Date.now() + policy.intervalHours * 3600000),
    }));
  }

  /**
   * Schedule rotation for a policy
   */
  private scheduleRotation(policy: RotationPolicy): void {
    // Clear existing timer if any
    const existingTimer = this.timers.get(policy.secretName);
    if (existingTimer) {
      clearInterval(existingTimer);
    }

    const intervalMs = policy.intervalHours * 3600000;

    const timer = setInterval(async () => {
      if (this.isRunning) {
        await this.executeRotation(policy);
      }
    }, intervalMs);

    this.timers.set(policy.secretName, timer);

    this.logger.info(
      `Scheduled rotation for ${policy.secretName} every ${policy.intervalHours} hours`
    );
  }

  /**
   * Execute rotation for a policy
   */
  private async executeRotation(policy: RotationPolicy): Promise<void> {
    this.logger.info(`Rotating secret: ${policy.secretName}`);

    try {
      let newValue: string;

      if (policy.rotationFn) {
        // Use custom rotation function
        newValue = await policy.rotationFn();
      } else {
        // Generate a new random value
        newValue = this.generateSecureRandom();
      }

      // Store the new secret
      await this.keymaker.storeSecret(
        `secrets/${policy.secretName}`,
        { value: newValue, rotatedAt: Date.now() }
      );

      // Notify callbacks
      if (policy.notifyOnRotation) {
        this.notifyCallbacks(policy.secretName, newValue);
      }

      this.logger.info(`Successfully rotated ${policy.secretName}`);
    } catch (error) {
      this.logger.error(`Failed to rotate ${policy.secretName}`, {
        error: error as Error,
      });
    }
  }

  /**
   * Notify all callbacks about rotation
   */
  private notifyCallbacks(secretName: string, newValue: string): void {
    for (const callback of this.callbacks) {
      try {
        callback(secretName, newValue);
      } catch (error) {
        this.logger.error('Rotation callback error', { error: error as Error });
      }
    }
  }

  /**
   * Generate a cryptographically secure random string
   */
  private generateSecureRandom(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
}
