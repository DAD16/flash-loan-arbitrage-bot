# Crash Prevention Guide

This document explains how to prevent crashes when running multiple Claude Code instances on this project.

---

## ⛔⛔⛔ ABSOLUTE RULE - READ FIRST ⛔⛔⛔

**Claude Code runs as a Node.js process.** Any command that kills Node processes will crash Claude itself.

### FORBIDDEN COMMANDS (Will 100% Crash Claude):
```bash
# NEVER RUN THESE:
taskkill /F /IM node.exe          # Kills ALL node including Claude
taskkill /IM node.exe             # Same problem
Stop-Process -Name node           # PowerShell equivalent
wmic process where name="node.exe" delete
pkill node                        # Linux/Mac
killall node                      # Linux/Mac
```

### SAFE ALTERNATIVES:
```bash
# Use the process manager for EVERYTHING:
node scripts/process-manager.js status       # See what's running
node scripts/process-manager.js stop <name>  # Stop by name (graceful)
node scripts/process-manager.js stop all     # Stop all managed processes

# If you MUST kill a specific PID (not recommended):
taskkill /PID 12345              # Kill specific PID only (not by image name)
```

**The process manager uses PID-based kills, not image-name kills.** This is why it's safe.

---

## Quick Start

```bash
# 1. Before starting work, run the crash protection cleanup
npx tsx orchestration/crashProtection.ts cleanup

# 2. Start the crash protection daemon (optional, runs in background)
npx tsx orchestration/crashProtection.ts start

# 3. Use the process manager for all Node processes
node scripts/process-manager.js start dashboard npm run start
```

## Why Crashes Happen

When multiple Claude Code instances run simultaneously, they compete for shared files:

| File | Purpose | Crash Risk |
|------|---------|------------|
| `state.json` | Instance coordination | HIGH - concurrent writes corrupt JSON |
| `memory.md` | Session notes | MEDIUM - concurrent appends cause data loss |
| `*.STATUS.md` | Per-instance logs | LOW - each instance has its own |

**Without file locking**, concurrent writes cause:
1. File corruption (partial writes)
2. Data loss (overwrites)
3. Claude Code crashes (I/O errors)

## The Solution: 3-Layer Protection

### Layer 1: File Locking (Automatic)

The `orchestration/fileLock.ts` module provides:
- Exclusive locks on shared files
- Automatic stale lock cleanup (30s timeout)
- Atomic writes (temp file + rename)

**Usage in code:**
```typescript
import { acquireLock, releaseLock, atomicWrite } from './orchestration/fileLock';

const lock = await acquireLock('state.json', 'my-instance');
try {
  atomicWrite('state.json', newContent);
} finally {
  await releaseLock(lock);
}
```

**Or use the higher-level state manager:**
```typescript
import { updateState, appendToMemory } from './orchestration/stateManager';

// Update state.json safely
await updateState((state) => {
  state.instances.dashboard.status = 'working';
  return state;
}, 'dashboard');

// Append to memory.md safely
await appendToMemory('## New Section\nContent here', 'root');
```

### Layer 2: Process Manager (For Node Processes)

**NEVER kill Node processes directly with `taskkill` or Ctrl+C in terminals that Claude is watching.**

Instead, use the safe process manager:

```bash
# Start a process
node scripts/process-manager.js start dashboard npm run start

# Stop gracefully (prevents crashes)
node scripts/process-manager.js stop dashboard

# Restart
node scripts/process-manager.js restart dashboard

# Check status
node scripts/process-manager.js status

# View logs
node scripts/process-manager.js logs dashboard
node scripts/process-manager.js tail dashboard  # Follow in real-time
```

**Why this matters:**
- Processes run detached from Claude Code
- Graceful shutdown releases file handles properly
- Logs are captured even if Claude crashes
- Automatic restart with same configuration

### Layer 3: Crash Protection Daemon

The daemon runs continuously and:
- Cleans stale locks every 5 seconds
- Detects and alerts on file contention
- Recovers corrupted state.json automatically
- Logs all incidents for debugging

