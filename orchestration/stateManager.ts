/**
 * State Manager - Safe Multi-Instance State Management
 *
 * This module provides thread-safe access to shared state files:
 * - state.json: Instance coordination and status
 * - memory.md: Session notes and project state
 *
 * IMPORTANT: Always use these functions instead of direct file access
 * to prevent crashes when multiple Claude Code instances are running.
 *
 * Usage:
 *   import { updateInstanceStatus, readState, appendToMemory } from './stateManager';
 *
 *   // Update your instance status
 *   await updateInstanceStatus('dashboard', { status: 'working', current_task: 'Building UI' });
 *
 *   // Append to memory.md
 *   await appendToMemory('## Completed\n- Fixed the bug');
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  acquireLock,
  releaseLock,
  atomicWrite,
  cleanupStaleLocks,
  type LockHandle,
} from './fileLock';

// Project root directory
const PROJECT_ROOT = join(__dirname, '..');

// Shared file paths
const STATE_JSON_PATH = join(PROJECT_ROOT, 'state.json');
const MEMORY_MD_PATH = join(PROJECT_ROOT, 'memory.md');

// Instance names for logging
type InstanceName = 'root' | 'core' | 'agents' | 'analysis' | 'contracts' | 'dashboard' | 'hotpath';

/**
 * State.json structure
 */
interface InstanceState {
  status: 'idle' | 'working' | 'blocked' | 'waiting_for_input';
  current_task: string | null;
  last_active: string | null;
}

interface SharedDecision {
  date: string;
  decision: string;
  made_by: string;
  affects: string[];
}

interface CrossScopeRequest {
  from: string;
  to: string;
  request: string;
  created_at: string;
  status: 'pending' | 'in_progress' | 'completed';
}

interface ProjectState {
  version: string;
  last_updated: string;
  last_updated_by: string;
  instances: Record<InstanceName, InstanceState>;
  locked_files: Record<string, string>;
  shared_decisions: SharedDecision[];
  pending_cross_scope_requests: CrossScopeRequest[];
  notes: Record<string, string>;
}

/**
 * Read state.json (no locking needed for reads)
 */
export function readState(): ProjectState {
  try {
    if (!existsSync(STATE_JSON_PATH)) {
      return getDefaultState();
    }
    const content = readFileSync(STATE_JSON_PATH, 'utf-8');
    return JSON.parse(content) as ProjectState;
  } catch (error) {
    console.error('[StateManager] Error reading state.json:', error);
    return getDefaultState();
  }
}

/**
 * Get default state structure
 */
function getDefaultState(): ProjectState {
  return {
    version: '1.0',
    last_updated: new Date().toISOString(),
    last_updated_by: 'system',
    instances: {
      root: { status: 'idle', current_task: null, last_active: null },
      core: { status: 'idle', current_task: null, last_active: null },
      agents: { status: 'idle', current_task: null, last_active: null },
      analysis: { status: 'idle', current_task: null, last_active: null },
      contracts: { status: 'idle', current_task: null, last_active: null },
      dashboard: { status: 'idle', current_task: null, last_active: null },
      hotpath: { status: 'idle', current_task: null, last_active: null },
    },
    locked_files: {},
    shared_decisions: [],
    pending_cross_scope_requests: [],
    notes: {},
  };
}

/**
 * Update state.json with file locking
 * @param updater - Function that modifies the state object
 * @param instanceName - Which instance is making the update
 */
export async function updateState(
  updater: (state: ProjectState) => ProjectState,
  instanceName: InstanceName = 'root'
): Promise<void> {
  const lock = await acquireLock('state.json', instanceName);

  try {
    const currentState = readState();
    const updatedState = updater(currentState);

    // Update metadata
    updatedState.last_updated = new Date().toISOString();
    updatedState.last_updated_by = instanceName;

    atomicWrite(STATE_JSON_PATH, JSON.stringify(updatedState, null, 2) + '\n');
    console.log(`[StateManager] State updated by ${instanceName}`);
  } finally {
    await releaseLock(lock);
  }
}

/**
 * Update a specific instance's status
 */
export async function updateInstanceStatus(
  instanceName: InstanceName,
  status: Partial<InstanceState>
): Promise<void> {
  await updateState((state) => {
    state.instances[instanceName] = {
      ...state.instances[instanceName],
      ...status,
      last_active: new Date().toISOString(),
    };
    return state;
  }, instanceName);
}

/**
 * Mark instance as working on a task
 */
export async function startTask(
  instanceName: InstanceName,
  taskDescription: string
): Promise<void> {
  await updateInstanceStatus(instanceName, {
    status: 'working',
    current_task: taskDescription,
  });
}

/**
 * Mark instance as idle (task completed)
 */
export async function endTask(instanceName: InstanceName): Promise<void> {
  await updateInstanceStatus(instanceName, {
    status: 'idle',
    current_task: null,
  });
}

