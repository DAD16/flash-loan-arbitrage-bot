/**
 * @matrix/shared - Task Persistence System
 *
 * Ensures agent tasks are saved IMMEDIATELY upon receipt,
 * before any work begins. This prevents task loss during crashes.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = createLogger('TaskQueue');

export interface AgentTask {
  id: string;
  agentName: string;
  taskDescription: string;
  rawInput: string;           // Original task as given by user
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'crashed';
  priority: 'low' | 'normal' | 'high' | 'critical';
  createdAt: string;
  startedAt?: string | undefined;
  completedAt?: string | undefined;
  result?: string | undefined;
  error?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface TaskQueueConfig {
  tasksDir: string;
  agentName: string;
}

/**
 * TaskQueue - Persistent task management for Matrix agents
 *
 * Usage:
 *   const queue = new TaskQueue({ agentName: 'MOUSE' });
 *
 *   // When receiving a new task - saves IMMEDIATELY before any work
 *   const task = await queue.receiveTask('Research eigenphi.io dashboard design');
 *
 *   // Start working on task
 *   await queue.startTask(task.id);
 *
 *   // When done
 *   await queue.completeTask(task.id, 'Research completed, see findings in...');
 *
 *   // If failed
 *   await queue.failTask(task.id, 'Error: API rate limited');
 *
 *   // Recovery: get incomplete tasks after crash
 *   const incomplete = await queue.getIncompleteTasks();
 */
export class TaskQueue {
  private tasksDir: string;
  private agentName: string;
  private indexFile: string;

  constructor(config: Partial<TaskQueueConfig> & { agentName: string }) {
    // Default to agents/tasks/ directory
    this.tasksDir = config.tasksDir || path.join(__dirname, '../../tasks');
    this.agentName = config.agentName;
    this.indexFile = path.join(this.tasksDir, `${this.agentName.toLowerCase()}-tasks.json`);

    this.ensureTasksDir();
  }

  private ensureTasksDir(): void {
    if (!fs.existsSync(this.tasksDir)) {
      fs.mkdirSync(this.tasksDir, { recursive: true });
      logger.info(`Created tasks directory: ${this.tasksDir}`);
    }
  }

  private generateTaskId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${this.agentName.toLowerCase()}-${timestamp}-${random}`;
  }

  private getTaskFilePath(taskId: string): string {
    return path.join(this.tasksDir, `${taskId}.json`);
  }

  private async saveTask(task: AgentTask): Promise<void> {
    const filePath = this.getTaskFilePath(task.id);

    // Write atomically - write to temp file then rename
    const tempPath = `${filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(task, null, 2), 'utf-8');
    fs.renameSync(tempPath, filePath);

    // Update index
    await this.updateIndex(task);

