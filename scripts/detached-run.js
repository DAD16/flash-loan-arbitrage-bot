#!/usr/bin/env node
/**
 * Detached Process Runner
 *
 * Runs Node.js commands in a detached process that won't crash Claude Code
 * when terminated. The process runs independently and writes output to a log file.
 *
 * Usage:
 *   node scripts/detached-run.js <command> [args...]
 *   node scripts/detached-run.js npm run dev
 *   node scripts/detached-run.js npx tsx agents/shared/src/taskCli.ts list MOUSE
 *
 * The process runs in background and logs to scripts/logs/<timestamp>.log
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log(`
Detached Process Runner - Run commands without crashing Claude

Usage:
  node scripts/detached-run.js <command> [args...]

Examples:
  node scripts/detached-run.js npm run dev
  node scripts/detached-run.js npx tsx src/index.ts
  node scripts/detached-run.js node server.js

The process runs detached and logs to scripts/logs/
Use 'node scripts/detached-run.js status' to see running processes
Use 'node scripts/detached-run.js stop <pid>' to stop a process
`);
  process.exit(0);
}

// Special commands
if (args[0] === 'status') {
  showStatus();
  process.exit(0);
}

if (args[0] === 'stop') {
  stopProcess(args[1]);
  process.exit(0);
}

// Create logs directory
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Create PID tracking file
const pidFile = path.join(logsDir, 'running.json');

function loadPids() {
  if (fs.existsSync(pidFile)) {
    try {
      return JSON.parse(fs.readFileSync(pidFile, 'utf-8'));
    } catch {
      return { processes: [] };
    }
  }
  return { processes: [] };
}

function savePids(data) {
  fs.writeFileSync(pidFile, JSON.stringify(data, null, 2));
}

function showStatus() {
  const data = loadPids();
  if (data.processes.length === 0) {
    console.log('No detached processes running.');
    return;
  }

  console.log('\nDetached Processes:\n');
  for (const proc of data.processes) {
    // Check if still running
    let running = false;
    try {
      process.kill(proc.pid, 0);
      running = true;
    } catch {
      running = false;
    }

    const status = running ? '🟢 RUNNING' : '⚫ STOPPED';
    console.log(`${status} PID ${proc.pid}`);
    console.log(`  Command: ${proc.command}`);
    console.log(`  Started: ${proc.startedAt}`);
    console.log(`  Log: ${proc.logFile}`);
    console.log('');
  }

  // Clean up stopped processes
  data.processes = data.processes.filter(proc => {
    try {
      process.kill(proc.pid, 0);
      return true;
    } catch {
      return false;
    }
  });
  savePids(data);
}

function stopProcess(pid) {
  if (!pid) {
    console.log('Error: PID required. Usage: node scripts/detached-run.js stop <pid>');
    return;
  }

  try {
    process.kill(parseInt(pid), 'SIGTERM');
    console.log(`Sent SIGTERM to process ${pid}`);

    // Give it a moment, then force kill if needed
    setTimeout(() => {
      try {
        process.kill(parseInt(pid), 0);
        console.log(`Process still running, sending SIGKILL...`);
        process.kill(parseInt(pid), 'SIGKILL');
      } catch {
        console.log(`Process ${pid} terminated.`);
      }
    }, 2000);
  } catch (err) {
    console.log(`Could not stop process ${pid}: ${err.message}`);
  }
}

// Run the command detached
const command = args[0];
const cmdArgs = args.slice(1);

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const logFile = path.join(logsDir, `${timestamp}-${command.replace(/[^a-z0-9]/gi, '_')}.log`);

const out = fs.openSync(logFile, 'a');
const err = fs.openSync(logFile, 'a');

console.log(`Starting detached process...`);
console.log(`Command: ${command} ${cmdArgs.join(' ')}`);
console.log(`Log file: ${logFile}`);

// Spawn detached process
const child = spawn(command, cmdArgs, {
  detached: true,
  stdio: ['ignore', out, err],
  cwd: process.cwd(),
  shell: true,
  windowsHide: true
});

// Unref so parent can exit
child.unref();

// Track the process
const data = loadPids();
data.processes.push({
  pid: child.pid,
  command: `${command} ${cmdArgs.join(' ')}`,
  startedAt: new Date().toISOString(),
  logFile: logFile
});
savePids(data);

console.log(`\n✓ Process started with PID ${child.pid}`);
console.log(`  View logs: type ${logFile}`);
console.log(`  Stop: node scripts/detached-run.js stop ${child.pid}`);
console.log(`  Status: node scripts/detached-run.js status`);
