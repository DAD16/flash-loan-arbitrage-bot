/**
 * Logging utilities for Matrix agents
 */

import winston from 'winston';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Custom log format
const logFormat = printf(({ level, message, timestamp, agent, ...meta }) => {
  const agentPrefix = agent ? `[${agent}]` : '';
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} ${level} ${agentPrefix} ${message}${metaStr}`;
});

// Create base logger
export function createLogger(agentName: string): winston.Logger {
  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: combine(
      errors({ stack: true }),
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      logFormat
    ),
    defaultMeta: { agent: agentName },
    transports: [
      new winston.transports.Console({
        format: combine(colorize({ all: true }), logFormat),
      }),
    ],
  });
}

// Structured logging helpers
export interface LogContext {
  chain?: string;
  dex?: string;
  pool?: string;
  txHash?: string;
  opportunityId?: string;
  latencyMs?: number;
  profitWei?: string;
  error?: Error;
}

export class AgentLogger {
  private logger: winston.Logger;

  constructor(agentName: string) {
    this.logger = createLogger(agentName);
  }

  info(message: string, context?: LogContext): void {
    this.logger.info(message, this.sanitizeContext(context));
  }

  warn(message: string, context?: LogContext): void {
    this.logger.warn(message, this.sanitizeContext(context));
  }

  error(message: string, context?: LogContext): void {
    this.logger.error(message, this.sanitizeContext(context));
  }

  debug(message: string, context?: LogContext): void {
    this.logger.debug(message, this.sanitizeContext(context));
  }

  // Log with timing
  timed<T>(operation: string, fn: () => T, context?: LogContext): T {
    const start = performance.now();
    try {
      const result = fn();
      const latencyMs = performance.now() - start;
      this.info(`${operation} completed`, { ...context, latencyMs });
      return result;
    } catch (error) {
      const latencyMs = performance.now() - start;
      this.error(`${operation} failed`, {
        ...context,
        latencyMs,
        error: error as Error,
      });
      throw error;
    }
  }

  // Async version of timed
  async timedAsync<T>(
    operation: string,
    fn: () => Promise<T>,
    context?: LogContext
  ): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const latencyMs = performance.now() - start;
      this.info(`${operation} completed`, { ...context, latencyMs });
      return result;
    } catch (error) {
      const latencyMs = performance.now() - start;
      this.error(`${operation} failed`, {
        ...context,
        latencyMs,
        error: error as Error,
      });
      throw error;
    }
  }

  private sanitizeContext(context?: LogContext): Record<string, unknown> {
    if (!context) return {};

    const sanitized: Record<string, unknown> = { ...context };

    // Convert Error to string representation
    if (context.error) {
      sanitized.error = context.error.message;
      sanitized.stack = context.error.stack;
    }

    return sanitized;
  }
}
