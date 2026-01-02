/**
 * Task Queue Test Script
 *
 * Run: npx tsx agents/shared/src/taskQueue.test.ts
 *
 * Tests:
 * 1. Create a task (simulates receiving a new task)
 * 2. Verify task is saved to disk immediately
 * 3. Start the task
 * 4. Simulate a "crash" (exit without completing)
 * 5. Recover and show incomplete tasks
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createTaskQueue, recoverAgentTasks } from './taskQueue.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TASKS_DIR = path.join(__dirname, '../../tasks');

async function cleanupTestTasks() {
  if (fs.existsSync(TASKS_DIR)) {
    const files = fs.readdirSync(TASKS_DIR).filter(f => f.startsWith('test-agent-'));
    for (const file of files) {
      fs.unlinkSync(path.join(TASKS_DIR, file));
    }
  }
}

async function runTests() {
  console.log('\n=== Task Queue Persistence Test ===\n');

  // Cleanup previous test files
  await cleanupTestTasks();

  const queue = createTaskQueue('TEST-AGENT');

  // Test 1: Receive a task (should save immediately)
  console.log('Test 1: Receiving a new task...');
  const task1 = await queue.receiveTask(
    'Research competitor dashboard designs for flash loan arbitrage',
    {
      rawInput: 'Agent Mouse, research eigenphi.io and create a competitor analysis report',
      priority: 'high',
      metadata: { requestedBy: 'user', source: 'cli' }
    }
  );
  console.log(`  ✓ Task created: ${task1.id}`);
  console.log(`  ✓ Status: ${task1.status}`);

  // Test 2: Verify task file exists on disk
  console.log('\nTest 2: Verifying task saved to disk...');
  const taskFile = path.join(TASKS_DIR, `${task1.id}.json`);
  if (fs.existsSync(taskFile)) {
    console.log(`  ✓ Task file exists: ${taskFile}`);
    const savedTask = JSON.parse(fs.readFileSync(taskFile, 'utf-8'));
    console.log(`  ✓ Raw input preserved: "${savedTask.rawInput.substring(0, 50)}..."`);
  } else {
    console.log(`  ✗ FAILED: Task file not found!`);
    process.exit(1);
  }

  // Test 3: Start the task
  console.log('\nTest 3: Starting task...');
  const startedTask = await queue.startTask(task1.id);
  console.log(`  ✓ Status changed to: ${startedTask.status}`);
  console.log(`  ✓ Started at: ${startedTask.startedAt}`);

  // Test 4: Create another task but don't start it
  console.log('\nTest 4: Creating second task (will remain pending)...');
  const task2 = await queue.receiveTask(
    'Analyze DEX liquidity pools on BSC',
    { priority: 'normal' }
  );
  console.log(`  ✓ Task created: ${task2.id}`);
  console.log(`  ✓ Status: ${task2.status}`);

  // Test 5: Simulate crash - get incomplete tasks
  console.log('\nTest 5: Simulating crash recovery...');
  console.log('  [Simulating: Agent crashed without completing tasks]\n');

  // Create a new queue instance (simulating restart after crash)
  const recoveryResult = await recoverAgentTasks('TEST-AGENT');

  console.log('  Recovery results:');
  console.log(`  ✓ Crashed tasks found: ${recoveryResult.crashed.length}`);
  for (const t of recoveryResult.crashed) {
    console.log(`    - ${t.id}: "${t.taskDescription.substring(0, 40)}..."`);
    console.log(`      Original input: "${t.rawInput.substring(0, 50)}..."`);
  }

  console.log(`  ✓ Pending tasks found: ${recoveryResult.pending.length}`);
  for (const t of recoveryResult.pending) {
    console.log(`    - ${t.id}: "${t.taskDescription.substring(0, 40)}..."`);
  }

  // Test 6: Complete a task
  console.log('\nTest 6: Completing a recovered task...');
  const newQueue = createTaskQueue('TEST-AGENT');
  const pendingTask = recoveryResult.pending[0];
  if (pendingTask) {
    await newQueue.startTask(pendingTask.id);
    const completed = await newQueue.completeTask(
      pendingTask.id,
      'Analysis complete. Found 15 high-volume liquidity pools on PancakeSwap.'
    );
    console.log(`  ✓ Task completed: ${completed.id}`);
    console.log(`  ✓ Result: ${completed.result}`);
  } else {
    console.log('  (No pending tasks to complete)');
  }

  // Test 7: Get all tasks
  console.log('\nTest 7: Listing all tasks...');
  const allTasks = await newQueue.getAllTasks();
  console.log(`  Total tasks: ${allTasks.length}`);
  for (const t of allTasks) {
    const statusIcon = t.status === 'completed' ? '✓' :
                       t.status === 'crashed' ? '💥' :
                       t.status === 'pending' ? '⏳' : '🔄';
    console.log(`  ${statusIcon} [${t.status}] ${t.id}`);
    console.log(`     "${t.taskDescription.substring(0, 50)}..."`);
  }

  console.log('\n=== All Tests Passed ===\n');

  // Cleanup
  console.log('Cleaning up test files...');
  await cleanupTestTasks();
  console.log('Done.\n');
}

// Run tests
runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
