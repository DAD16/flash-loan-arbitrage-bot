/**
 * MEROVINGIAN - Mempool Monitor
 *
 * "I am the Merovingian. I have survived your predecessors, and I will survive you."
 *
 * Trafficker of pending transaction information. Monitors mempools across
 * all supported chains to detect MEV opportunities and protect against
 * frontrunning.
 */

export { Merovingian } from './monitor.js';
export { MempoolDetector } from './detector.js';
export type { MempoolConfig, DetectorConfig } from './types.js';
