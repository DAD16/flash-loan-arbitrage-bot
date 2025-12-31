/**
 * LINK types
 */

export interface RouterConfig {
  agentId: string;
  topics: string[];
  kafkaConfig?: KafkaConfig;
  maxRetries: number;
  retryDelayMs: number;
}

export interface KafkaConfig {
  brokers: string[];
  clientId: string;
  groupId: string;
  ssl?: boolean;
  sasl?: {
    mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512';
    username: string;
    password: string;
  };
}

export interface Message<T = unknown> {
  id: string;
  topic: string;
  source: string;
  target?: string; // undefined = broadcast
  payload: T;
  timestamp: number;
  correlationId?: string;
  replyTo?: string;
}

export type MessageHandler<T = unknown> = (message: Message<T>) => Promise<void>;

export interface TopicSubscription {
  topic: string;
  handler: MessageHandler;
  filter?: (message: Message) => boolean;
}

// Standard message topics
export const Topics = {
  PRICE_UPDATES: 'matrix.prices',
  OPPORTUNITIES: 'matrix.opportunities',
  EXECUTIONS: 'matrix.executions',
  AGENT_HEALTH: 'matrix.health',
  COMMANDS: 'matrix.commands',
  ALERTS: 'matrix.alerts',
} as const;

export type TopicName = (typeof Topics)[keyof typeof Topics];
