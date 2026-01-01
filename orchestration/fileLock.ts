/**
 * File Locking Utility for Multi-Instance Safety
 *
 * Prevents race conditions when multiple Claude Code instances
 * try to modify shared files like memory.md and state.json.
 *
 * Usage:
 *   const lock = await acquireLock('memory.md');
 *   try {
 *     // Modify the file
 *     await atomicWrite('memory.md', content);
 *   } finally {
 *     await releaseLock(lock);
 *   }
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync, renameSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { randomUUID } from 'crypto';

// Lock file directory
const LOCK_DIR = join(process.cwd(), '.locks');

// Lock timeout in milliseconds (30 seconds)
const LOCK_TIMEOUT_MS = 30000;

// Retry interval when waiting for lock (100ms)
const LOCK_RETRY_MS = 100;

// Maximum wait time for lock (10 seconds)
const MAX_WAIT_MS = 10000;

interface LockInfo {
  id: string;
  instance: string;
  file: string;
  acquiredAt: number;
  pid: number;
}

interface LockHandle {
  id: string;
  file: string;
  lockPath: string;
}

/**
 * Initialize lock directory
 */
function ensureLockDir(): void {
  if (!existsSync(LOCK_DIR)) {
    mkdirSync(LOCK_DIR, { recursive: true });
  }
}

/**
 * Get lock file path for a given file
 */
function getLockPath(file: string): string {
  // Sanitize the file path for use as a lock file name
  const sanitized = file.replace(/[\/\\:]/g, '_').replace(/\.\./g, '_');
  return join(LOCK_DIR, `${sanitized}.lock`);
}

/**
 * Check if a lock is stale (older than timeout)
 */
function isLockStale(lockPath: string): boolean {
  try {
    if (!existsSync(lockPath)) return true;

    const content = readFileSync(lockPath, 'utf-8');
    const lockInfo: LockInfo = JSON.parse(content);

    const age = Date.now() - lockInfo.acquiredAt;
    if (age > LOCK_TIMEOUT_MS) {
      console.warn(`[FileLock] Stale lock detected: ${lockPath} (age: ${age}ms)`);
      return true;
    }

    return false;
  } catch {
    return true; // Corrupt lock file, treat as stale
  }
}

/**
 * Acquire a lock on a file
 * @param file - The file path to lock (relative or absolute)
 * @param instanceName - Optional name for this instance (for debugging)
 * @returns Lock handle to use for releasing
 * @throws Error if lock cannot be acquired within MAX_WAIT_MS
 */
export async function acquireLock(
  file: string,
  instanceName: string = 'unknown'
): Promise<LockHandle> {
  ensureLockDir();

  const lockPath = getLockPath(file);
  const lockId = randomUUID();
  const startTime = Date.now();

  const lockInfo: LockInfo = {
    id: lockId,
    instance: instanceName,
    file: file,
    acquiredAt: Date.now(),
    pid: process.pid,
  };

  while (true) {
    // Check if lock exists and is not stale
    if (existsSync(lockPath) && !isLockStale(lockPath)) {
      // Lock is held by someone else
      const elapsed = Date.now() - startTime;
      if (elapsed > MAX_WAIT_MS) {
        const existingLock = JSON.parse(readFileSync(lockPath, 'utf-8')) as LockInfo;
        throw new Error(
          `Failed to acquire lock on ${file} after ${MAX_WAIT_MS}ms. ` +
          `Held by instance "${existingLock.instance}" (PID: ${existingLock.pid})`
        );
      }

      // Wait and retry
      await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
      continue;
    }

    // Try to acquire lock
    try {
      // Remove stale lock if exists
      if (existsSync(lockPath)) {
        unlinkSync(lockPath);
      }

      // Write lock file
      writeFileSync(lockPath, JSON.stringify(lockInfo, null, 2));

      // Verify we got the lock (double-check for race conditions)
      const verification = JSON.parse(readFileSync(lockPath, 'utf-8')) as LockInfo;
      if (verification.id === lockId) {
        console.log(`[FileLock] Acquired lock on ${file} (instance: ${instanceName})`);
        return {
          id: lockId,
          file: file,
          lockPath: lockPath,
        };
      }
    } catch (error) {
      // Another process may have grabbed the lock
      const elapsed = Date.now() - startTime;
      if (elapsed > MAX_WAIT_MS) {
        throw new Error(`Failed to acquire lock on ${file}: ${(error as Error).message}`);
      }
    }

    // Wait and retry
    await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
  }
}

