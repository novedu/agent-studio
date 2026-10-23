import type { AgentResumeContext, AgentTrace, Plan, PlanStep, ToolResult } from './agent';
import type { ApprovalStatus, ToolRiskLevel, UserContext } from './security';
import type { TaskRecord, TaskStatus, TaskStepRecord } from './task';

export type AgentTaskStatus = TaskStatus;

export type AgentServerEventType =
  | 'task_created'
  | 'plan_start'
  | 'plan_update'
  | 'tool_start'
  | 'tool_success'
  | 'tool_error'
  | 'permission_denied'
  | 'tool_blocked'
  | 'approval_required'
  | 'rag_retrieve'
  | 'reflection'
  | 'memory_update'
  | 'evaluation_start'
  | 'evaluation_complete'
  | 'state_update'
  | 'final_answer'
  | 'task_cancelled'
  | 'task_retry'
  | 'task_failed'
  | 'task_complete';

export interface AgentServerEvent<TPayload = unknown> {
  id: string;
  taskId: string;
  type: AgentServerEventType;
  timestamp: number;
  payload: TPayload;
}

export interface CreateAgentTaskRequest {
  input: string;
  userContext?: UserContext;
  /** Client-owned id so follow-up tasks share one conversation. */
  conversationId?: string;
}

export interface CreateAgentTaskResponse {
  taskId: string;
  status: Extract<AgentTaskStatus, 'running'>;
}

export type AgentTaskSnapshot = TaskRecord;

export interface AgentTaskStatusResponse {
  taskId: string;
  status: AgentTaskStatus;
  currentStep?: string;
  progress: number;
  createdAt: number;
  retryCount: number;
  maxRetry: number;
  lastError?: string;
  /** LLM provider/model that served this run. */
  provider?: string;
  model?: string;
  /** Present on single-task reads; list responses omit plan/steps/trace. */
  plan?: Plan;
  steps?: TaskStepRecord[];
  failedStepId?: string;
  input?: string;
  trace?: AgentTrace;
}

export interface AgentTaskListResponse {
  tasks: AgentTaskStatusResponse[];
}

export interface AgentTaskHistoryResponse {
  task: AgentTaskStatusResponse;
  events: AgentServerEvent[];
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

export interface CancelAgentTaskResponse {
  taskId: string;
  status: Extract<AgentTaskStatus, 'cancelled'>;
}

export interface RetryAgentTaskRequest {
  /** Optional replacement input for a full task retry. */
  input?: string;
}

export interface RetryAgentTaskResponse {
  taskId: string;
  status: Extract<AgentTaskStatus, 'running' | 'queued'>;
  retryCount: number;
  maxRetry: number;
}

export interface RetryAgentTaskStepRequest {
  /** Corrected arguments for the failed step; merged over the original args. */
  args?: Record<string, unknown>;
}

export interface RetryAgentTaskStepResponse {
  taskId: string;
  status: Extract<AgentTaskStatus, 'running'>;
  retryCount: number;
  maxRetry: number;
  stepId: string;
  toolName: string;
  attemptNo: number;
  args?: Record<string, unknown>;
}

export interface PlanStartPayload {
  input: string;
}

export interface PlanUpdatePayload {
  plan: Plan;
  steps: PlanStep[];
}

export interface ToolStartPayload {
  toolCallId?: string;
  toolName: string;
  args: Record<string, unknown>;
  stepId?: string;
  attemptNo?: number;
}

export interface ToolSuccessPayload {
  toolCallId?: string;
  toolName: string;
  result: ToolResult;
  stepId?: string;
  attemptNo?: number;
}

export interface ToolErrorPayload {
  toolCallId?: string;
  toolName: string;
  error: {
    type: 'not_found' | 'timeout' | 'argument' | 'execution';
    message: string;
  };
  stepId?: string;
  attemptNo?: number;
}

export interface ToolSecurityPayload {
  toolName: string;
  userContext: UserContext;
  risk: ToolRiskLevel;
  reason: string;
  approvalStatus?: ApprovalStatus;
}

export interface RagRetrievePayload {
  query: string;
  documents: Array<{
    id: string;
    content: string;
    metadata?: Record<string, unknown>;
    score?: number;
  }>;
  duration: number;
}

export interface ReflectionPayload {
  status: 'passed' | 'needs_replanning' | 'failed';
  message: string;
}

export interface MemoryUpdatePayload {
  memoryType: 'working' | 'episodic' | 'semantic';
  items: Array<{
    id: string;
    type?: 'working' | 'episodic' | 'semantic';
    content: string;
    importance: number;
  }>;
}

export interface EvaluationCompletePayload {
  score: number;
  criteria: {
    completeness: number;
    accuracy: number;
    groundedness: number;
    taskCompletion: number;
  };
  feedback: string[];
}

export interface StateUpdatePayload {
  status: AgentTaskStatus;
  currentStep?: string;
  completedStepIds: string[];
  progress: number;
  attemptNo?: number;
}

export interface FinalAnswerPayload {
  delta?: string;
  content?: string;
  done?: boolean;
}

export interface TaskCompletePayload {
  status: Extract<AgentTaskStatus, 'completed' | 'failed' | 'cancelled'>;
  duration: number;
  trace?: AgentTrace;
  error?: string;
}

export type AgentEventSink = (event: AgentServerEvent) => void;

export interface RuntimeTaskContext {
  taskId: string;
  input: string;
  userContext?: UserContext;
  conversationId?: string;
  signal?: AbortSignal;
  emit: AgentEventSink;
  /** 1-based run number for this task (task retries increment it). */
  attemptNo?: number;
  /** Set when resuming a failed run at a single step. */
  resume?: AgentResumeContext;
}

export interface AgentRuntimePort {
  runTask: (context: RuntimeTaskContext) => Promise<AgentTrace>;
}
