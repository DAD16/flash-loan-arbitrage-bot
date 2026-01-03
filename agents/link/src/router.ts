/**
 * LINK - Message Router
 */

import { AgentLogger, AgentBase, AgentStartupResult, AgentTask } from '@matrix/shared';
import { KafkaConnector } from './kafka.js';
import type {
  RouterConfig,
  Message,
  MessageHandler,
  TopicSubscription,
} from './types.js';

export class Link extends AgentBase {
  private logger: AgentLogger;
  private config: RouterConfig;
  private kafka: KafkaConnector | null = null;
  private subscriptions: Map<string, TopicSubscription[]>;
  private pendingMessages: Map<string, Message>;
  private messageCounter: number;
  private running: boolean;

  constructor(config: RouterConfig) {
    this.logger = new AgentLogger('LINK');
    this.config = config;
    this.subscriptions = new Map();
    this.pendingMessages = new Map();
    this.messageCounter = 0;
    this.running = false;

    // Initialize Kafka if configured
    if (config.kafkaConfig) {
      this.kafka = new KafkaConnector(config.kafkaConfig);
    }

    this.logger.info('Link initialized', { chain: config.agentId });
  }

  /**
   * Start the message router
   */
  async start(): Promise<void> {
    this.logger.info('Starting message router...');
    this.running = true;

    if (this.kafka) {
      await this.kafka.connect();

      // Subscribe to configured topics
      for (const topic of this.config.topics) {
        await this.kafka.subscribe(topic, (message) => this.handleMessage(message));
      }
    }

    this.logger.info('Message router started');
  }

  /**
   * Stop the message router
   */
  async stop(): Promise<void> {
    this.logger.info('Stopping message router...');
    this.running = false;

    if (this.kafka) {
      await this.kafka.disconnect();
    }

    this.logger.info('Message router stopped');
  }

  /**
   * Subscribe to a topic
   */
  subscribe<T>(
    topic: string,
    handler: MessageHandler<T>,
    filter?: (message: Message<T>) => boolean
  ): void {
    const subscription: TopicSubscription = filter
      ? {
          topic,
          handler: handler as MessageHandler,
          filter: filter as (message: Message) => boolean,
        }
      : {
          topic,
          handler: handler as MessageHandler,
        };

    const existing = this.subscriptions.get(topic) || [];
    existing.push(subscription);
    this.subscriptions.set(topic, existing);

    this.logger.debug(`Subscribed to topic: ${topic}`);
  }

  /**
   * Unsubscribe from a topic
   */
  unsubscribe(topic: string, handler: MessageHandler): void {
    const existing = this.subscriptions.get(topic) || [];
    const filtered = existing.filter((s) => s.handler !== handler);
    this.subscriptions.set(topic, filtered);

    this.logger.debug(`Unsubscribed from topic: ${topic}`);
  }

  /**
   * Publish a message
   */
  async publish<T>(topic: string, payload: T, options?: {
    target?: string;
    correlationId?: string;
    replyTo?: string;
  }): Promise<string> {
    const messageId = this.generateMessageId();

    const message: Message<T> = {
      id: messageId,
      topic,
      source: this.config.agentId,
      payload,
      timestamp: Date.now(),
    };

    // Only add optional properties if they are defined
    if (options?.target) message.target = options.target;
    if (options?.correlationId) message.correlationId = options.correlationId;
    if (options?.replyTo) message.replyTo = options.replyTo;

    await this.sendMessage(message);

    return messageId;
  }

  /**
   * Send a request and wait for response
   */
  async request<TReq, TRes>(
    topic: string,
    payload: TReq,
    target: string,
    timeoutMs: number = 5000
  ): Promise<TRes> {
    const correlationId = this.generateMessageId();
    const replyTo = `${this.config.agentId}.replies`;

    // Create response promise
    const responsePromise = new Promise<TRes>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingMessages.delete(correlationId);
        reject(new Error(`Request timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      // Subscribe to reply topic temporarily
      const handler: MessageHandler<TRes> = async (message) => {
        if (message.correlationId === correlationId) {
          clearTimeout(timeout);
          this.pendingMessages.delete(correlationId);
          resolve(message.payload);
        }
      };

      this.subscribe(replyTo, handler, (m) => m.correlationId === correlationId);
    });

    // Send request
    await this.publish(topic, payload, {
      target,
      correlationId,
      replyTo,
    });

    return responsePromise;
  }

  /**
   * Reply to a message
   */
  async reply<T>(originalMessage: Message, payload: T): Promise<void> {
    if (!originalMessage.replyTo) {
      this.logger.warn('Cannot reply: no replyTo specified');
      return;
    }

    const options: { target: string; correlationId?: string } = {
      target: originalMessage.source,
    };
    if (originalMessage.correlationId) {
      options.correlationId = originalMessage.correlationId;
    }

    await this.publish(originalMessage.replyTo, payload, options);
  }

  /**
   * Broadcast a message to all subscribers
   */
  async broadcast<T>(topic: string, payload: T): Promise<string> {
    return this.publish(topic, payload);
  }

  /**
   * Handle incoming message
   */
  private async handleMessage(message: Message): Promise<void> {
    // Check if message is for this agent
    if (message.target && message.target !== this.config.agentId) {
      return;
    }

    const subscriptions = this.subscriptions.get(message.topic) || [];

    for (const subscription of subscriptions) {
      // Apply filter if present
      if (subscription.filter && !subscription.filter(message)) {
        continue;
      }

      try {
        await subscription.handler(message);
      } catch (error) {
        this.logger.error('Handler error', {
          error: error as Error,
          txHash: message.id,
        });
      }
    }
  }

  /**
   * Send a message via Kafka or local routing
   */
  private async sendMessage(message: Message): Promise<void> {
    this.logger.debug(`Sending message to ${message.topic}`, {
      txHash: message.id,
    });

    if (this.kafka) {
      await this.kafka.produce(message.topic, message);
    } else {
      // Local routing (for single-process mode)
      await this.handleMessage(message);
    }
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    this.messageCounter++;
    return `${this.config.agentId}-${Date.now()}-${this.messageCounter}`;
  }

  /**
   * Get router stats
   */
  getStats(): {
    subscriptions: number;
    pendingRequests: number;
    messagesSent: number;
    isRunning: boolean;
  } {
    let totalSubscriptions = 0;
    for (const subs of this.subscriptions.values()) {
      totalSubscriptions += subs.length;
    }

    return {
      subscriptions: totalSubscriptions,
      pendingRequests: this.pendingMessages.size,
      messagesSent: this.messageCounter,
      isRunning: this.running,
    };
  }
}
