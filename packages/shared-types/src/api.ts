import type { AgentTrace, Plan, PlanStep, ToolResult } from './agent';
import type { ApprovalStatus, ToolRiskLevel, UserContext } from './security';
import type { TaskRecord, TaskStatus } from './task';

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
}

export interface AgentTaskListResponse {
  tasks: AgentTaskStatusResponse[];
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

export interface RetryAgentTaskResponse {
  taskId: string;
  status: Extract<AgentTaskStatus, 'running' | 'queued'>;
  retryCount: number;
  maxRetry: number;
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
}

export interface ToolSuccessPayload {
  toolCallId?: string;
  toolName: string;
  result: ToolResult;
}

export interface ToolErrorPayload {
  toolCallId?: string;
  toolName: string;
  error: {
    type: 'not_found' | 'timeout' | 'argument' | 'execution';
    message: string;
  };
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
}

export interface AgentRuntimePort {
  runTask: (context: RuntimeTaskContext) => Promise<AgentTrace>;
}
