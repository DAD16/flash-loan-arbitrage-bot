#!/usr/bin/env node
/**
 * Safe Process Manager for Claude Code
 *
 * Manages Node.js processes in a way that won't crash Claude Code when
 * stopping/restarting them. Uses graceful shutdown and process isolation.
 *
 * Usage:
 *   node scripts/process-manager.js start <name> <command...>
 *   node scripts/process-manager.js stop <name>
 *   node scripts/process-manager.js restart <name>
 *   node scripts/process-manager.js status
 *   node scripts/process-manager.js logs <name>
 */

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, 'logs');
const STATE_FILE = path.join(LOGS_DIR, 'processes.json');

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    } catch {
      return { processes: {} };
    }
  }
  return { processes: {} };
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function getLogFile(name) {
  return path.join(LOGS_DIR, `${name}.log`);
}

async function startProcess(name, command, workDir = null) {
  const state = loadState();

  // Check if already running
  if (state.processes[name]) {
    const proc = state.processes[name];
    if (isProcessRunning(proc.pid)) {
      console.log(`Process '${name}' is already running (PID ${proc.pid})`);
      console.log(`Use 'restart ${name}' to restart it.`);
      return;
    }
  }

  const logFile = getLogFile(name);
  const cwd = workDir || process.cwd();

  // Clear old log
  fs.writeFileSync(logFile, `=== Started at ${new Date().toISOString()} ===\n`);
  fs.appendFileSync(logFile, `=== Command: ${command.join(' ')} ===\n`);
  fs.appendFileSync(logFile, `=== Working Directory: ${cwd} ===\n\n`);

  const out = fs.openSync(logFile, 'a');
  const err = fs.openSync(logFile, 'a');

  console.log(`Starting '${name}'...`);
  console.log(`Command: ${command.join(' ')}`);
  console.log(`Working Dir: ${cwd}`);

  // Join command for shell execution
  const fullCommand = command.join(' ');

  // Spawn detached process
  const child = spawn(fullCommand, [], {
    detached: true,
    stdio: ['ignore', out, err],
    cwd: cwd,
    shell: true,
    windowsHide: true
  });

  child.unref();

  // Save state
  state.processes[name] = {
    pid: child.pid,
    command: command.join(' '),
    cwd: cwd,
    startedAt: new Date().toISOString(),
    logFile: logFile
  };
  saveState(state);

  console.log(`✓ Process '${name}' started with PID ${child.pid}`);
  console.log(`  Logs: ${logFile}`);
}

async function stopAllProcesses() {
  const state = loadState();
  const names = Object.keys(state.processes);

  if (names.length === 0) {
    console.log('No managed processes to stop.');
    return;
  }

  console.log(`Stopping ${names.length} managed processes...`);

  for (const name of names) {
    await stopProcess(name);
  }

  console.log('✓ All managed processes stopped.');
}

async function stopProcess(name, silent = false) {
  const state = loadState();
  const proc = state.processes[name];

  if (!proc) {
    if (!silent) console.log(`No process named '${name}' found.`);
    return false;
  }

  if (!isProcessRunning(proc.pid)) {
    if (!silent) console.log(`Process '${name}' is not running.`);
    delete state.processes[name];
    saveState(state);
    return false;
  }

  console.log(`Stopping '${name}' (PID ${proc.pid})...`);

  // Graceful shutdown: try SIGTERM first, then SIGKILL after timeout
  return new Promise((resolve) => {
    try {
      // On Windows, we need to use taskkill but with /T to kill the tree
      // However, we'll do it gracefully by first trying a normal kill
      if (process.platform === 'win32') {
        // First try graceful termination
        exec(`taskkill /PID ${proc.pid}`, (error) => {
          setTimeout(() => {
            if (isProcessRunning(proc.pid)) {
              // Force kill if still running
              exec(`taskkill /F /PID ${proc.pid} /T`, () => {
                cleanup();
              });
            } else {
              cleanup();
            }
          }, 2000);
        });
      } else {
        process.kill(proc.pid, 'SIGTERM');
        setTimeout(() => {
          if (isProcessRunning(proc.pid)) {
            process.kill(proc.pid, 'SIGKILL');
          }
          cleanup();
        }, 2000);
      }
    } catch (err) {
      console.log(`Error stopping process: ${err.message}`);
      cleanup();
    }

    function cleanup() {
      delete state.processes[name];
      saveState(state);
      if (!silent) console.log(`✓ Process '${name}' stopped.`);
      resolve(true);
    }
  });
}

async function restartProcess(name) {
  const state = loadState();
  const proc = state.processes[name];

  if (!proc) {
    console.log(`No process named '${name}' found. Cannot restart.`);
    console.log(`Use 'start ${name} <command>' to start a new process.`);
    return;
  }

  const command = proc.command.split(' ');
  const cwd = proc.cwd;

  console.log(`Restarting '${name}'...`);

  // Stop first (gracefully)
  await stopProcess(name, true);

  // Wait a moment for cleanup
  await new Promise(r => setTimeout(r, 1000));

  // Start again with same working directory
  await startProcess(name, command, cwd);
}

