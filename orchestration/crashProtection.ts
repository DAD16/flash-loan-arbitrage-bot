/**
 * Crash Protection Daemon
 *
 * Monitors the multi-instance Claude Code environment and prevents crashes by:
 * 1. Cleaning up stale file locks automatically
 * 2. Detecting and killing zombie Node processes
 * 3. Monitoring file contention and alerting
 * 4. Auto-recovering from corrupted state files
 * 5. Logging all incidents for debugging
 *
 * Usage:
 *   # Start the daemon (runs in background)
 *   npx tsx orchestration/crashProtection.ts start
 *
 *   # Check status
 *   npx tsx orchestration/crashProtection.ts status
 *
 *   # Manual cleanup
 *   npx tsx orchestration/crashProtection.ts cleanup
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, unlinkSync, appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Paths
const PROJECT_ROOT = join(__dirname, '..');
const LOCK_DIR = join(PROJECT_ROOT, '.locks');
const LOGS_DIR = join(PROJECT_ROOT, 'scripts', 'logs');
const STATE_JSON_PATH = join(PROJECT_ROOT, 'state.json');
const MEMORY_MD_PATH = join(PROJECT_ROOT, 'memory.md');
const CRASH_LOG_PATH = join(LOGS_DIR, 'crash-monitor.log');

// Configuration
const LOCK_TIMEOUT_MS = 30000; // 30 seconds
const CHECK_INTERVAL_MS = 5000; // 5 seconds
const MAX_FILE_CONTENTION_EVENTS = 5; // Alert after this many contentions in a row

interface LockInfo {
  id: string;
  instance: string;
  file: string;
  acquiredAt: number;
  pid: number;
}

interface MonitorState {
  startedAt: string;
  lastCheck: string;
  staleLocksCleaned: number;
  contentionEvents: number;
  zombiesKilled: number;
  stateRecoveries: number;
  errors: string[];
}

let monitorState: MonitorState = {
  startedAt: new Date().toISOString(),
  lastCheck: new Date().toISOString(),
  staleLocksCleaned: 0,
  contentionEvents: 0,
  zombiesKilled: 0,
  stateRecoveries: 0,
  errors: [],
};

let consecutiveContentions = 0;

/**
 * Ensure directories exist
 */
function ensureDirectories(): void {
  if (!existsSync(LOCK_DIR)) {
    mkdirSync(LOCK_DIR, { recursive: true });
  }
  if (!existsSync(LOGS_DIR)) {
    mkdirSync(LOGS_DIR, { recursive: true });
  }
}

/**
 * Log a message to the crash monitor log
 */
