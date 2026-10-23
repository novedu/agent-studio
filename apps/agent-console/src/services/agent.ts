import type { AgentEvent, AgentEventType, Plan } from '../types/agent';
import type { AgentTrace } from '@shared-types/agent';
import type { TaskStepRecord } from '@shared-types/task';

export interface CreateAgentTaskResponse {
  taskId: string;
  status: string;
}

export interface AgentHealthResponse {
  status: string;
  /** Which LLM provider the server is actually using. */
  provider?: string;
  /** Concrete model name; absent in mock mode. */
  model?: string;
  /** Human-readable label, e.g. "Mock · 模板" or "DeepSeek · deepseek-chat". */
  label?: string;
}

export type AgentTaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface AgentTaskStatusResponse {
  taskId: string;
  status: AgentTaskStatus;
  currentStep?: string;
  progress: number;
  createdAt: number;
  retryCount: number;
  maxRetry: number;
  lastError?: string;
  provider?: string;
  model?: string;
  plan?: Plan;
  steps?: TaskStepRecord[];
  failedStepId?: string;
  input?: string;
  trace?: AgentTrace;
}

export class AgentApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'AgentApiError';
  }
}

export interface AgentTaskListResponse {
  tasks: AgentTaskStatusResponse[];
}

export interface AgentTaskHistoryResponse {
  task: AgentTaskStatusResponse;
  events: AgentEvent[];
}

export interface RetryAgentTaskResponse {
  taskId: string;
  status: 'queued' | 'running';
  retryCount: number;
  maxRetry: number;
}

export interface RetryAgentTaskStepResponse {
  taskId: string;
  status: 'running';
  retryCount: number;
  maxRetry: number;
  stepId: string;
  toolName: string;
  attemptNo: number;
  args?: Record<string, unknown>;
}

export interface AgentEventSubscription {
  close: () => void;
}

export interface SubscribeAgentEventsOptions {
  onEvent: (event: AgentEvent) => void;
  onError?: (error: Event) => void;
  onClose?: () => void;
  /** Resume after this event id so a retry does not replay earlier attempts. */
  after?: string;
}

const agentServerURL = (import.meta.env.VITE_AGENT_SERVER_URL ?? 'http://127.0.0.1:3001').replace(/\/$/, '');

const supportedEventTypes: AgentEventType[] = [
  'task_created',
  'plan_start',
  'plan_update',
  'tool_start',
  'tool_success',
  'tool_error',
  'permission_denied',
  'tool_blocked',
  'approval_required',
  'rag_retrieve',
  'reflection',
  'memory_update',
  'evaluation_start',
  'evaluation_complete',
  'state_update',
  'final_answer',
  'task_cancelled',
  'task_retry',
  'task_failed',
  'task_complete',
];

export async function createAgentTask(
  input: string,
  conversationId?: string,
): Promise<CreateAgentTaskResponse> {
  const response = await fetch(`${getAgentServerURL()}/api/agent/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(conversationId ? { input, conversationId } : { input }),
  });

  if (!response.ok) {
    throw new Error(`Create Agent task failed: ${response.status} ${await response.text()}`);
  }

  return response.json() as Promise<CreateAgentTaskResponse>;
}

export async function checkAgentServerHealth(): Promise<AgentHealthResponse> {
  const response = await fetch(`${getAgentServerURL()}/health`, {
    method: 'GET',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Agent Server health check failed: ${response.status}`);
  }

  return response.json() as Promise<AgentHealthResponse>;
}

export async function cancelAgentTask(taskId: string): Promise<{ taskId: string; status: string }> {
  const response = await fetch(`${getAgentServerURL()}/api/agent/tasks/${taskId}/cancel`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw await toAgentApiError(response, 'Cancel Agent task failed');
  }

  return response.json() as Promise<{ taskId: string; status: string }>;
}

export async function getAgentTaskHistory(taskId: string): Promise<AgentTaskHistoryResponse> {
  const response = await fetch(`${getAgentServerURL()}/api/agent/tasks/${taskId}/history`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw await toAgentApiError(response, 'Get Agent task history failed');
  }

  return response.json() as Promise<AgentTaskHistoryResponse>;
}

export async function getAgentTask(taskId: string): Promise<AgentTaskStatusResponse> {
  const response = await fetch(`${getAgentServerURL()}/api/agent/tasks/${taskId}`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw await toAgentApiError(response, 'Get Agent task failed');
  }

  return response.json() as Promise<AgentTaskStatusResponse>;
}

export async function listAgentTasks(): Promise<AgentTaskStatusResponse[]> {
  const response = await fetch(`${getAgentServerURL()}/api/agent/tasks`);

  if (!response.ok) {
    throw new Error(`List Agent tasks failed: ${response.status} ${await response.text()}`);
  }

  const payload = (await response.json()) as AgentTaskListResponse;
  return Array.isArray(payload.tasks) ? payload.tasks : [];
}

export async function retryAgentTask(taskId: string, input?: string): Promise<RetryAgentTaskResponse> {
  const response = await fetch(`${getAgentServerURL()}/api/agent/tasks/${taskId}/retry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input ? { input } : {}),
  });

  if (!response.ok) {
    throw await toAgentApiError(response, 'Retry Agent task failed');
  }

  return response.json() as Promise<RetryAgentTaskResponse>;
}

export async function retryAgentTaskStep(
  taskId: string,
  stepId: string,
  args?: Record<string, unknown>,
): Promise<RetryAgentTaskStepResponse> {
  const response = await fetch(
    `${getAgentServerURL()}/api/agent/tasks/${taskId}/steps/${encodeURIComponent(stepId)}/retry`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args ? { args } : {}),
    },
  );

  if (!response.ok) {
    throw await toAgentApiError(response, 'Retry Agent step failed');
  }

  return response.json() as Promise<RetryAgentTaskStepResponse>;
}

export function subscribeAgentEvents(
  taskId: string,
  options: SubscribeAgentEventsOptions,
): AgentEventSubscription {
  const query = options.after ? `?after=${encodeURIComponent(options.after)}` : '';
  const eventSource = new EventSource(`${getAgentServerURL()}/api/agent/tasks/${taskId}/events${query}`);

  const handleMessage = (message: MessageEvent<string>) => {
    const event = parseAgentEvent(message.data);
    if (!event) return;

    options.onEvent(event);

    if (event.type === 'task_complete') {
      eventSource.close();
      options.onClose?.();
    }
  };

  supportedEventTypes.forEach((type) => {
    eventSource.addEventListener(type, handleMessage as EventListener);
  });

  eventSource.onerror = (error) => {
    options.onError?.(error);
  };

  return {
    close: () => {
      eventSource.close();
      options.onClose?.();
    },
  };
}

export function getAgentServerURL(): string {
  return agentServerURL;
}

async function toAgentApiError(response: Response, fallback: string): Promise<AgentApiError> {
  const text = await response.text();
  try {
    const payload = JSON.parse(text) as { error?: { code?: string; message?: string } };
    if (payload.error?.code) {
      return new AgentApiError(
        payload.error.message ?? fallback,
        payload.error.code,
        response.status,
      );
    }
  } catch {
    // Fall through with the raw body.
  }

  return new AgentApiError(`${fallback}: ${response.status} ${text}`, 'UNKNOWN', response.status);
}

function parseAgentEvent(raw: string): AgentEvent | null {
  try {
    return JSON.parse(raw) as AgentEvent;
  } catch {
    return null;
  }
}
