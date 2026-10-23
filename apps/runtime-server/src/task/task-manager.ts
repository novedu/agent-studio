import type { AgentResumeContext, Plan, PlanStep, ToolResult } from '@shared-types/agent';
import type { AgentRuntimePort, AgentServerEvent, TaskCompletePayload } from '@shared-types/api';
import type { UserContext } from '@shared-types/security';
import type {
  TaskAttemptStatus,
  TaskRecord,
  TaskStepAttempt,
  TaskStepRecord,
} from '@shared-types/task';
import type { TaskRepository } from './task-repository';
import type { TaskEventPublisher, TaskRuntimeHandle } from '@shared-types/task';
import type { RuntimeModelInfo } from '../env';

export interface TaskManagerConfig {
  repository: TaskRepository;
  runtime: AgentRuntimePort;
  publishEvent: TaskEventPublisher;
  runtimeInfo?: () => RuntimeModelInfo;
}

export interface RetryStepResult {
  task?: TaskRecord;
  error?: {
    code: string;
    message: string;
  };
}

export class TaskManager {
  private repository: TaskRepository;
  private runtime: AgentRuntimePort;
  private publishEvent: TaskEventPublisher;
  private runtimeInfo?: () => RuntimeModelInfo;
  private runtimeHandles = new Map<string, TaskRuntimeHandle>();

  constructor(config: TaskManagerConfig) {
    this.repository = config.repository;
    this.runtime = config.runtime;
    this.publishEvent = config.publishEvent;
    this.runtimeInfo = config.runtimeInfo;
  }

  createTask(input: string, userContext?: UserContext, conversationId?: string): TaskRecord {
    const modelInfo = this.runtimeInfo?.();
    const task = this.repository.create({
      input,
      userContext,
      conversationId,
      provider: modelInfo?.provider,
      model: modelInfo?.model,
    });
    this.publish('task_created', task.taskId, {
      taskId: task.taskId,
      input: task.input,
      status: task.status,
      createdAt: task.createdAt,
    });
    return task;
  }

  startTask(taskId: string, resume?: AgentResumeContext): TaskRecord | undefined {
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
      progress: resume ? task.progress : 0,
      currentStep: resume ? task.currentStep : 'planning',
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
        attemptNo: resume?.attemptNo ?? task.retryCount + 1,
        resume,
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
    const now = Date.now();
    const steps = (task.steps ?? []).map((step) => ({
      ...step,
      attempts: step.attempts.map((attempt) =>
        attempt.status === 'running'
          ? {
              ...attempt,
              status: 'cancelled' as const,
              endedAt: now,
              duration: Math.max(0, now - attempt.startedAt),
            }
          : attempt,
      ),
    }));
    const cancelledTask = this.repository.update(taskId, {
      status: 'cancelled',
      // Cancellation is not completion: keep the step progress the user saw.
      progress: task.progress,
      currentStep: task.currentStep,
      cancelledAt: now,
      completedAt: now,
      // A user cancel is not a failure; lastError stays empty.
      lastError: undefined,
      steps,
    });

    this.publish('task_cancelled', taskId, {
      status: 'cancelled',
      reason: 'user_cancelled',
      currentStep: task.currentStep,
      progress: task.progress,
    });
    this.publish('task_complete', taskId, {
      status: 'cancelled',
      duration: this.getRuntimeDuration(taskId),
    } satisfies TaskCompletePayload);

    return cancelledTask;
  }

  retryTask(taskId: string, inputOverride?: string): TaskRecord | undefined {
    const task = this.repository.get(taskId);
    if (!task) return undefined;
    if (task.status !== 'failed' && task.status !== 'cancelled') return task;
    if (task.retryCount >= task.maxRetry) return task;

    const retryTask = this.repository.update(taskId, {
      status: 'queued',
      input: inputOverride?.trim() || task.input,
      currentStep: undefined,
      progress: 0,
      retryCount: task.retryCount + 1,
      completedAt: undefined,
      cancelledAt: undefined,
      lastError: undefined,
      trace: undefined,
      plan: undefined,
      steps: undefined,
      failedStepId: undefined,
    });

    this.publish('task_retry', taskId, {
      retryCount: retryTask?.retryCount ?? task.retryCount + 1,
      maxRetry: task.maxRetry,
      mode: 'task',
    });
    this.startTask(taskId);

    return this.repository.get(taskId) ?? retryTask;
  }