/**
 * Lock a file for exclusive access (registered in state.json)
 */
export async function lockFileInState(
  filePath: string,
  instanceName: InstanceName
): Promise<void> {
  await updateState((state) => {
    state.locked_files[filePath] = instanceName;
    return state;
  }, instanceName);
}

/**
 * Unlock a file (remove from state.json)
 */
export async function unlockFileInState(
  filePath: string,
  instanceName: InstanceName
): Promise<void> {
  await updateState((state) => {
    if (state.locked_files[filePath] === instanceName) {
      delete state.locked_files[filePath];
    }
    return state;
  }, instanceName);
}

/**
 * Add a shared decision
 */
export async function addSharedDecision(
  decision: string,
  madeBy: InstanceName,
  affects: string[]
): Promise<void> {
  await updateState((state) => {
    state.shared_decisions.push({
      date: new Date().toISOString().split('T')[0],
      decision,
      made_by: madeBy,
      affects,
    });
    return state;
  }, madeBy);
}

/**
 * Add a cross-scope request
 */
export async function addCrossScopeRequest(
  from: InstanceName,
  to: string,
  request: string
): Promise<void> {
  await updateState((state) => {
    state.pending_cross_scope_requests.push({
      from,
      to,
      request,
      created_at: new Date().toISOString(),
      status: 'pending',
    });
    return state;
  }, from);
}

/**
 * Read memory.md
 */
export function readMemory(): string {
  try {
    if (!existsSync(MEMORY_MD_PATH)) {
      return '';
    }
    return readFileSync(MEMORY_MD_PATH, 'utf-8');
  } catch (error) {
    console.error('[StateManager] Error reading memory.md:', error);
    return '';
  }
}

/**
 * Append content to memory.md with locking
 * @param content - Content to append
 * @param instanceName - Which instance is appending
 */
export async function appendToMemory(
  content: string,
  instanceName: InstanceName = 'root'
): Promise<void> {
  const lock = await acquireLock('memory.md', instanceName);

  try {
    const currentContent = readMemory();
    const newContent = currentContent + '\n' + content;
    atomicWrite(MEMORY_MD_PATH, newContent);
    console.log(`[StateManager] Memory updated by ${instanceName}`);
  } finally {
    await releaseLock(lock);
  }
}

/**
 * Replace a section in memory.md
 * @param sectionHeader - Header to find (e.g., "## Current Status")
 * @param newContent - New content for that section
 * @param instanceName - Which instance is updating
 */
export async function updateMemorySection(
  sectionHeader: string,
  newContent: string,
  instanceName: InstanceName = 'root'
): Promise<void> {
  const lock = await acquireLock('memory.md', instanceName);

  try {
    const currentContent = readMemory();
    const headerRegex = new RegExp(`(${sectionHeader}\\n)([\\s\\S]*?)(?=\\n## |$)`);

    let updatedContent: string;
    if (headerRegex.test(currentContent)) {
      // Replace existing section
      updatedContent = currentContent.replace(headerRegex, `$1${newContent}\n`);
    } else {
      // Append new section
      updatedContent = currentContent + `\n${sectionHeader}\n${newContent}\n`;
    }

    atomicWrite(MEMORY_MD_PATH, updatedContent);
    console.log(`[StateManager] Memory section "${sectionHeader}" updated by ${instanceName}`);
  } finally {
    await releaseLock(lock);
  }
}

/**
 * Initialize the state manager (call at startup)
 * Cleans up stale locks and ensures state.json exists
 */
export async function initStateManager(): Promise<void> {
  console.log('[StateManager] Initializing...');

  // Clean up any stale locks from crashed processes
  const cleaned = cleanupStaleLocks();
  if (cleaned > 0) {
    console.log(`[StateManager] Cleaned up ${cleaned} stale lock(s)`);
  }

  // Ensure state.json exists
  if (!existsSync(STATE_JSON_PATH)) {
    const lock = await acquireLock('state.json', 'root');
    try {
      atomicWrite(STATE_JSON_PATH, JSON.stringify(getDefaultState(), null, 2) + '\n');
      console.log('[StateManager] Created default state.json');
    } finally {
      await releaseLock(lock);
    }
  }

  console.log('[StateManager] Initialized successfully');
}

/**
 * Get status of all instances
 */
export function getAllInstanceStatus(): Record<InstanceName, InstanceState> {
  const state = readState();
  return state.instances;
}

/**
 * Check if any instance is currently working
 */
export function isAnyInstanceWorking(): boolean {
  const instances = getAllInstanceStatus();
  return Object.values(instances).some((i) => i.status === 'working');
}

/**
 * Get list of currently locked files
 */
export function getLockedFiles(): Record<string, string> {
  const state = readState();
  return state.locked_files;
}

// Export types
export type { InstanceName, InstanceState, ProjectState, SharedDecision, CrossScopeRequest };