    logger.debug(`Saved task ${task.id} to ${filePath}`);
  }

  private async updateIndex(task: AgentTask): Promise<void> {
    let index: { tasks: Record<string, { status: string; createdAt: string }> } = { tasks: {} };

    if (fs.existsSync(this.indexFile)) {
      try {
        index = JSON.parse(fs.readFileSync(this.indexFile, 'utf-8'));
      } catch {
        logger.warn('Index file corrupted, recreating');
      }
    }

    index.tasks[task.id] = {
      status: task.status,
      createdAt: task.createdAt
    };

    const tempPath = `${this.indexFile}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(index, null, 2), 'utf-8');
    fs.renameSync(tempPath, this.indexFile);
  }

  /**
   * Receive a new task - SAVES IMMEDIATELY before returning
   * This is the critical method that ensures task persistence.
   */
  async receiveTask(
    taskDescription: string,
    options: {
      rawInput?: string;
      priority?: AgentTask['priority'];
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<AgentTask> {
    const task: AgentTask = {
      id: this.generateTaskId(),
      agentName: this.agentName,
      taskDescription,
      rawInput: options.rawInput || taskDescription,
      status: 'pending',
      priority: options.priority || 'normal',
      createdAt: new Date().toISOString(),
      metadata: options.metadata
    };

    // CRITICAL: Save immediately before any work begins
    await this.saveTask(task);

    logger.info(`Task received and saved: ${task.id}`);
    logger.info(`  Description: ${taskDescription.substring(0, 100)}...`);

    return task;
  }

  /**
   * Mark task as started (in_progress)
   */
  async startTask(taskId: string): Promise<AgentTask> {
    const task = await this.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    task.status = 'in_progress';
    task.startedAt = new Date().toISOString();

    await this.saveTask(task);
    logger.info(`Task started: ${taskId}`);

    return task;
  }

  /**
   * Mark task as completed with result
   */
  async completeTask(taskId: string, result?: string): Promise<AgentTask> {
    const task = await this.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    task.status = 'completed';
    task.completedAt = new Date().toISOString();
    task.result = result;

    await this.saveTask(task);
    logger.info(`Task completed: ${taskId}`);

    return task;
  }

  /**
   * Mark task as failed with error
   */
  async failTask(taskId: string, error: string): Promise<AgentTask> {
    const task = await this.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    task.status = 'failed';
    task.completedAt = new Date().toISOString();
    task.error = error;

    await this.saveTask(task);
    logger.warn(`Task failed: ${taskId} - ${error}`);

    return task;
  }

  /**
   * Get a specific task by ID
   */
  async getTask(taskId: string): Promise<AgentTask | null> {
    const filePath = this.getTaskFilePath(taskId);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (err) {
      logger.error(`Failed to read task ${taskId}: ${err}`);
      return null;
    }
  }

  /**
   * Get all incomplete tasks (pending or in_progress)
   * Use this after a crash to recover unfinished work
   */
  async getIncompleteTasks(): Promise<AgentTask[]> {
    const tasks: AgentTask[] = [];

    if (!fs.existsSync(this.tasksDir)) {
      return tasks;
    }

    const files = fs.readdirSync(this.tasksDir)
      .filter(f => f.startsWith(`${this.agentName.toLowerCase()}-`) && f.endsWith('.json') && !f.endsWith('-tasks.json'));

    for (const file of files) {
      try {
        const task: AgentTask = JSON.parse(
          fs.readFileSync(path.join(this.tasksDir, file), 'utf-8')
        );

        if (task.status === 'pending' || task.status === 'in_progress') {
          tasks.push(task);
        }
      } catch {
        logger.warn(`Failed to parse task file: ${file}`);
      }
    }

    // Sort by createdAt (oldest first)
    return tasks.sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }

  /**
   * Get the most recent incomplete task
   */
  async getLastIncompleteTask(): Promise<AgentTask | null> {
    const incomplete = await this.getIncompleteTasks();
    const lastTask = incomplete[incomplete.length - 1];
    return lastTask ?? null;
  }

  /**
   * Get all tasks for this agent
   */
  async getAllTasks(): Promise<AgentTask[]> {
    const tasks: AgentTask[] = [];

    if (!fs.existsSync(this.tasksDir)) {
      return tasks;
    }

    const files = fs.readdirSync(this.tasksDir)
      .filter(f => f.startsWith(`${this.agentName.toLowerCase()}-`) && f.endsWith('.json') && !f.endsWith('-tasks.json'));

    for (const file of files) {
      try {
        const task: AgentTask = JSON.parse(
          fs.readFileSync(path.join(this.tasksDir, file), 'utf-8')
        );
        tasks.push(task);
      } catch {
        logger.warn(`Failed to parse task file: ${file}`);
      }
    }

    return tasks.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Mark in_progress tasks as crashed (for recovery)
   */
  async markCrashedTasks(): Promise<AgentTask[]> {
    const incomplete = await this.getIncompleteTasks();
    const crashed: AgentTask[] = [];

    for (const task of incomplete) {
      if (task.status === 'in_progress') {
        task.status = 'crashed';
        task.error = 'Agent crashed or was terminated unexpectedly';
        await this.saveTask(task);
        crashed.push(task);
        logger.warn(`Marked task as crashed: ${task.id}`);
      }
    }

    return crashed;
  }
}

/**
 * Quick helper to create a task queue for an agent
 */
export function createTaskQueue(agentName: string): TaskQueue {
  return new TaskQueue({ agentName });
}

/**
 * Recovery function - call on agent startup to check for incomplete tasks
 */
export async function recoverAgentTasks(agentName: string): Promise<{
  crashed: AgentTask[];
  pending: AgentTask[];
}> {
  const queue = createTaskQueue(agentName);

  // Mark any in_progress tasks as crashed
  const crashed = await queue.markCrashedTasks();

  // Get remaining pending tasks
  const pending = await queue.getIncompleteTasks();

  if (crashed.length > 0 || pending.length > 0) {
    logger.info(`Recovery for ${agentName}:`);
    logger.info(`  - ${crashed.length} crashed task(s) found`);
    logger.info(`  - ${pending.length} pending task(s) to resume`);
  }

  return { crashed, pending };
}
