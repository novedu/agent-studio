import type {
  ApprovalStatus,
  ToolRiskLevel,
  ToolSecurityEventType,
  UserContext,
} from './security';

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';
export type MessageStatus = 'pending' | 'streaming' | 'success' | 'error';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  createdAt: number;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolDefinition {
  type: 'function';
  risk: ToolRiskLevel;
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description?: string }>;
      required: string[];
    };
  };
}

export interface ToolResult {
  success: boolean;
  toolName: string;
  data?: unknown;
  error?: string;
  duration: number;
  approvalStatus?: ApprovalStatus;
  security?: {
    eventType: ToolSecurityEventType;
    reason: string;
    risk: ToolRiskLevel;
    userContext: UserContext;
  };
}

export interface RagTraceInfo {
  query: string;
  retrievalDuration: number;
  documentCount: number;
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  toolResult?: ToolResult;
  createdAt: number;
  updatedAt: number;
}

export type AgentEventType =
  | 'llm_start'
  | 'llm_response'
  | 'llm_error'
  | 'tool_start'
  | 'tool_success'
  | 'tool_error'
  | 'permission_denied'
  | 'tool_blocked'
  | 'approval_required'
  | 'agent_finish';

export interface AgentEventBase<T extends AgentEventType> {
  type: T;
  timestamp: number;
}

export interface LlmStartEvent extends AgentEventBase<'llm_start'> {
  conversationId: string;
  messageId: string;
  input: string;
  provider: string;
  messages: ChatMessage[];
  tools: ToolDefinition[];
}

export interface LlmResponseEvent extends AgentEventBase<'llm_response'> {
  conversationId: string;
  messageId: string;
  response: {
    content: string;
    toolCalls?: ToolCall[];
    done: boolean;
  };
}

export interface LlmErrorEvent extends AgentEventBase<'llm_error'> {
  conversationId: string;
  messageId: string;
  provider: string;
  error: {
    message: string;
  };
}

export interface ToolStartEvent extends AgentEventBase<'tool_start'> {
  conversationId: string;
  messageId: string;
  toolName: string;
  args: Record<string, unknown>;
  /** Plan step this tool call belongs to (used for step-level retry). */
  stepId?: string;
  /** 1-based attempt number for this step. */
  attemptNo?: number;
}

export interface ToolSuccessEvent extends AgentEventBase<'tool_success'> {
  conversationId: string;
  messageId: string;
  toolName: string;
  result: ToolResult;
  stepId?: string;
  attemptNo?: number;
}

export interface ToolErrorEvent extends AgentEventBase<'tool_error'> {
  conversationId: string;
  messageId: string;
  toolName: string;
  error: {
    type: 'not_found' | 'timeout' | 'argument' | 'execution';
    message: string;
  };
  stepId?: string;
  attemptNo?: number;
}

export interface ToolSecurityEvent extends AgentEventBase<ToolSecurityEventType> {
  conversationId: string;
  messageId: string;
  toolName: string;
  userContext: UserContext;
  risk: ToolRiskLevel;
  reason: string;
  approvalStatus?: ApprovalStatus;
}

export interface AgentFinishEvent extends AgentEventBase<'agent_finish'> {
  conversationId: string;
  taskId: string;
  totalSteps: number;
  duration: number;
  success: boolean;
}

export type AgentEvent =
  | LlmStartEvent
  | LlmResponseEvent
  | LlmErrorEvent
  | ToolStartEvent
  | ToolSuccessEvent
  | ToolErrorEvent
  | ToolSecurityEvent
  | AgentFinishEvent;

export interface TraceStep {
  stepId: string;
  stepNumber: number;
  type: 'llm' | 'tool';
  status: 'pending' | 'running' | 'success' | 'error';
  llmInput?: string;
  llmMessages?: ChatMessage[];
  llmResponse?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: ToolResult;
  rag?: RagTraceInfo;
  error?: string;
  duration: number;
}

export interface AgentTrace {
  taskId: string;
  conversationId: string;
  steps: TraceStep[];
  plan?: Plan;
  stateHistory?: AgentStateSnapshot[];
  workflowTrace?: WorkflowTraceStep[];
  totalDuration: number;
  success: boolean;
  error?: string;
  finalAnswer?: string;
}

export type PlanStepStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface PlanStep {
  id: string;
  tool: string;
  description: string;
  args?: Record<string, unknown>;
  status: PlanStepStatus;
}

export interface Plan {
  goal: string;
  steps: PlanStep[];
}

/**
 * Everything needed to resume a failed run at one plan step.
 *
 * The conversation is deliberately reused: it already contains the user turn,
 * the earlier tool calls and the failed tool result, so the LLM step after the
 * retried tool sees the full context instead of a detached prompt.
 */
export interface AgentResumeContext {
  plan: Plan;
  completedStepIds: string[];
  startStepId: string;
  /** Corrected arguments for the retried step. */
  stepArgs?: Record<string, unknown>;
  conversationId: string;
  attemptNo: number;
}

export type AgentStateStatus = 'idle' | 'planning' | 'running' | 'completed' | 'failed';

export interface AgentStateSnapshot {
  goal: string;
  currentStepId?: string;
  completedStepIds: string[];
  status: AgentStateStatus;
  toolResults: Record<string, ToolResult>;
  error?: string;
  steps: PlanStep[];
}

export interface WorkflowTraceStep {
  stepId: string;
  description: string;
  status: PlanStepStatus;
  startedAt: number;
  endedAt?: number;
  duration: number;
  traceSteps: TraceStep[];
  error?: string;
}

export type ToolArgs = Record<string, unknown>;

export interface FieldSchema {
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  description?: string;
}

export type ArgsSchema = Record<string, FieldSchema>;

export interface Tool {
  name: string;
  description: string;
  risk?: ToolRiskLevel;
  argsSchema?: ArgsSchema;
  execute: (args: ToolArgs) => Promise<ToolResult>;
}

export interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
  done?: boolean;
  raw?: unknown;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}
