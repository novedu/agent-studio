import type { AgentEventSink, AgentServerEvent } from '@shared-types/api';
import type {
  AgentTaskHistoryResponse,
  AgentTaskListResponse,
  AgentTaskStatusResponse,
  ApiErrorResponse,
  CancelAgentTaskResponse,
  CreateAgentTaskRequest,
  CreateAgentTaskResponse,
  RetryAgentTaskRequest,
  RetryAgentTaskResponse,
  RetryAgentTaskStepRequest,
  RetryAgentTaskStepResponse,
} from '@shared-types/api';
import type { TaskManager } from '../task/task-manager';
import type { TaskRecord } from '@shared-types/task';

export const agentRoutes = [
  {
    method: 'POST',
    path: '/api/agent/tasks',
    description: 'Create an Agent task and start runtime execution.',
  },
  {
    method: 'POST',
    path: '/api/agent/tasks/:taskId/cancel',
    description: 'Cancel a running or queued Agent task.',
  },
  {
    method: 'POST',
    path: '/api/agent/tasks/:taskId/retry',
    description: 'Retry a failed or cancelled Agent task.',
  },
  {
    method: 'POST',
    path: '/api/agent/tasks/:taskId/steps/:stepId/retry',
    description: 'Re-run one failed step with corrected args, then continue the plan.',
  },
  {
    method: 'GET',
    path: '/api/agent/tasks/:taskId/events',
    description: 'Subscribe to Agent task events through SSE.',
  },
  {
    method: 'GET',
    path: '/api/agent/tasks/:taskId',
    description: 'Query one Agent task snapshot.',
  },
  {
    method: 'GET',
    path: '/api/agent/tasks/:taskId/history',
    description: 'Read the persisted task snapshot and its full event history.',
  },
  {
    method: 'GET',
    path: '/api/agent/tasks',
    description: 'List Agent task history.',
  },
] as const;

export interface AgentEventHub {
  publish: (event: AgentServerEvent) => void;
  subscribe: (taskId: string, listener: AgentEventSink, afterEventId?: string) => () => void;
  getHistory: (taskId: string) => AgentServerEvent[];
}

export interface AgentRouteDependencies {
  taskManager: TaskManager;
  eventHub: AgentEventHub;
}

export interface AgentRouteHandlers {
  createTask: (
    request: CreateAgentTaskRequest,
  ) => Promise<CreateAgentTaskResponse | ApiErrorResponse>;
  cancelTask: (taskId: string) => Promise<CancelAgentTaskResponse | ApiErrorResponse>;
  retryTask: (
    taskId: string,
    request?: RetryAgentTaskRequest,
  ) => Promise<RetryAgentTaskResponse | ApiErrorResponse>;
  retryTaskStep: (
    taskId: string,
    stepId: string,
    request?: RetryAgentTaskStepRequest,
  ) => Promise<RetryAgentTaskStepResponse | ApiErrorResponse>;
  getTask: (taskId: string) => Promise<AgentTaskStatusResponse | ApiErrorResponse>;
  getTaskHistory: (taskId: string) => Promise<AgentTaskHistoryResponse | ApiErrorResponse>;
  listTasks: () => Promise<AgentTaskListResponse>;
  subscribeTaskEvents: (
    taskId: string,
    listener: AgentEventSink,
    afterEventId?: string,
  ) => (() => void) | ApiErrorResponse;
}