  /**
   * Re-run exactly one failed step with corrected arguments, then continue with
   * the remaining plan. The original conversation is reused so downstream LLM
   * steps still see the earlier tool results.
   */
  retryStep(taskId: string, stepId: string, args?: Record<string, unknown>): RetryStepResult {
    const task = this.repository.get(taskId);
    if (!task) {
      return { error: { code: 'TASK_NOT_FOUND', message: `Task ${taskId} was not found` } };
    }
    if (task.status !== 'failed') {
      return {
        error: {
          code: 'TASK_NOT_RETRYABLE',
          message: `Task ${taskId} is ${task.status}; only failed tasks can retry a step`,
        },
      };
    }
    if (task.retryCount >= task.maxRetry) {
      return {
        error: {
          code: 'MAX_RETRY_EXCEEDED',
          message: `Task ${taskId} exceeded maxRetry=${task.maxRetry}`,
        },
      };
    }

    const step = task.steps?.find((item) => item.id === stepId);
    if (!step) {
      return { error: { code: 'STEP_NOT_FOUND', message: `Step ${stepId} was not found` } };
    }
    if (step.status !== 'failed' || task.failedStepId !== stepId) {
      return {
        error: {
          code: 'STEP_NOT_RETRYABLE',
          message: `Step ${stepId} is ${step.status}, not the failed step`,
        },
      };
    }
    if (step.tool === 'llm') {
      return {
        error: {
          code: 'STEP_NOT_RETRYABLE',
          message: 'LLM steps cannot be retried with tool arguments',
        },
      };
    }
    if (!task.plan || !task.conversationId) {
      return {
        error: {
          code: 'RETRY_CONTEXT_EXPIRED',
          message: 'The original plan or conversation is no longer available; run the task again',
        },
      };
    }

    const attemptNo = Math.max(0, ...step.attempts.map((attempt) => attempt.attemptNo)) + 1;
    const lastAttempt = step.attempts[step.attempts.length - 1];
    const mergedArgs = { ...(lastAttempt?.args ?? {}), ...(args ?? {}) };
    const now = Date.now();
    const steps = (task.steps ?? []).map((item) => {
      if (item.id !== stepId) return item;
      return {
        ...item,
        status: 'running' as const,
        attempts: [
          ...item.attempts,
          {
            attemptNo,
            status: 'running' as const,
            startedAt: now,
            args: mergedArgs,
          },
        ],
      };
    });

    const updated = this.repository.update(taskId, {
      status: 'queued',
      currentStep: stepId,
      progress: computeProgress(steps),
      retryCount: task.retryCount + 1,
      lastError: undefined,
      completedAt: undefined,
      cancelledAt: undefined,
      failedStepId: undefined,
      steps,
    });

    this.publish('task_retry', taskId, {
      mode: 'step',
      stepId,
      toolName: step.tool,
      attemptNo,
      args: mergedArgs,
      retryCount: updated?.retryCount ?? task.retryCount + 1,
      maxRetry: task.maxRetry,
    });

    const resume: AgentResumeContext = {
      plan: task.plan,
      completedStepIds: steps.filter((item) => item.status === 'completed').map((item) => item.id),
      startStepId: stepId,
      stepArgs: mergedArgs,
      conversationId: task.conversationId,
      attemptNo,
    };
    this.startTask(taskId, resume);

    return { task: this.repository.get(taskId) ?? updated };
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
      failedStepId: undefined,
      trace,
      conversationId: trace?.conversationId ?? this.repository.get(taskId)?.conversationId,
    });

    this.publish('task_complete', taskId, {
      status: 'completed',
      duration,
      trace,
    } satisfies TaskCompletePayload);
  }

  private failTask(taskId: string, message: string, duration: number, trace?: TaskCompletePayload['trace']): void {
    const current = this.repository.get(taskId);
    this.repository.update(taskId, {
      status: 'failed',
      // Do not jump to 100% on failure: progress is completed steps / total steps.
      progress: current?.progress ?? 0,
      completedAt: Date.now(),
      lastError: message,
      trace,
      conversationId: trace?.conversationId ?? current?.conversationId,
      plan: trace?.plan ?? current?.plan,
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
    const task = this.repository.get(event.taskId);
    if (!task) return;

    switch (event.type) {
      case 'plan_start':
        this.repository.update(event.taskId, {
          status: 'running',
          currentStep: 'planning',
          progress: task.progress > 0 ? task.progress : 5,
        });
        break;

      case 'plan_update': {
        const payload = event.payload as { plan?: Plan; steps?: PlanStep[] };
        const plan = payload.plan;
        if (!plan?.steps) break;
        const steps = plan.steps.map((step) => ({
          id: step.id,
          tool: step.tool,
          description: step.description,
          status: step.status === 'completed' ? 'completed' as const : 'pending' as const,
          attempts: [],
        }));
        this.repository.update(event.taskId, {
          plan,
          steps,
          currentStep: 'workflow',
          progress: 15,
          failedStepId: undefined,
        });
        break;
      }

      case 'tool_start': {
        const payload = event.payload as {
          toolName?: string;
          args?: Record<string, unknown>;
          stepId?: string;
          attemptNo?: number;
        };
        const step = findStep(task, payload.stepId);
        if (!step) break;
        const attemptNo = payload.attemptNo ?? 1;
        const attempts = upsertAttempt(step.attempts, {
          attemptNo,
          status: 'running',
          startedAt: event.timestamp,
          args: payload.args,
        });
        this.repository.update(event.taskId, {
          steps: replaceStep(task.steps, step.id, {
            ...step,
            status: 'running',
            attempts,
          }),
          currentStep: step.id,
          lastError: undefined,
        });
        break;
      }

      case 'tool_success': {
        const payload = event.payload as {
          toolName?: string;
          result?: ToolResult;
          stepId?: string;
          attemptNo?: number;
        };
        const step = findStep(task, payload.stepId);
        if (!step) break;
        const attemptNo = payload.attemptNo ?? lastAttemptNo(step);
        const attempts = closeAttempt(step.attempts, attemptNo, 'success', {
          endedAt: event.timestamp,
          duration: payload.result?.duration,
        });
        const steps = replaceStep(task.steps, step.id, {
          ...step,
          status: 'completed',
          attempts,
        });
        this.repository.update(event.taskId, {
          steps,
          progress: computeProgress(steps),
        });
        break;
      }

      case 'tool_error': {
        const payload = event.payload as {
          toolName?: string;
          error?: { type?: string; message?: string };
          stepId?: string;
          attemptNo?: number;
        };
        const step = findStep(task, payload.stepId);
        const message = payload.error?.message ?? 'Tool execution failed';
        if (!step) {
          this.repository.update(event.taskId, {
            status: 'failed',
            lastError: message,
          });
          break;
        }
        const attemptNo = payload.attemptNo ?? lastAttemptNo(step);
        const attempts = closeAttempt(step.attempts, attemptNo, 'failed', {
          endedAt: event.timestamp,
          error: {
            type: payload.error?.type,
            message,
          },
        });
        const steps = replaceStep(task.steps, step.id, {
          ...step,
          status: 'failed',
          attempts,
        });
        this.repository.update(event.taskId, {
          status: 'failed',
          steps,
          failedStepId: step.id,
          currentStep: step.id,
          lastError: message,
          progress: computeProgress(steps),
        });
        break;
      }

      case 'state_update': {
        const payload = event.payload as {
          currentStep?: string;
          completedStepIds?: string[];
          progress?: number;
        };
        const completed = new Set(payload.completedStepIds ?? []);
        const steps = (task.steps ?? []).map((step) => {
          // Check the failed step before currentStep: the failed state_update
          // still points currentStep at the step that just failed.
          if (task.failedStepId === step.id) return { ...step, status: 'failed' as const };
          if (completed.has(step.id)) return { ...step, status: 'completed' as const };
          if (step.id === payload.currentStep) return { ...step, status: 'running' as const };
          if (step.status === 'completed') return step;
          return { ...step, status: 'pending' as const };
        });
        this.repository.update(event.taskId, {
          steps,
          currentStep: payload.currentStep ?? task.currentStep,
          progress: payload.progress ?? task.progress,
        });
        break;
      }

      case 'rag_retrieve':
        this.repository.update(event.taskId, {
          currentStep: 'searchKnowledge',
          progress: Math.max(task.progress, computeProgress(task.steps ?? [])),
        });
        break;

      case 'evaluation_start':
        this.repository.update(event.taskId, {
          currentStep: 'evaluation',
        });
        break;

      case 'evaluation_complete':
        this.repository.update(event.taskId, {
          currentStep: 'evaluation',
        });
        break;

      case 'reflection':
        this.repository.update(event.taskId, {
          // A failed run should keep pointing at the failed step, not at reflection.
          currentStep: task.status === 'failed' ? task.currentStep : 'reflection',
        });
        break;

      case 'memory_update':
        this.repository.update(event.taskId, {
          currentStep: task.status === 'failed' ? task.currentStep : 'memory_update',
        });
        break;

      case 'final_answer':
        this.repository.update(event.taskId, {
          currentStep: 'final_answer',
        });
        break;

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

function findStep(task: TaskRecord, stepId?: string): TaskStepRecord | undefined {
  if (!stepId) {
    // Tools called by the LLM do not belong to a plan step; they are visible as
    // runtime events but are not part of the step/attempt model.
    return undefined;
  }
  return (task.steps ?? []).find((step) => step.id === stepId);
}

function replaceStep(
  steps: TaskStepRecord[] | undefined,
  stepId: string,
  next: TaskStepRecord,
): TaskStepRecord[] {
  return (steps ?? []).map((step) => (step.id === stepId ? next : step));
}

function upsertAttempt(
  attempts: TaskStepAttempt[],
  input: { attemptNo: number; status: TaskAttemptStatus; startedAt: number; args?: Record<string, unknown> },
): TaskStepAttempt[] {
  const exists = attempts.some((attempt) => attempt.attemptNo === input.attemptNo);
  if (exists) {
    return attempts.map((attempt) =>
      attempt.attemptNo === input.attemptNo
        ? {
            ...attempt,
            status: input.status,
            args: input.args ?? attempt.args,
          }
        : attempt,
    );
  }
  return [
    ...attempts,
    {
      attemptNo: input.attemptNo,
      status: input.status,
      startedAt: input.startedAt,
      args: input.args,
    },
  ];
}

function closeAttempt(
  attempts: TaskStepAttempt[],
  attemptNo: number,
  status: Exclude<TaskAttemptStatus, 'running'>,
  patch: { endedAt: number; duration?: number; error?: { type?: string; message: string } },
): TaskStepAttempt[] {
  return attempts.map((attempt) => {
    if (attempt.attemptNo !== attemptNo) return attempt;
    const endedAt = patch.endedAt;
    return {
      ...attempt,
      status,
      endedAt,
      duration: patch.duration ?? Math.max(0, endedAt - attempt.startedAt),
      error: patch.error,
    };
  });
}

function lastAttemptNo(step: TaskStepRecord): number {
  return step.attempts[step.attempts.length - 1]?.attemptNo ?? 1;
}

function computeProgress(steps: TaskStepRecord[]): number {
  if (steps.length === 0) return 0;
  const completed = steps.filter((step) => step.status === 'completed').length;
  return Math.min(100, Math.round((completed / steps.length) * 100));
}
