/**
 * @matrix/shared - Agent Base Class with Task Persistence
 *
 * Provides TaskQueue integration for all Matrix agents.
 * Ensures tasks are logged immediately and recoverable after crashes.
 *
 * Usage:
 *   class Mouse extends AgentBase {
 *     constructor() {
 *       super('MOUSE');
 *     }
 *   }
 *
 *   // On startup
 *   await mouse.onStartup();
 *
 *   // When receiving a task
 *   const task = await mouse.receiveTask('Research eigenphi.io dashboard design');
 *
 *   // When done
 *   await mouse.completeTask(task.id, 'Research completed');
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  TaskQueue,
  AgentTask,
  createTaskQueue,
  recoverAgentTasks,
} from './taskQueue.js';
import { createLogger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = createLogger('AgentBase');

export interface AgentMemory {
  agent: string;
  version: string;
  lastUpdated: string;
  context: {
    currentFocus: string;
    recentAnalyses: string[];
    openSuggestions: string[];
    resolvedIssues: string[];
  };
  knowledge: Record<string, unknown>;
  history: Array<{
    date: string;
    action: string;
    result: string;
  }>;
}

export interface AgentStartupResult {
  crashedTasks: AgentTask[];
  pendingTasks: AgentTask[];
  currentTask: AgentTask | null;
  memory: AgentMemory | null;
}

/**
 * AgentBase - Base class for all Matrix agents with task persistence
 *
 * Features:
 * - Automatic task logging on receive (crash-safe)
 * - Crash recovery on startup
 * - Memory file integration
 * - Task state management
 */
export class AgentBase {
  protected agentName: string;
  protected taskQueue: TaskQueue;
  protected memoryPath: string;
  protected currentTaskId: string | null = null;

  constructor(agentName: string) {
    this.agentName = agentName.toUpperCase();
    this.taskQueue = createTaskQueue(this.agentName);
    this.memoryPath = path.join(
      __dirname,
      '../../memory',
      `${agentName.toLowerCase()}.json`
    );
  }

  /**
   * Call this when the agent starts up.
   * Recovers any crashed/pending tasks and loads memory.
   */
  async onStartup(): Promise<AgentStartupResult> {
    logger.info(`[${this.agentName}] Starting up...`);

    // Recover tasks from any previous crash
    const { crashed, pending } = await recoverAgentTasks(this.agentName);

    if (crashed.length > 0) {
      logger.warn(
        `[${this.agentName}] Found ${crashed.length} crashed task(s) from previous session`
      );
      crashed.forEach((t) => {
        logger.warn(`  - ${t.id}: ${t.taskDescription.substring(0, 60)}...`);
      });
    }

    // Get the last incomplete task (most recent pending)
    const currentTask = await this.taskQueue.getLastIncompleteTask();
    if (currentTask) {
      this.currentTaskId = currentTask.id;
      logger.info(
        `[${this.agentName}] Resuming task: ${currentTask.taskDescription.substring(0, 60)}...`
      );
    }

    // Load memory
    const memory = this.loadMemory();

    logger.info(`[${this.agentName}] Startup complete`);
    logger.info(`  - Crashed tasks: ${crashed.length}`);
    logger.info(`  - Pending tasks: ${pending.length}`);
    logger.info(`  - Current task: ${currentTask ? 'Yes' : 'None'}`);

    return {
      crashedTasks: crashed,
      pendingTasks: pending,
      currentTask,
      memory,
    };
  }

