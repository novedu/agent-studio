import type { TaskRepository } from './task-repository';
import type { CreateTaskInput, TaskRecord, UpdateTaskInput } from '@shared-types/task';

export class InMemoryTaskRepository implements TaskRepository {
  private tasks = new Map<string, TaskRecord>();

  create(input: CreateTaskInput): TaskRecord {
    const now = Date.now();
    const task: TaskRecord = {
      taskId: createTaskId(),
      input: input.input,
      userContext: input.userContext,
      conversationId: input.conversationId,
      status: 'queued',
      progress: 0,
      retryCount: 0,
      maxRetry: input.maxRetry ?? 2,
      createdAt: now,
      updatedAt: now,
    };

    this.tasks.set(task.taskId, task);
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
    return nextTask;
  }

  get(taskId: string): TaskRecord | undefined {
    return this.tasks.get(taskId);
  }

  list(): TaskRecord[] {
    return Array.from(this.tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
  }
}

function createTaskId(): string {
  return `task_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
}
