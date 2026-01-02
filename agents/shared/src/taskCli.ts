#!/usr/bin/env npx tsx
/**
 * Task Queue CLI
 *
 * Query and manage agent tasks from the command line.
 *
 * Usage:
 *   npx tsx agents/shared/src/taskCli.ts list MOUSE
 *   npx tsx agents/shared/src/taskCli.ts pending MOUSE
 *   npx tsx agents/shared/src/taskCli.ts recover MOUSE
 *   npx tsx agents/shared/src/taskCli.ts get MOUSE <task-id>
 */

import { createTaskQueue, recoverAgentTasks } from './taskQueue.js';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const agentName = args[1];

  if (!command || !agentName) {
    console.log(`
Task Queue CLI - Manage agent tasks

Usage:
  npx tsx agents/shared/src/taskCli.ts <command> <agent-name> [options]

Commands:
  list <agent>              List all tasks for an agent
  pending <agent>           Show pending/incomplete tasks
  recover <agent>           Recover crashed tasks and show pending
  get <agent> <task-id>     Get details of a specific task
  last <agent>              Get the last incomplete task

Examples:
  npx tsx agents/shared/src/taskCli.ts list MOUSE
  npx tsx agents/shared/src/taskCli.ts pending MOUSE
  npx tsx agents/shared/src/taskCli.ts recover MOUSE
  npx tsx agents/shared/src/taskCli.ts last MOUSE
`);
    process.exit(1);
  }

  const queue = createTaskQueue(agentName.toUpperCase());

  switch (command) {
    case 'list': {
      const tasks = await queue.getAllTasks();
      if (tasks.length === 0) {
        console.log(`No tasks found for ${agentName}`);
        return;
      }

      console.log(`\n=== All Tasks for ${agentName.toUpperCase()} ===\n`);
      for (const task of tasks) {
        const statusIcon = getStatusIcon(task.status);
        console.log(`${statusIcon} [${task.status}] ${task.id}`);
        console.log(`   Created: ${task.createdAt}`);
        console.log(`   Task: ${task.taskDescription}`);
        console.log(`   Raw Input: ${task.rawInput.substring(0, 80)}...`);
        if (task.result) {
          console.log(`   Result: ${task.result.substring(0, 80)}...`);
        }
        if (task.error) {
          console.log(`   Error: ${task.error}`);
        }
        console.log('');
      }
      break;
    }

    case 'pending': {
      const incomplete = await queue.getIncompleteTasks();
      if (incomplete.length === 0) {
        console.log(`No pending tasks for ${agentName}`);
        return;
      }

      console.log(`\n=== Pending Tasks for ${agentName.toUpperCase()} ===\n`);
      for (const task of incomplete) {
        const statusIcon = getStatusIcon(task.status);
        console.log(`${statusIcon} [${task.status}] ${task.id}`);
        console.log(`   Created: ${task.createdAt}`);
        console.log(`   Task: ${task.taskDescription}`);
        console.log(`   Original Input: ${task.rawInput}`);
        console.log('');
      }
      break;
    }

    case 'recover': {
      console.log(`\nRecovering tasks for ${agentName.toUpperCase()}...\n`);
      const result = await recoverAgentTasks(agentName.toUpperCase());

      if (result.crashed.length > 0) {
        console.log(`Crashed tasks (marked for recovery):`);
        for (const task of result.crashed) {
          console.log(`  - ${task.id}`);
          console.log(`    Original Input: ${task.rawInput}`);
        }
        console.log('');
      }

      if (result.pending.length > 0) {
        console.log(`Pending tasks to resume:`);
        for (const task of result.pending) {
          console.log(`  - ${task.id}`);
          console.log(`    Task: ${task.taskDescription}`);
          console.log(`    Original Input: ${task.rawInput}`);
        }
      }

      if (result.crashed.length === 0 && result.pending.length === 0) {
        console.log('No tasks to recover.');
      }
      break;
    }

    case 'last': {
      const lastTask = await queue.getLastIncompleteTask();
      if (!lastTask) {
        console.log(`No incomplete tasks for ${agentName}`);
        return;
      }

      console.log(`\n=== Last Incomplete Task for ${agentName.toUpperCase()} ===\n`);
      console.log(`ID: ${lastTask.id}`);
      console.log(`Status: ${lastTask.status}`);
      console.log(`Created: ${lastTask.createdAt}`);
      console.log(`Task: ${lastTask.taskDescription}`);
      console.log(`\nOriginal Input (as given by user):`);
      console.log(`"${lastTask.rawInput}"`);
      break;
    }

    case 'get': {
      const taskId = args[2];
      if (!taskId) {
        console.log('Error: task-id required');
        process.exit(1);
      }

      const task = await queue.getTask(taskId);
      if (!task) {
        console.log(`Task not found: ${taskId}`);
        process.exit(1);
      }

      console.log(`\n=== Task Details ===\n`);
      console.log(JSON.stringify(task, null, 2));
      break;
    }

    default:
      console.log(`Unknown command: ${command}`);
      process.exit(1);
  }
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'completed': return '✓';
    case 'crashed': return '💥';
    case 'failed': return '✗';
    case 'pending': return '⏳';
    case 'in_progress': return '🔄';
    default: return '?';
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
