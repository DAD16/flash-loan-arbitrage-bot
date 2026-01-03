/**
 * Orchestration Module - Multi-Instance Coordination
 *
 * This module provides tools for safe multi-instance operation:
 * - File locking to prevent concurrent write conflicts
 * - State management for coordination between instances
 * - Crash protection and monitoring
 *
 * Quick Start:
 *   import { updateState, appendToMemory, startTask, endTask } from './orchestration';
 *
 *   await startTask('dashboard', 'Building UI');
 *   // ... do work ...
 *   await endTask('dashboard');
 */

// File locking primitives
export {
  acquireLock,
  releaseLock,
  atomicWrite,
  modifyFileWithLock,
  updateStateJson,
  cleanupStaleLocks,
  type LockHandle,
  type LockInfo,
} from './fileLock';

// High-level state management
export {
  readState,
  updateState,
  updateInstanceStatus,
  startTask,
  endTask,
  lockFileInState,
  unlockFileInState,
  addSharedDecision,
  addCrossScopeRequest,
  readMemory,
  appendToMemory,
  updateMemorySection,
  initStateManager,
  getAllInstanceStatus,
  isAnyInstanceWorking,
  getLockedFiles,
  type InstanceName,
  type InstanceState,
  type ProjectState,
  type SharedDecision,
  type CrossScopeRequest,
} from './stateManager';

// Crash protection (for programmatic use)
export {
  runCheck,
  cleanupStaleLocks as cleanupLocks,
  validateAndRecoverState,
  checkFileContention,
} from './crashProtection';