```bash
# Start the daemon (run in separate terminal)
npx tsx orchestration/crashProtection.ts start

# Check current status
npx tsx orchestration/crashProtection.ts status

# Manual cleanup (run before starting work)
npx tsx orchestration/crashProtection.ts cleanup
```

## Best Practices for Multi-Instance Work

### Starting a Session

1. **Clean up first:**
   ```bash
   npx tsx orchestration/crashProtection.ts cleanup
   ```

2. **Check for orphan processes:**
   ```bash
   node scripts/process-manager.js status
   tasklist | findstr node
   ```

3. **Start the daemon (optional but recommended):**
   ```bash
   npx tsx orchestration/crashProtection.ts start
   ```

### Running Multiple Instances

1. **Each instance should work in its own scope:**
   - Root: `C:\Claude Projects\Flash Loan Arbitrage Bot\`
   - Dashboard: `C:\Claude Projects\Flash Loan Arbitrage Bot\dashboard\`
   - Agents: `C:\Claude Projects\Flash Loan Arbitrage Bot\agents\`
   - etc.

2. **Only modify files in your scope:**
   - Root can modify: `memory.md`, `state.json`, `CLAUDE.md`
   - Dashboard can modify: `dashboard/**/*`, `dashboard/STATUS.md`
   - Agents can modify: `agents/**/*`, `agents/STATUS.md`

3. **For cross-scope changes, add to STATUS.md:**
   ```markdown
   ## Cross-Scope Requests
   [TO: root] Please update memory.md with the new feature description
   ```

### Stopping Work

1. **Stop managed processes gracefully:**
   ```bash
   node scripts/process-manager.js stop dashboard
   ```

2. **Never use:**
   - `taskkill /F` on Node processes
   - Ctrl+C in terminals Claude is watching
   - Closing terminal windows abruptly

### If a Crash Happens

1. **Run cleanup immediately:**
   ```bash
   npx tsx orchestration/crashProtection.ts cleanup
   ```

2. **Check for corrupted state:**
   ```bash
   npx tsx orchestration/crashProtection.ts status
   ```

3. **Review the crash log:**
   ```bash
   type scripts\logs\crash-monitor.log
   ```

4. **Restart affected processes:**
   ```bash
   node scripts/process-manager.js status
   node scripts/process-manager.js restart dashboard
   ```

## File Reference

| File | Purpose |
|------|---------|
| `orchestration/fileLock.ts` | Low-level file locking primitives |
| `orchestration/stateManager.ts` | High-level state management with locking |
| `orchestration/crashProtection.ts` | Crash prevention daemon |
| `scripts/process-manager.js` | Safe Node process management |
| `scripts/logs/crash-monitor.log` | Crash protection event log |
| `scripts/logs/processes.json` | Managed process state |
| `.locks/` | Active lock files (auto-cleaned) |

## Troubleshooting

### "Failed to acquire lock" Error

The lock is held by another process. Options:
1. Wait a few seconds (auto-timeout is 10s)
2. Run cleanup: `npx tsx orchestration/crashProtection.ts cleanup`
3. Check who holds it: `npx tsx orchestration/crashProtection.ts status`

### State.json is Corrupted

The daemon auto-recovers, but you can force it:
```bash
npx tsx orchestration/crashProtection.ts cleanup
```

A backup is saved as `state.json.corrupt.<timestamp>`.

### Processes Won't Stop

Check if they're managed:
```bash
node scripts/process-manager.js status
```

If not managed, find and kill manually (but check Claude instances first!):
```bash
tasklist | findstr node
taskkill /PID <pid>  # Graceful
taskkill /F /PID <pid>  # Force (last resort)
```

### Daemon Won't Start

Check if already running:
```bash
tasklist | findstr tsx
```

Or just run status instead:
```bash
npx tsx orchestration/crashProtection.ts status
```

## Testing the System

Run the crash test to verify everything works:
```bash
powershell -ExecutionPolicy Bypass -File testing/multi-instance-crash-test.ps1 -All
```

This simulates concurrent file access and reports any issues.