export function createAgentRouteHandlers(deps: AgentRouteDependencies): AgentRouteHandlers {
  return {
    createTask: async (request) => {
      const input = request.input.trim();

      if (!input) {
        return createApiError('INVALID_INPUT', 'input is required');
      }

      const task = deps.taskManager.createTask(input, request.userContext, request.conversationId);
      deps.taskManager.startTask(task.taskId);

      return {
        taskId: task.taskId,
        status: 'running',
      };
    },

    cancelTask: async (taskId) => {
      const before = deps.taskManager.getTask(taskId);
      const task = deps.taskManager.cancelTask(taskId);

      if (!task || !before) {
        return createTaskNotFoundError(taskId);
      }

      if (task.status !== 'cancelled') {
        return createApiError('TASK_NOT_CANCELLABLE', `Task ${taskId} is ${before.status}, only queued/running tasks can cancel`);
      }

      return {
        taskId: task.taskId,
        status: 'cancelled',
      };
    },

    retryTask: async (taskId, request) => {
      const before = deps.taskManager.getTask(taskId);
      const task = deps.taskManager.retryTask(taskId, request?.input);

      if (!task || !before) {
        return createTaskNotFoundError(taskId);
      }

      if (before.retryCount >= before.maxRetry && (before.status === 'failed' || before.status === 'cancelled')) {
        return createApiError('MAX_RETRY_EXCEEDED', `Task ${taskId} exceeded maxRetry=${before.maxRetry}`);
      }

      if (before.status !== 'failed' && before.status !== 'cancelled') {
        return createApiError('TASK_NOT_RETRYABLE', `Task ${taskId} is ${before.status}, only failed/cancelled tasks can retry`);
      }

      return {
        taskId: task.taskId,
        status: task.status === 'running' ? 'running' : 'queued',
        retryCount: task.retryCount,
        maxRetry: task.maxRetry,
      };
    },

    retryTaskStep: async (taskId, stepId, request) => {
      const result = deps.taskManager.retryStep(taskId, stepId, request?.args);

      if (result.error) {
        return createApiError(result.error.code, result.error.message);
      }

      const task = result.task;
      const step = task?.steps?.find((item) => item.id === stepId);
      const attempt = step?.attempts[step.attempts.length - 1];

      return {
        taskId,
        status: 'running',
        retryCount: task?.retryCount ?? 1,
        maxRetry: task?.maxRetry ?? 2,
        stepId,
        toolName: step?.tool ?? '',
        attemptNo: attempt?.attemptNo ?? 1,
        args: attempt?.args,
      };
    },

    getTask: async (taskId) => {
      const task = deps.taskManager.getTask(taskId);

      if (!task) {
        return createTaskNotFoundError(taskId);
      }

      return toTaskStatusResponse(task, true);
    },

    getTaskHistory: async (taskId) => {
      const task = deps.taskManager.getTask(taskId);

      if (!task) {
        return createTaskNotFoundError(taskId);
      }

      return {
        task: toTaskStatusResponse(task, true),
        events: deps.eventHub.getHistory(taskId),
      };
    },

    listTasks: async () => ({
      tasks: deps.taskManager.listTasks().map((task) => toTaskStatusResponse(task, false)),
    }),

    subscribeTaskEvents: (taskId, listener, afterEventId) => {
      const task = deps.taskManager.getTask(taskId);

      if (!task) {
        return createTaskNotFoundError(taskId);
      }

      return deps.eventHub.subscribe(taskId, listener, afterEventId);
    },
  };
}

function toTaskStatusResponse(task: TaskRecord, includeRuntime: boolean): AgentTaskStatusResponse {
  return {
    taskId: task.taskId,
    status: task.status,
    currentStep: task.currentStep,
    progress: task.progress,
    createdAt: task.createdAt,
    retryCount: task.retryCount,
    maxRetry: task.maxRetry,
    lastError: task.lastError,
    provider: task.provider,
    model: task.model,
    ...(includeRuntime
      ? {
          plan: task.plan,
          steps: task.steps,
          failedStepId: task.failedStepId,
          input: task.input,
          trace: task.trace,
        }
      : {}),
  };
}

function createTaskNotFoundError(taskId: string): ApiErrorResponse {
  return createApiError('TASK_NOT_FOUND', `Task ${taskId} was not found`);
}

function createApiError(code: string, message: string): ApiErrorResponse {
  return {
    error: {
      code,
      message,
    },
  };
}