/**
 * Release a lock
 * @param handle - Lock handle from acquireLock
 */
export async function releaseLock(handle: LockHandle): Promise<void> {
  try {
    if (existsSync(handle.lockPath)) {
      // Verify we own this lock before releasing
      const content = readFileSync(handle.lockPath, 'utf-8');
      const lockInfo: LockInfo = JSON.parse(content);

      if (lockInfo.id === handle.id) {
        unlinkSync(handle.lockPath);
        console.log(`[FileLock] Released lock on ${handle.file}`);
      } else {
        console.warn(`[FileLock] Lock on ${handle.file} owned by different instance, not releasing`);
      }
    }
  } catch (error) {
    console.error(`[FileLock] Error releasing lock: ${(error as Error).message}`);
  }
}

/**
 * Perform an atomic write to a file
 * Writes to a temporary file first, then renames to target
 * This prevents corruption if the process crashes during write
 *
 * @param filePath - Target file path
 * @param content - Content to write
 */
export function atomicWrite(filePath: string, content: string): void {
  const dir = dirname(filePath);
  const tempPath = join(dir, `.${randomUUID()}.tmp`);

  try {
    // Write to temp file
    writeFileSync(tempPath, content, 'utf-8');

    // Atomic rename
    renameSync(tempPath, filePath);
  } catch (error) {
    // Clean up temp file if rename failed
    try {
      if (existsSync(tempPath)) {
        unlinkSync(tempPath);
      }
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Read and write a file with locking
 * Convenience function for the common pattern of read-modify-write
 *
 * @param filePath - File to modify
 * @param modifier - Function that takes current content and returns new content
 * @param instanceName - Optional instance name for logging
 */
export async function modifyFileWithLock(
  filePath: string,
  modifier: (content: string) => string,
  instanceName: string = 'unknown'
): Promise<void> {
  const lock = await acquireLock(filePath, instanceName);

  try {
    const currentContent = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '';
    const newContent = modifier(currentContent);
    atomicWrite(filePath, newContent);
  } finally {
    await releaseLock(lock);
  }
}

/**
 * Update state.json with locking
 * @param updater - Function that modifies the state object
 * @param instanceName - Instance name for logging
 */
export async function updateStateJson(
  updater: (state: any) => any,
  instanceName: string = 'unknown'
): Promise<void> {
  const statePath = join(process.cwd(), 'state.json');

  await modifyFileWithLock(
    statePath,
    (content) => {
      const state = content ? JSON.parse(content) : {};
      const updated = updater(state);
      return JSON.stringify(updated, null, 2);
    },
    instanceName
  );
}

/**
 * Clean up stale locks
 * Should be called periodically or at startup
 */
export function cleanupStaleLocks(): number {
  ensureLockDir();

  let cleaned = 0;
  try {
    const files = require('fs').readdirSync(LOCK_DIR);
    for (const file of files) {
      if (file.endsWith('.lock')) {
        const lockPath = join(LOCK_DIR, file);
        if (isLockStale(lockPath)) {
          try {
            unlinkSync(lockPath);
            cleaned++;
            console.log(`[FileLock] Cleaned up stale lock: ${file}`);
          } catch {
            // Ignore errors during cleanup
          }
        }
      }
    }
  } catch {
    // Ignore errors
  }

  return cleaned;
}

// Export types
export type { LockHandle, LockInfo };
