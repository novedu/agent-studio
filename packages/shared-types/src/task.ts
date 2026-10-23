import type { AgentTrace, Plan, PlanStepStatus } from './agent';
import type { UserContext } from './security';
import type { AgentServerEvent } from './api';

export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export type TaskAttemptStatus = 'running' | 'success' | 'failed' | 'cancelled';

/** One execution attempt of one plan step (a step can be retried N times). */
export interface TaskStepAttempt {
  attemptNo: number;
  status: TaskAttemptStatus;
  startedAt: number;
  endedAt?: number;
  duration?: number;
  args?: Record<string, unknown>;
  error?: {
    type?: string;
    message: string;
  };
}

export interface TaskStepRecord {
  id: string;
  tool: string;
  description: string;
  status: PlanStepStatus;
  attempts: TaskStepAttempt[];
}

export interface TaskRecord {
  taskId: string;
  input: string;
  userContext?: UserContext;
  conversationId?: string;
  status: TaskStatus;
  currentStep?: string;
  progress: number;
  retryCount: number;
  maxRetry: number;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
  cancelledAt?: number;
  lastError?: string;
  trace?: AgentTrace;
  plan?: Plan;
  steps?: TaskStepRecord[];
  /** The step that failed most recently; cleared when a retry starts. */
  failedStepId?: string;
  /** LLM provider/model that actually served this run. */
  provider?: string;
  model?: string;
}

export interface CreateTaskInput {
  input: string;
  userContext?: UserContext;
  conversationId?: string;
  maxRetry?: number;
  provider?: string;
  model?: string;
}

export interface UpdateTaskInput {
  input?: string;
  status?: TaskStatus;
  currentStep?: string;
  progress?: number;
  retryCount?: number;
  startedAt?: number;
  completedAt?: number;
  cancelledAt?: number;
  lastError?: string;
  trace?: AgentTrace;
  plan?: Plan;
  steps?: TaskStepRecord[];
  /** The step that failed most recently; cleared when a retry starts. */
  failedStepId?: string;
  conversationId?: string;
}

export interface TaskRuntimeHandle {
  controller: AbortController;
  startedAt: number;
}

export type TaskEventPublisher = (event: AgentServerEvent) => void;