  /**
   * Receive a new task - SAVES IMMEDIATELY before returning.
   * This is the critical method that ensures task persistence.
   *
   * @param taskDescription - Human-readable description of the task
   * @param options - Optional priority and metadata
   * @returns The created task with ID
   */
  async receiveTask(
    taskDescription: string,
    options: {
      rawInput?: string;
      priority?: AgentTask['priority'];
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<AgentTask> {
    logger.info(`[${this.agentName}] Receiving new task...`);

    // CRITICAL: Save to TaskQueue immediately
    const task = await this.taskQueue.receiveTask(taskDescription, options);

    this.currentTaskId = task.id;

    // Update memory file with current focus
    await this.updateMemoryCurrentFocus(taskDescription);

    logger.info(`[${this.agentName}] Task saved: ${task.id}`);

    return task;
  }

  /**
   * Mark a task as started (in_progress)
   */
  async startTask(taskId?: string): Promise<AgentTask> {
    const id = taskId || this.currentTaskId;
    if (!id) {
      throw new Error('No task ID provided and no current task');
    }

    const task = await this.taskQueue.startTask(id);
    this.currentTaskId = id;

    logger.info(`[${this.agentName}] Started task: ${id}`);

    return task;
  }

  /**
   * Mark a task as completed with optional result
   */
  async completeTask(taskId?: string, result?: string): Promise<AgentTask> {
    const id = taskId || this.currentTaskId;
    if (!id) {
      throw new Error('No task ID provided and no current task');
    }

    const task = await this.taskQueue.completeTask(id, result);

    // Update memory with completed work
    await this.addToMemoryHistory(task.taskDescription, result || 'Completed');

    // Clear current task
    if (this.currentTaskId === id) {
      this.currentTaskId = null;
    }

    logger.info(`[${this.agentName}] Completed task: ${id}`);

    return task;
  }

  /**
   * Mark a task as failed with error message
   */
  async failTask(taskId?: string, error?: string): Promise<AgentTask> {
    const id = taskId || this.currentTaskId;
    if (!id) {
      throw new Error('No task ID provided and no current task');
    }

    const task = await this.taskQueue.failTask(id, error || 'Unknown error');

    // Clear current task
    if (this.currentTaskId === id) {
      this.currentTaskId = null;
    }

    logger.warn(`[${this.agentName}] Failed task: ${id} - ${error}`);

    return task;
  }

  /**
   * Get the current task being worked on
   */
  async getCurrentTask(): Promise<AgentTask | null> {
    if (this.currentTaskId) {
      return this.taskQueue.getTask(this.currentTaskId);
    }
    return this.taskQueue.getLastIncompleteTask();
  }

  /**
   * Get all incomplete tasks (pending or in_progress)
   */
  async getIncompleteTasks(): Promise<AgentTask[]> {
    return this.taskQueue.getIncompleteTasks();
  }

  /**
   * Get all tasks for this agent
   */
  async getAllTasks(): Promise<AgentTask[]> {
    return this.taskQueue.getAllTasks();
  }

  /**
   * Get the agent's name
   */
  getName(): string {
    return this.agentName;
  }

  /**
   * Load the agent's memory file
   */
  loadMemory(): AgentMemory | null {
    if (!fs.existsSync(this.memoryPath)) {
      logger.warn(`[${this.agentName}] Memory file not found: ${this.memoryPath}`);
      return null;
    }

    try {
      const content = fs.readFileSync(this.memoryPath, 'utf-8');
      return JSON.parse(content);
    } catch (err) {
      logger.error(`[${this.agentName}] Failed to load memory: ${err}`);
      return null;
    }
  }

  /**
   * Save the agent's memory file
   */
  protected saveMemory(memory: AgentMemory): void {
    try {
      // Atomic write
      const tempPath = `${this.memoryPath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(memory, null, 2), 'utf-8');
      fs.renameSync(tempPath, this.memoryPath);
      logger.debug(`[${this.agentName}] Memory saved`);
    } catch (err) {
      logger.error(`[${this.agentName}] Failed to save memory: ${err}`);
    }
  }

  /**
   * Update the currentFocus field in memory
   */
  protected async updateMemoryCurrentFocus(focus: string): Promise<void> {
    const memory = this.loadMemory();
    if (!memory) return;

    memory.context.currentFocus = focus;
    memory.lastUpdated = new Date().toISOString();

    this.saveMemory(memory);
  }

  /**
   * Add an entry to memory history
   */
  protected async addToMemoryHistory(action: string, result: string): Promise<void> {
    const memory = this.loadMemory();
    if (!memory) return;

    // Add to recent analyses
    if (!memory.context.recentAnalyses.includes(action)) {
      memory.context.recentAnalyses.unshift(action);
      // Keep only last 10
      if (memory.context.recentAnalyses.length > 10) {
        memory.context.recentAnalyses = memory.context.recentAnalyses.slice(0, 10);
      }
    }

    // Add to history
    memory.history.push({
      date: new Date().toISOString().split('T')[0] as string,
      action,
      result,
    });

    memory.lastUpdated = new Date().toISOString();

    this.saveMemory(memory);
  }

  /**
   * Get a summary of the agent's current state
   */
  async getStatus(): Promise<{
    name: string;
    currentTask: AgentTask | null;
    pendingTasks: number;
    completedTasks: number;
    memory: AgentMemory | null;
  }> {
    const allTasks = await this.getAllTasks();
    const currentTask = await this.getCurrentTask();
    const memory = this.loadMemory();

    return {
      name: this.agentName,
      currentTask,
      pendingTasks: allTasks.filter(
        (t) => t.status === 'pending' || t.status === 'in_progress'
      ).length,
      completedTasks: allTasks.filter((t) => t.status === 'completed').length,
      memory,
    };
  }
}

/**
 * Helper to check if an agent has incomplete tasks on startup
 */
export async function checkAgentTasks(agentName: string): Promise<{
  hasIncompleteTasks: boolean;
  currentTask: AgentTask | null;
  crashed: AgentTask[];
  pending: AgentTask[];
}> {
  const { crashed, pending } = await recoverAgentTasks(agentName);
  const queue = createTaskQueue(agentName);
  const currentTask = await queue.getLastIncompleteTask();

  return {
    hasIncompleteTasks: pending.length > 0 || crashed.length > 0,
    currentTask,
    crashed,
    pending,
  };
}

export default AgentBase;
