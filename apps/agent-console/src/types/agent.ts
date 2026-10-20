import type { AgentServerEvent, AgentServerEventType } from '@shared-types/api';
import type { EvaluationCriteria, EvaluationResult } from '@shared-types/trace';

export type AgentEventType = AgentServerEventType | 'workflow_start' | 'replanning';

export type AgentEvent = Omit<AgentServerEvent, 'type'> & { type: AgentEventType };

export type MessageRole = 'user' | 'assistant';
export type StepStatus = 'pending' | 'running' | 'success' | 'failed';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: number;
  /** Set when the SSE stream dropped before the answer finished. */
  interrupted?: boolean;
}

export type ConsoleMessage = Message;

export interface PlanStep {
  id: string;
  description: string;
  args?: Record<string, unknown>;
  status: StepStatus;
  tool?: string;
}

export interface Plan {
  goal: string;
  steps: PlanStep[];
}

export type AgentPlan = Plan;

export interface WorkflowEvent {
  id: string;
  type: AgentEventType;
  title: string;
  detail?: string;
  timestamp: number;
  status: StepStatus;
}

export interface ToolCallRecord {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: StepStatus;
  duration?: number;
}

export interface CitationRecord {
  id: string;
  source: string;
  content: string;
  chunk?: number | string;
  score?: number;
}

export interface MemoryRecord {
  id: string;
  type: 'working' | 'episodic' | 'semantic';
  content: string;
  importance: number;
  updatedAt: number;
}

export interface AgentStateSnapshot {
  goal: string;
  currentStepId?: string;
  completedStepIds: string[];
  status: 'idle' | 'planning' | 'running' | 'success' | 'failed';
  error?: string;
}

export type { EvaluationCriteria, EvaluationResult };

export interface AgentStreamEvent {
  kind:
    'message' | 'plan' | 'workflow' | 'tool' | 'citation' | 'memory' | 'state' | 'done' | 'error';
  payload: unknown;
}