function log(level: 'INFO' | 'WARN' | 'ERROR' | 'ALERT', message: string): void {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] [${level}] ${message}\n`;

  // Console output with colors
  const colors: Record<string, string> = {
    INFO: '\x1b[36m',   // Cyan
    WARN: '\x1b[33m',   // Yellow
    ERROR: '\x1b[31m',  // Red
    ALERT: '\x1b[35m',  // Magenta
  };
  const reset = '\x1b[0m';
  console.log(`${colors[level]}[${level}]${reset} ${message}`);

  // File output
  try {
    appendFileSync(CRASH_LOG_PATH, logLine);
  } catch {
    // Ignore log write errors
  }
}

/**
 * Check if a process is running by PID
 */
async function isProcessRunning(pid: number): Promise<boolean> {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execAsync(`tasklist /FI "PID eq ${pid}" /NH`);
      return stdout.includes(pid.toString());
    } else {
      process.kill(pid, 0);
      return true;
    }
  } catch {
    return false;
  }
}

/**
 * Clean up stale lock files
 */
async function cleanupStaleLocks(): Promise<number> {
  let cleaned = 0;

  try {
    if (!existsSync(LOCK_DIR)) {
      return 0;
    }

    const files = readdirSync(LOCK_DIR);

    for (const file of files) {
      if (!file.endsWith('.lock')) continue;

      const lockPath = join(LOCK_DIR, file);

      try {
        const content = readFileSync(lockPath, 'utf-8');
        const lockInfo: LockInfo = JSON.parse(content);

        const age = Date.now() - lockInfo.acquiredAt;
        const isStale = age > LOCK_TIMEOUT_MS;
        const processAlive = await isProcessRunning(lockInfo.pid);

        if (isStale || !processAlive) {
          unlinkSync(lockPath);
          cleaned++;

          const reason = !processAlive ? 'process dead' : 'lock expired';
          log('WARN', `Cleaned stale lock: ${file} (${reason}, instance: ${lockInfo.instance}, age: ${Math.round(age / 1000)}s)`);
        }
      } catch (error) {
        // Corrupt lock file, remove it
        try {
          unlinkSync(lockPath);
          cleaned++;
          log('WARN', `Removed corrupt lock file: ${file}`);
        } catch {
          // Ignore
        }
      }
    }
  } catch (error) {
    log('ERROR', `Error cleaning locks: ${(error as Error).message}`);
  }

  return cleaned;
}

/**
 * Check for file contention (multiple locks on same file)
 */
function checkFileContention(): string[] {
  const contentions: string[] = [];

  try {
    if (!existsSync(LOCK_DIR)) {
      return [];
    }

    const files = readdirSync(LOCK_DIR);
    const locksByFile: Record<string, LockInfo[]> = {};

    for (const file of files) {
      if (!file.endsWith('.lock')) continue;

      const lockPath = join(LOCK_DIR, file);

      try {
        const content = readFileSync(lockPath, 'utf-8');
        const lockInfo: LockInfo = JSON.parse(content);

        if (!locksByFile[lockInfo.file]) {
          locksByFile[lockInfo.file] = [];
        }
        locksByFile[lockInfo.file].push(lockInfo);
      } catch {
        // Ignore corrupt files
      }
    }

    // Check for contentions
    for (const [file, locks] of Object.entries(locksByFile)) {
      if (locks.length > 1) {
        const instances = locks.map((l) => l.instance).join(', ');
        contentions.push(`${file}: locked by ${locks.length} instances (${instances})`);
      }
    }
  } catch (error) {
    log('ERROR', `Error checking contention: ${(error as Error).message}`);
  }

  return contentions;
}

/**
 * Validate and recover state.json if corrupted
 */
function validateAndRecoverState(): boolean {
  try {
    if (!existsSync(STATE_JSON_PATH)) {
      log('WARN', 'state.json missing, will be created on next access');
      return true;
    }

    const content = readFileSync(STATE_JSON_PATH, 'utf-8');

    try {
      const state = JSON.parse(content);

      // Validate required fields
      if (!state.version || !state.instances) {
        throw new Error('Missing required fields');
      }

      return true;
    } catch (parseError) {
      log('ERROR', `state.json is corrupted: ${(parseError as Error).message}`);

      // Create backup
      const backupPath = STATE_JSON_PATH + '.corrupt.' + Date.now();
      writeFileSync(backupPath, content);
      log('INFO', `Backed up corrupt state to: ${backupPath}`);

      // Recover with default state
      const defaultState = {
        version: '1.0',
        last_updated: new Date().toISOString(),
        last_updated_by: 'crash-protection',
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
        notes: { recovered: `Recovered at ${new Date().toISOString()}` },
      };

      writeFileSync(STATE_JSON_PATH, JSON.stringify(defaultState, null, 2) + '\n');
      log('ALERT', 'state.json recovered with default values');
      monitorState.stateRecoveries++;

      return true;
    }
  } catch (error) {
    log('ERROR', `Error validating state: ${(error as Error).message}`);
    return false;
  }
}

/**
 * Get list of managed Node processes
 */
async function getManagedProcesses(): Promise<{ name: string; pid: number; running: boolean }[]> {
  const processesPath = join(LOGS_DIR, 'processes.json');

  try {
    if (!existsSync(processesPath)) {
      return [];
    }

    const content = readFileSync(processesPath, 'utf-8');
    const state = JSON.parse(content);

    const results: { name: string; pid: number; running: boolean }[] = [];

    for (const [name, proc] of Object.entries(state.processes || {})) {
      const p = proc as { pid: number };
      const running = await isProcessRunning(p.pid);
      results.push({ name, pid: p.pid, running });
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * Run a single check cycle
 */
async function runCheck(): Promise<void> {
  monitorState.lastCheck = new Date().toISOString();

  // 1. Clean stale locks
  const cleaned = await cleanupStaleLocks();
  monitorState.staleLocksCleaned += cleaned;

  // 2. Check for file contention
  const contentions = checkFileContention();
  if (contentions.length > 0) {
    consecutiveContentions++;
    monitorState.contentionEvents += contentions.length;

    for (const contention of contentions) {
      log('WARN', `File contention: ${contention}`);
    }

    if (consecutiveContentions >= MAX_FILE_CONTENTION_EVENTS) {
      log('ALERT', `HIGH CONTENTION: ${consecutiveContentions} consecutive contention events detected!`);
      log('ALERT', 'Consider stopping some Claude instances to prevent crashes.');
    }
  } else {
    consecutiveContentions = 0;
  }

  // 3. Validate state.json
  validateAndRecoverState();

  // 4. Check managed processes
  const processes = await getManagedProcesses();
  const deadProcesses = processes.filter((p) => !p.running);
  if (deadProcesses.length > 0) {
    for (const p of deadProcesses) {
      log('WARN', `Managed process '${p.name}' (PID ${p.pid}) is no longer running`);
    }
  }
}

/**
 * Print current status
 */
function printStatus(): void {
  console.log('\n=== Crash Protection Status ===\n');
  console.log(`Started: ${monitorState.startedAt}`);
  console.log(`Last Check: ${monitorState.lastCheck}`);
  console.log(`Stale Locks Cleaned: ${monitorState.staleLocksCleaned}`);
  console.log(`Contention Events: ${monitorState.contentionEvents}`);
  console.log(`State Recoveries: ${monitorState.stateRecoveries}`);

  // Current locks
  if (existsSync(LOCK_DIR)) {
    const locks = readdirSync(LOCK_DIR).filter((f) => f.endsWith('.lock'));
    console.log(`\nActive Locks: ${locks.length}`);
    for (const lock of locks) {
      try {
        const content = readFileSync(join(LOCK_DIR, lock), 'utf-8');
        const info: LockInfo = JSON.parse(content);
        const age = Math.round((Date.now() - info.acquiredAt) / 1000);
        console.log(`  - ${info.file}: ${info.instance} (${age}s ago)`);
      } catch {
        console.log(`  - ${lock}: (corrupt)`);
      }
    }
  }

  console.log('');
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const command = process.argv[2] || 'status';

  ensureDirectories();

  switch (command) {
    case 'start':
      log('INFO', '=== Crash Protection Daemon Started ===');
      log('INFO', `Monitoring: Lock files, state.json, process health`);
      log('INFO', `Check interval: ${CHECK_INTERVAL_MS / 1000}s`);
      log('INFO', `Lock timeout: ${LOCK_TIMEOUT_MS / 1000}s`);

      // Initial check
      await runCheck();

      // Continuous monitoring
      setInterval(async () => {
        try {
          await runCheck();
        } catch (error) {
          log('ERROR', `Check failed: ${(error as Error).message}`);
          monitorState.errors.push((error as Error).message);
        }
      }, CHECK_INTERVAL_MS);

      // Keep process alive
      process.on('SIGINT', () => {
        log('INFO', 'Crash Protection Daemon stopped');
        process.exit(0);
      });

      break;

    case 'status':
      await runCheck();
      printStatus();
      break;

    case 'cleanup':
      log('INFO', 'Running manual cleanup...');
      const cleaned = await cleanupStaleLocks();
      log('INFO', `Cleaned ${cleaned} stale lock(s)`);
      validateAndRecoverState();
      log('INFO', 'Cleanup complete');
      break;

    case 'check':
      await runCheck();
      log('INFO', 'Check complete');
      break;

    default:
      console.log(`
Crash Protection Daemon

Usage:
  npx tsx orchestration/crashProtection.ts <command>

Commands:
  start     Start the daemon (runs continuously)
  status    Show current status and active locks
  cleanup   Run manual cleanup of stale locks
  check     Run a single check cycle

Examples:
  npx tsx orchestration/crashProtection.ts start    # Start monitoring
  npx tsx orchestration/crashProtection.ts status   # Check status
  npx tsx orchestration/crashProtection.ts cleanup  # Manual cleanup
`);
  }
}

// Run if executed directly
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

// Export for programmatic use
export { runCheck, cleanupStaleLocks, validateAndRecoverState, checkFileContention };
