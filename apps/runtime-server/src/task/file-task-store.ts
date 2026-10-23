import fs from 'node:fs';
import path from 'node:path';
import type { CreateTaskInput, TaskRecord, UpdateTaskInput } from '@shared-types/task';
import type { TaskRepository } from './task-repository';

interface StoredTasks {
  tasks: TaskRecord[];
}

/**
 * Small JSON-file task repository for the local workbench.
 *
 * It is intentionally not a database: the goal is that a finished run survives
 * a server restart and can be reviewed later, not that the server scales.
 */
export class FileTaskRepository implements TaskRepository {
  private tasks = new Map<string, TaskRecord>();
  private readonly file: string;

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.file = path.join(dataDir, 'tasks.json');
    this.load();
  }

  create(input: CreateTaskInput): TaskRecord {
    const now = Date.now();
    const task: TaskRecord = {
      taskId: createTaskId(),
      input: input.input,
      userContext: input.userContext,
      conversationId: input.conversationId,
      provider: input.provider,
      model: input.model,
      status: 'queued',
      progress: 0,
      retryCount: 0,
      maxRetry: input.maxRetry ?? 2,
      createdAt: now,
      updatedAt: now,
    };

    this.tasks.set(task.taskId, task);
    this.persist();
    return task;
  }

  update(taskId: string, patch: UpdateTaskInput): TaskRecord | undefined {
    const task = this.tasks.get(taskId);
    if (!task) return undefined;

    const nextTask: TaskRecord = {
      ...task,
      ...patch,
      updatedAt: Date.now(),
    };

    this.tasks.set(taskId, nextTask);
    this.persist();
    return nextTask;
  }

  get(taskId: string): TaskRecord | undefined {
    return this.tasks.get(taskId);
  }

  list(): TaskRecord[] {
    return Array.from(this.tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  private load(): void {
    if (!fs.existsSync(this.file)) return;

    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')) as StoredTasks;
      if (!Array.isArray(parsed.tasks)) return;
      parsed.tasks.forEach((task) => {
        if (task && typeof task.taskId === 'string') {
          this.tasks.set(task.taskId, task);
        }
      });
    } catch (error) {
      console.warn('[FileTaskRepository] Could not read tasks.json:', error instanceof Error ? error.message : error);
    }
  }

  private persist(): void {
    try {
      const tempFile = `${this.file}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify({ tasks: this.list() }, null, 2), 'utf8');
      fs.renameSync(tempFile, this.file);
    } catch (error) {
      console.error('[FileTaskRepository] Could not persist tasks:', error instanceof Error ? error.message : error);
    }
  }
}

function createTaskId(): string {
  return `task_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
}
