import type { AgentRuntimePort, AgentServerEvent, TaskCompletePayload } from '@shared-types/api';
import type { UserContext } from '@shared-types/security';
import type { TaskRepository } from './task-repository';
import type { TaskEventPublisher, TaskRecord, TaskRuntimeHandle } from '@shared-types/task';

export interface TaskManagerConfig {
  repository: TaskRepository;
  runtime: AgentRuntimePort;
  publishEvent: TaskEventPublisher;
}

export class TaskManager {
  private repository: TaskRepository;
  private runtime: AgentRuntimePort;
  private publishEvent: TaskEventPublisher;
  private runtimeHandles = new Map<string, TaskRuntimeHandle>();

  constructor(config: TaskManagerConfig) {
    this.repository = config.repository;
    this.runtime = config.runtime;
    this.publishEvent = config.publishEvent;
  }

  createTask(input: string, userContext?: UserContext, conversationId?: string): TaskRecord {
    const task = this.repository.create({ input, userContext, conversationId });
    this.publish('task_created', task.taskId, {
      taskId: task.taskId,
      input: task.input,
      status: task.status,
      createdAt: task.createdAt,
    });
    return task;
  }

  startTask(taskId: string): TaskRecord | undefined {
    const task = this.repository.get(taskId);
    if (!task || task.status === 'running') return task;
    if (task.status === 'cancelled' || task.status === 'completed') return task;

    const controller = new AbortController();
    this.runtimeHandles.set(taskId, {
      controller,
      startedAt: Date.now(),
    });

    const runningTask = this.repository.update(taskId, {
      status: 'running',
      progress: 0,
      currentStep: 'planning',
      startedAt: Date.now(),
      lastError: undefined,
    });

    void this.runtime
      .runTask({
        taskId,
        input: task.input,
        userContext: task.userContext,
        conversationId: task.conversationId,
        signal: controller.signal,
        emit: (event) => this.handleRuntimeEvent(event),
      })
      .then((trace) => {
        if (controller.signal.aborted || this.repository.get(taskId)?.status === 'cancelled') {
          return;
        }

        if (trace.success) {
          this.completeTask(taskId, trace.totalDuration, trace);
        } else {
          this.failTask(taskId, trace.error || 'Agent task failed', trace.totalDuration, trace);
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || this.repository.get(taskId)?.status === 'cancelled') {
          return;
        }

        this.failTask(taskId, error instanceof Error ? error.message : String(error), 0);
      })
      .finally(() => {
        this.runtimeHandles.delete(taskId);
      });

    return runningTask;
  }

  cancelTask(taskId: string): TaskRecord | undefined {
    const task = this.repository.get(taskId);
    if (!task) return undefined;
    if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
      return task;
    }

    this.runtimeHandles.get(taskId)?.controller.abort();
    const cancelledTask = this.repository.update(taskId, {
      status: 'cancelled',
      currentStep: undefined,
      progress: 100,
      cancelledAt: Date.now(),
      completedAt: Date.now(),
      lastError: 'Task cancelled by user',
    });

    this.publish('task_cancelled', taskId, {
      status: 'cancelled',
      reason: 'user_cancelled',
    });
    this.publish('task_complete', taskId, {
      status: 'cancelled',
      duration: this.getRuntimeDuration(taskId),
      error: 'Task cancelled by user',
    } satisfies TaskCompletePayload);

