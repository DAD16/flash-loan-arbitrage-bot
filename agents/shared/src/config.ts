/**
 * Configuration management for TypeScript agents
 */

import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// RPC provider configuration
export const RpcConfigSchema = z.object({
  name: z.string(),
  httpUrl: z.string().url(),
  wsUrl: z.string(),
  apiKey: z.string().optional(),
  priority: z.number().default(0),
  maxRetries: z.number().default(3),
  timeoutMs: z.number().default(5000),
});
export type RpcConfig = z.infer<typeof RpcConfigSchema>;

// Risk configuration
export const RiskConfigSchema = z.object({
  maxPositionSizeEth: z.number().positive().default(50),
  maxTotalExposureEth: z.number().positive().default(200),
  maxConcurrentPositions: z.number().int().positive().default(5),
  minProfitEth: z.number().positive().default(0.001),
  maxSlippageBps: z.number().int().positive().default(100),
  maxGasPriceGwei: z.number().positive().default(300),
});
export type RiskConfig = z.infer<typeof RiskConfigSchema>;

// Monitoring configuration
export const MonitoringConfigSchema = z.object({
  prometheusPort: z.number().int().default(9090),
  healthCheckPort: z.number().int().default(8080),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  metricsIntervalMs: z.number().int().default(1000),
});
export type MonitoringConfig = z.infer<typeof MonitoringConfigSchema>;

// Main configuration schema
export const MatrixConfigSchema = z.object({
  environment: z.enum(['development', 'staging', 'production']).default('development'),
  rpc: z.record(z.string(), RpcConfigSchema).default({}),
  risk: RiskConfigSchema.default({}),
  monitoring: MonitoringConfigSchema.default({}),
});
export type MatrixConfig = z.infer<typeof MatrixConfigSchema>;

// Default configuration
const defaultConfig: MatrixConfig = {
  environment: 'development',
  rpc: {},
  risk: {
    maxPositionSizeEth: 50,
    maxTotalExposureEth: 200,
    maxConcurrentPositions: 5,
    minProfitEth: 0.001,
    maxSlippageBps: 100,
    maxGasPriceGwei: 300,
  },
  monitoring: {
    prometheusPort: 9090,
    healthCheckPort: 8080,
    logLevel: 'info',
    metricsIntervalMs: 1000,
  },
};

// Configuration loader
class ConfigLoader {
  private config: MatrixConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): MatrixConfig {
    // Start with defaults
    let config = { ...defaultConfig };

    // Override with environment variables
    config = this.applyEnvOverrides(config);

    // Validate
    return MatrixConfigSchema.parse(config);
  }

  private applyEnvOverrides(config: MatrixConfig): MatrixConfig {
    // Environment
    if (process.env.MATRIX_ENVIRONMENT) {
      config.environment = process.env.MATRIX_ENVIRONMENT as MatrixConfig['environment'];
    }

    // Monitoring
    if (process.env.MATRIX_LOG_LEVEL) {
      config.monitoring.logLevel = process.env.MATRIX_LOG_LEVEL as MonitoringConfig['logLevel'];
    }
    if (process.env.MATRIX_PROMETHEUS_PORT) {
      config.monitoring.prometheusPort = parseInt(process.env.MATRIX_PROMETHEUS_PORT, 10);
    }

    // Risk
    if (process.env.MATRIX_MAX_POSITION_SIZE) {
      config.risk.maxPositionSizeEth = parseFloat(process.env.MATRIX_MAX_POSITION_SIZE);
    }
    if (process.env.MATRIX_MAX_GAS_PRICE_GWEI) {
      config.risk.maxGasPriceGwei = parseFloat(process.env.MATRIX_MAX_GAS_PRICE_GWEI);
    }

    return config;
  }

  get(): MatrixConfig {
    return this.config;
  }

  isProduction(): boolean {
    return this.config.environment === 'production';
  }

  isDevelopment(): boolean {
    return this.config.environment === 'development';
  }
}

// Singleton instance
let configInstance: ConfigLoader | null = null;

export function getConfig(): MatrixConfig {
  if (!configInstance) {
    configInstance = new ConfigLoader();
  }
  return configInstance.get();
}

export function isProduction(): boolean {
  if (!configInstance) {
    configInstance = new ConfigLoader();
  }
  return configInstance.isProduction();
}

// Required environment variable helper
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Optional environment variable with default
export function getEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

// Parse environment variable as number
export function getEnvNumber(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) return defaultValue;
  const parsed = parseFloat(value);
  if (isNaN(parsed)) return defaultValue;
  return parsed;
}

// Parse environment variable as boolean
export function getEnvBoolean(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}