function showStatus() {
  const state = loadState();
  const names = Object.keys(state.processes);

  if (names.length === 0) {
    console.log('No managed processes.');
    return;
  }

  console.log('\n=== Managed Processes ===\n');

  for (const name of names) {
    const proc = state.processes[name];
    const running = isProcessRunning(proc.pid);
    const status = running ? '🟢 RUNNING' : '⚫ STOPPED';

    console.log(`${status} ${name}`);
    console.log(`  PID: ${proc.pid}`);
    console.log(`  Command: ${proc.command}`);
    console.log(`  Started: ${proc.startedAt}`);
    console.log(`  Logs: ${proc.logFile}`);
    console.log('');

    // Clean up stopped processes
    if (!running) {
      delete state.processes[name];
    }
  }

  saveState(state);
}

function showLogs(name, lines = 50) {
  const logFile = getLogFile(name);

  if (!fs.existsSync(logFile)) {
    console.log(`No logs found for '${name}'.`);
    return;
  }

  const content = fs.readFileSync(logFile, 'utf-8');
  const logLines = content.split('\n');
  const lastLines = logLines.slice(-lines);

  console.log(`=== Last ${lines} lines of ${name} ===\n`);
  console.log(lastLines.join('\n'));
}

function tailLogs(name) {
  const logFile = getLogFile(name);

  if (!fs.existsSync(logFile)) {
    console.log(`No logs found for '${name}'.`);
    return;
  }

  console.log(`=== Tailing ${name} (Ctrl+C to stop) ===\n`);

  // Show last 20 lines first
  const content = fs.readFileSync(logFile, 'utf-8');
  const lines = content.split('\n').slice(-20);
  console.log(lines.join('\n'));

  // Watch for changes
  let lastSize = fs.statSync(logFile).size;

  const watcher = fs.watchFile(logFile, { interval: 500 }, (curr) => {
    if (curr.size > lastSize) {
      const fd = fs.openSync(logFile, 'r');
      const buffer = Buffer.alloc(curr.size - lastSize);
      fs.readSync(fd, buffer, 0, buffer.length, lastSize);
      fs.closeSync(fd);
      process.stdout.write(buffer.toString());
      lastSize = curr.size;
    }
  });

  process.on('SIGINT', () => {
    fs.unwatchFile(logFile);
    console.log('\n\nStopped tailing.');
    process.exit(0);
  });
}

// Main
const args = process.argv.slice(2);
const command = args[0];

if (!command) {
  console.log(`
Safe Process Manager for Claude Code

Usage:
  node scripts/process-manager.js <command> [options]

Commands:
  start <name> <cmd...>   Start a named process
  stop <name>             Stop a named process gracefully
  stop all                Stop ALL managed processes gracefully
  restart <name>          Restart a named process
  status                  Show all managed processes
  logs <name> [lines]     Show last N lines of logs (default: 50)
  tail <name>             Follow logs in real-time

⚠️  NEVER use 'taskkill /IM node.exe' - it will crash Claude Code!

Examples:
  node scripts/process-manager.js start dashboard npm run dev
  node scripts/process-manager.js start api npx tsx src/server.ts
  node scripts/process-manager.js restart dashboard
  node scripts/process-manager.js stop dashboard
  node scripts/process-manager.js logs dashboard 100
  node scripts/process-manager.js tail dashboard
  node scripts/process-manager.js status

Why use this?
  - Processes run detached from Claude Code
  - Graceful shutdown prevents crashes
  - Automatic restart with same command
  - Persistent logs for debugging
`);
  process.exit(0);
}

switch (command) {
  case 'start':
    if (args.length < 3) {
      console.log('Usage: start <name> <command...>');
      console.log('Example: start dashboard npm run dev');
      process.exit(1);
    }
    startProcess(args[1], args.slice(2));
    break;

  case 'stop':
    if (!args[1]) {
      console.log('Usage: stop <name>');
      console.log('       stop all     (stop all managed processes)');
      process.exit(1);
    }
    if (args[1] === 'all') {
      stopAllProcesses();
    } else {
      stopProcess(args[1]);
    }
    break;

  case 'restart':
    if (!args[1]) {
      console.log('Usage: restart <name>');
      process.exit(1);
    }
    restartProcess(args[1]);
    break;

  case 'status':
    showStatus();
    break;

  case 'logs':
    if (!args[1]) {
      console.log('Usage: logs <name> [lines]');
      process.exit(1);
    }
    showLogs(args[1], parseInt(args[2]) || 50);
    break;

  case 'tail':
    if (!args[1]) {
      console.log('Usage: tail <name>');
      process.exit(1);
    }
    tailLogs(args[1]);
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Run without arguments to see help.');
    process.exit(1);
}