    return cancelledTask;
  }

  retryTask(taskId: string): TaskRecord | undefined {
    const task = this.repository.get(taskId);
    if (!task) return undefined;
    if (task.status !== 'failed' && task.status !== 'cancelled') return task;
    if (task.retryCount >= task.maxRetry) return task;

    const retryTask = this.repository.update(taskId, {
      status: 'queued',
      currentStep: undefined,
      progress: 0,
      retryCount: task.retryCount + 1,
      completedAt: undefined,
      cancelledAt: undefined,
      lastError: undefined,
      trace: undefined,
    });

    this.publish('task_retry', taskId, {
      retryCount: retryTask?.retryCount ?? task.retryCount + 1,
      maxRetry: task.maxRetry,
    });
    this.startTask(taskId);

    return this.repository.get(taskId) ?? retryTask;
  }

  getTask(taskId: string): TaskRecord | undefined {
    return this.repository.get(taskId);
  }

  listTasks(): TaskRecord[] {
    return this.repository.list();
  }

  handleRuntimeEvent(event: AgentServerEvent): void {
    const task = this.repository.get(event.taskId);
    if (!task || task.status === 'cancelled') return;

    this.updateTaskFromEvent(event);
    this.publishEvent(event);
  }

  private completeTask(taskId: string, duration: number, trace?: TaskCompletePayload['trace']): void {
    this.repository.update(taskId, {
      status: 'completed',
      progress: 100,
      currentStep: undefined,
      completedAt: Date.now(),
      trace,
    });

    this.publish('task_complete', taskId, {
      status: 'completed',
      duration,
      trace,
    } satisfies TaskCompletePayload);
  }

  private failTask(taskId: string, message: string, duration: number, trace?: TaskCompletePayload['trace']): void {
    this.repository.update(taskId, {
      status: 'failed',
      progress: 100,
      currentStep: undefined,
      completedAt: Date.now(),
      lastError: message,
      trace,
    });

    this.publish('task_failed', taskId, {
      error: message,
      retryCount: this.repository.get(taskId)?.retryCount ?? 0,
    });
    this.publish('task_complete', taskId, {
      status: 'failed',
      duration,
      trace,
      error: message,
    } satisfies TaskCompletePayload);
  }

  private updateTaskFromEvent(event: AgentServerEvent): void {
    switch (event.type) {
      case 'plan_start':
        this.repository.update(event.taskId, {
          status: 'running',
          currentStep: 'planning',
          progress: 5,
        });
        break;
      case 'plan_update':
        this.repository.update(event.taskId, {
          currentStep: 'workflow',
          progress: 15,
        });
        break;
      case 'tool_start': {
        const payload = event.payload as { toolName?: string };
        this.repository.update(event.taskId, {
          currentStep: payload.toolName ?? 'tool',
        });
        break;
      }
      case 'tool_success':
        this.updateProgressAtLeast(event.taskId, 35);
        break;
      case 'rag_retrieve':
        this.repository.update(event.taskId, {
          currentStep: 'searchKnowledge',
          progress: Math.max(this.repository.get(event.taskId)?.progress ?? 0, 65),
        });
        break;
      case 'reflection':
        this.repository.update(event.taskId, {
          currentStep: 'reflection',
          progress: Math.max(this.repository.get(event.taskId)?.progress ?? 0, 80),
        });
        break;
      case 'memory_update':
        this.repository.update(event.taskId, {
          currentStep: 'memory_update',
          progress: Math.max(this.repository.get(event.taskId)?.progress ?? 0, 90),
        });
        break;
      case 'evaluation_start':
        this.repository.update(event.taskId, {
          currentStep: 'evaluation',
          progress: Math.max(this.repository.get(event.taskId)?.progress ?? 0, 92),
        });
        break;
      case 'evaluation_complete':
        this.repository.update(event.taskId, {
          currentStep: 'evaluation_complete',
          progress: Math.max(this.repository.get(event.taskId)?.progress ?? 0, 94),
        });
        break;
      case 'state_update': {
        const payload = event.payload as { currentStep?: string; progress?: number };
        this.repository.update(event.taskId, {
          currentStep: payload.currentStep,
          progress: payload.progress ?? this.repository.get(event.taskId)?.progress ?? 0,
        });
        break;
      }
      case 'final_answer':
        this.repository.update(event.taskId, {
          currentStep: 'final_answer',
          progress: Math.max(this.repository.get(event.taskId)?.progress ?? 0, 95),
        });
        break;
      case 'tool_error': {
        const payload = event.payload as { error?: { message?: string } };
        this.repository.update(event.taskId, {
          status: 'failed',
          progress: 100,
          lastError: payload.error?.message ?? 'Tool execution failed',
        });
        break;
      }
      case 'permission_denied':
      case 'tool_blocked':
      case 'approval_required': {
        const payload = event.payload as { toolName?: string; reason?: string };
        this.repository.update(event.taskId, {
          currentStep: payload.toolName ?? event.type,
          lastError: payload.reason,
        });
        break;
      }
      case 'task_created':
      case 'task_cancelled':
      case 'task_retry':
      case 'task_failed':
      case 'task_complete':
        break;
    }
  }

  private updateProgressAtLeast(taskId: string, progress: number): void {
    this.repository.update(taskId, {
      progress: Math.max(this.repository.get(taskId)?.progress ?? 0, progress),
    });
  }

  private publish<TPayload>(type: AgentServerEvent<TPayload>['type'], taskId: string, payload: TPayload): void {
    this.publishEvent({
      id: `${taskId}_${type}_${Date.now()}`,
      taskId,
      type,
      timestamp: Date.now(),
      payload,
    });
  }

  private getRuntimeDuration(taskId: string): number {
    const handle = this.runtimeHandles.get(taskId);
    return handle ? Date.now() - handle.startedAt : 0;
  }
}
