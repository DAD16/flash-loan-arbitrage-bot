/**
 * LINK - Communication Hub
 *
 * "Tank, I need an exit!"
 *
 * Maintains connections between all agents. Routes messages,
 * ensures delivery guarantees, and logs all communications.
 */

export { Link } from './router.js';
export { KafkaConnector } from './kafka.js';
export type { RouterConfig, KafkaConfig, Message, MessageHandler } from './types.js';
