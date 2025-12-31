/**
 * LINK - Kafka Connector
 */

import { Kafka, Consumer, Producer, logLevel, type KafkaConfig as KafkaJsConfig } from 'kafkajs';
import { AgentLogger } from '@matrix/shared';
import type { KafkaConfig, Message, MessageHandler } from './types.js';

export class KafkaConnector {
  private logger: AgentLogger;
  private kafka: Kafka;
  private producer: Producer | null = null;
  private consumer: Consumer | null = null;
  private handlers: Map<string, MessageHandler[]>;
  private isConnected: boolean;

  constructor(config: KafkaConfig) {
    this.logger = new AgentLogger('LINK-KAFKA');
    this.handlers = new Map();
    this.isConnected = false;

    // Build Kafka config, handling optional properties to satisfy exactOptionalPropertyTypes
    const kafkaConfig = {
      clientId: config.clientId,
      brokers: config.brokers,
      logLevel: logLevel.WARN,
      retry: {
        initialRetryTime: 100,
        retries: 8,
      },
      ...(config.ssl !== undefined ? { ssl: config.ssl } : {}),
      ...(config.sasl ? { sasl: config.sasl } : {}),
    } as KafkaJsConfig;

    this.kafka = new Kafka(kafkaConfig);

    this.producer = this.kafka.producer();
    this.consumer = this.kafka.consumer({ groupId: config.groupId });
  }

  /**
   * Connect to Kafka
   */
  async connect(): Promise<void> {
    this.logger.info('Connecting to Kafka...');

    try {
      await this.producer?.connect();
      await this.consumer?.connect();
      this.isConnected = true;

      // Start consuming
      await this.consumer?.run({
        eachMessage: async ({ topic, message }) => {
          await this.handleMessage(topic, message);
        },
      });

      this.logger.info('Connected to Kafka');
    } catch (error) {
      this.logger.error('Failed to connect to Kafka', { error: error as Error });
      throw error;
    }
  }

  /**
   * Disconnect from Kafka
   */
  async disconnect(): Promise<void> {
    this.logger.info('Disconnecting from Kafka...');

    try {
      await this.consumer?.disconnect();
      await this.producer?.disconnect();
      this.isConnected = false;
      this.logger.info('Disconnected from Kafka');
    } catch (error) {
      this.logger.error('Error disconnecting from Kafka', { error: error as Error });
    }
  }

  /**
   * Subscribe to a topic
   */
  async subscribe(topic: string, handler: MessageHandler): Promise<void> {
    const existing = this.handlers.get(topic) || [];
    existing.push(handler);
    this.handlers.set(topic, existing);

    await this.consumer?.subscribe({ topic, fromBeginning: false });
    this.logger.debug(`Subscribed to Kafka topic: ${topic}`);
  }

  /**
   * Produce a message
   */
  async produce(topic: string, message: Message): Promise<void> {
    if (!this.isConnected || !this.producer) {
      throw new Error('Not connected to Kafka');
    }

    await this.producer.send({
      topic,
      messages: [
        {
          key: message.id,
          value: JSON.stringify(message),
          headers: {
            source: message.source,
            timestamp: message.timestamp.toString(),
          },
        },
      ],
    });
  }

  /**
   * Handle incoming Kafka message
   */
  private async handleMessage(
    topic: string,
    kafkaMessage: { value: Buffer | null }
  ): Promise<void> {
    if (!kafkaMessage.value) return;

    try {
      const message: Message = JSON.parse(kafkaMessage.value.toString());
      const handlers = this.handlers.get(topic) || [];

      for (const handler of handlers) {
        try {
          await handler(message);
        } catch (error) {
          this.logger.error('Handler error', {
            error: error as Error,
            txHash: message.id,
          });
        }
      }
    } catch (error) {
      this.logger.error('Failed to parse Kafka message', { error: error as Error });
    }
  }

  /**
   * Check if connected
   */
  connected(): boolean {
    return this.isConnected;
  }
}
