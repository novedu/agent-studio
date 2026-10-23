import { create, type StoreApi } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  AgentEvent,
  AgentEventType,
  AgentStateSnapshot,
  CitationRecord,
  EvaluationResult,
  MemoryRecord,
  Message,
  Plan,
  StepStatus,
  ToolCallRecord,
  WorkflowEvent,
} from '../types/agent';

interface AgentState {
  messages: Message[];
  events: AgentEvent[];
  plan: Plan | null;
  tools: ToolCallRecord[];
  citations: CitationRecord[];
  memory: MemoryRecord[];
  evaluation?: EvaluationResult;
  status: 'idle' | 'running' | 'success' | 'error' | 'cancelled';
  state?: AgentStateSnapshot;
  addMessage: (message: Message) => void;
  updateMessage: (id: string, patch: Partial<Message>) => void;
  addEvent: (event: AgentEvent) => void;
  updatePlan: (plan: Plan) => void;
  reset: () => void;
  beginTask: (input: string) => void;
  handleAgentEvent: (event: AgentEvent) => void;
  updateFromEvent: (event: AgentEvent) => void;

  workflow: WorkflowEvent[];
  memories: MemoryRecord[];
  /** Survives task resets so follow-up messages stay in one conversation. */
  conversationId?: string;
  ensureConversationId: () => string;
  isStreaming: boolean;
  activeAssistantMessageId?: string;
  answerBuffer: string;
  setStreaming: (value: boolean) => void;
  upsertTool: (tool: ToolCallRecord) => void;
  setCitations: (citations: CitationRecord[]) => void;
  setMemory: (memory: MemoryRecord[]) => void;
  setState: (state: AgentStateSnapshot) => void;
  setStatus: (status: AgentState['status']) => void;
  /** Human readable failure shown above the composer. */
  lastError?: string;
  setLastError: (message?: string) => void;
  /** Safe runtime identity reported by /health (mock vs real model). */
  runtimeProvider?: string;
  runtimeModel?: string;
  setRuntimeInfo: (info: { provider?: string; model?: string }) => void;
  /** Flags the message that was streaming when the connection dropped. */
  markInterrupted: () => void;
  /** Clears the visible transcript and starts a fresh conversation. */
  startNewConversation: () => void;
  /** Starts a new assistant turn for a step retry without clearing runtime history. */
  beginRetry: () => void;
  /** Marks a user-confirmed cancellation (only after the server returns 2xx). */
  markCancelled: () => void;
}

export const useAgentStore = create<AgentState>()(
  persist(
    (set, get) => ({
  messages: [],
  events: [],
  plan: null,
  tools: [],
  citations: [],
  memory: [],
  workflow: [],
  memories: [],
  status: 'idle',
  isStreaming: false,
  answerBuffer: '',
  lastError: undefined,

  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  updateMessage: (id, patch) =>
    set((state) => ({
      messages: state.messages.map((message) =>
        message.id === id ? { ...message, ...patch } : message,
      ),
    })),
  addEvent: (event) =>
    set((state) => ({
      events: [...state.events, event],
      workflow: [...state.workflow, toWorkflowEvent(event)],
    })),
  updatePlan: (plan) => set({ plan: normalizePlan(plan) }),
  reset: () =>
    set({
      events: [],
      workflow: [],
      tools: [],
      citations: [],
      memory: [],
      memories: [],
      evaluation: undefined,
      plan: null,
      state: undefined,
      status: 'idle',
      isStreaming: false,
      activeAssistantMessageId: undefined,
      answerBuffer: '',
      lastError: undefined,
    }),

  ensureConversationId: () => {
    const current = get().conversationId;
    if (current) return current;
    const next = createId('conv');
    set({ conversationId: next });
    return next;
  },
  beginTask: (input) => {
    const assistantMessageId = createId('msg');
    get().reset();
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: createId('msg'),
          role: 'user',
          content: input,
          createdAt: Date.now(),
        },
        {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          createdAt: Date.now(),
        },
      ],
      activeAssistantMessageId: assistantMessageId,
      answerBuffer: '',
      status: 'running',
      isStreaming: true,
    }));
  },

  handleAgentEvent: (event) => {
    handleAgentEvent(set, get, event);
  },
  updateFromEvent: (event) => {
    get().handleAgentEvent(event);
  },

  setStreaming: (value) =>
    set((state) => ({
      isStreaming: value,
      // Never downgrade a finished run to idle just because the composer unlocked.
      status: value ? 'running' : state.status,
    })),
  upsertTool: (tool) =>
    set((state) => {
      const exists = state.tools.some((item) => item.id === tool.id);
      return {
        tools: exists
          ? state.tools.map((item) => (item.id === tool.id ? tool : item))
          : [...state.tools, tool],
      };
    }),
  setCitations: (citations) => set({ citations }),
  setMemory: (memory) => set({ memory, memories: memory }),
  setState: (agentState) => set({ state: agentState }),
  setStatus: (status) => set({ status, isStreaming: status === 'running' }),
  setLastError: (message) => set({ lastError: message }),
  setRuntimeInfo: (info) => set({ runtimeProvider: info.provider, runtimeModel: info.model }),
  markInterrupted: () => {
    const { activeAssistantMessageId, messages } = get();
    if (!activeAssistantMessageId) {
      set({ status: 'error', isStreaming: false });
      return;
    }
    set({
      status: 'error',
      isStreaming: false,
      messages: messages.map((message) =>
        message.id === activeAssistantMessageId ? { ...message, interrupted: true } : message,
      ),
    });
  },

  startNewConversation: () => {
    get().reset();
    set({ messages: [], conversationId: undefined, status: 'idle', isStreaming: false });
  },

  beginRetry: () => {
    const assistantMessageId = createId('msg');
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          createdAt: Date.now(),
        },
      ],
      activeAssistantMessageId: assistantMessageId,
      answerBuffer: '',
      status: 'running',
      isStreaming: true,
      lastError: undefined,
    }));
  },

  markCancelled: () => {
    const { activeAssistantMessageId, messages } = get();
    set({
      status: 'cancelled',
      isStreaming: false,
      lastError: undefined,
      messages: activeAssistantMessageId
        ? messages.map((message) =>
            message.id === activeAssistantMessageId && !message.content
              ? { ...message, content: '任务已取消。' }
              : message,
          )
        : messages,
    });
  },
    }),
    {
      name: 'agent-studio:session',
      storage: createJSONStorage(() => localStorage),
      // Only the transcript and the conversation id survive a reload; runtime
      // state (events, plan, tools) is rebuilt per task.
      partialize: (state) => ({
        messages: state.messages,
        conversationId: state.conversationId,
      }),
    },
  ),
);

type StoreSet = StoreApi<AgentState>['setState'];
type StoreGet = StoreApi<AgentState>['getState'];

function handleAgentEvent(set: StoreSet, get: StoreGet, event: AgentEvent): void {
  const payload = event.payload as Record<string, unknown>;
  const isAnswerDelta = event.type === 'final_answer' && typeof payload.delta === 'string';

  if (!isAnswerDelta) {
    get().addEvent(event);
  }

  switch (event.type) {
    case 'task_created':
      set({ status: 'running', isStreaming: true });
      break;
    case 'plan_start':
      set({ status: 'running', isStreaming: true });
      break;
    case 'plan_update':
      if (isPlan(payload.plan)) {
        set({ plan: normalizePlan(payload.plan) });
      }
      break;
    case 'tool_start':
      upsertToolFromEvent(set, event, 'running');
      break;
    case 'tool_success':
      upsertToolFromEvent(set, event, 'success');
      break;
    case 'tool_error': {
      upsertToolFromEvent(set, event, 'failed');
      const message = (payload.error as { message?: string } | undefined)?.message;
      set({ status: 'error', isStreaming: false, lastError: message });
      break;
    }
    case 'permission_denied':
    case 'tool_blocked':
    case 'approval_required':
      set({ lastError: (payload.reason as string | undefined) ?? '工具调用被安全策略拦截' });
      break;
    case 'rag_retrieve':
      set({ citations: toCitations(event), memory: get().memory, memories: get().memories });
      break;
    case 'memory_update':
      set((state) => {
        const nextMemory = mergeMemory(state.memory, toMemoryRecords(event));
        return { memory: nextMemory, memories: nextMemory };
      });
      break;
    case 'evaluation_start':
      break;
    case 'evaluation_complete':
      if (isEvaluationResult(payload)) {
        set({ evaluation: payload });
      }
      break;
    case 'state_update': {
      const snapshot = toStateSnapshot(get(), event);
      const currentPlan = get().plan;
      set({
        state: snapshot,
        plan: currentPlan
          ? {
              ...currentPlan,
              steps: currentPlan.steps.map((step) => {
                if (snapshot.completedStepIds.includes(step.id)) {
                  return { ...step, status: 'success' as const };
                }
                if (step.id === snapshot.currentStepId) {
                  return {
                    ...step,
                    status: snapshot.status === 'failed' ? 'failed' : 'running',
                  };
                }
                return step.status === 'failed' ? step : { ...step, status: 'pending' as const };
              }),
            }
          : currentPlan,
      });
      break;
    }
    case 'final_answer':
      applyFinalAnswer(set, get, payload);
      break;
    case 'task_complete': {
      const nextStatus = getTaskCompleteStatus(payload);
      const state = get();
      const activeId = state.activeAssistantMessageId;
      const activeMessage = activeId
        ? state.messages.find((message) => message.id === activeId)
        : undefined;
      const payloadError = typeof payload.error === 'string' ? payload.error : undefined;

      // A failed run has no answer, so leave a readable failure note instead of
      // a forever-"thinking" assistant bubble.
      const fallback =
        nextStatus === 'error'
          ? `任务执行失败。\n\n${payloadError ?? state.lastError ?? '请查看失败步骤并重试。'}`
          : nextStatus === 'cancelled'
            ? '任务已取消。'
            : undefined;

      set({
        status: nextStatus,
        isStreaming: false,
        activeAssistantMessageId: undefined,
        lastError: nextStatus === 'error' ? (payloadError ?? state.lastError) : undefined,
        messages:
          fallback && activeId && activeMessage && !activeMessage.content
            ? state.messages.map((message) =>
                message.id === activeId ? { ...message, content: fallback } : message,
              )
            : state.messages,
      });
      break;
    }
    case 'task_cancelled':
      set({ status: 'cancelled', isStreaming: false, lastError: undefined });
      break;
    case 'task_retry':
      set({ status: 'running', isStreaming: true, lastError: undefined });
      break;
    case 'task_failed':
      set({ status: 'error', isStreaming: false });
      break;
    case 'workflow_start':
    case 'reflection':
    case 'replanning':
      break;
  }
}

function upsertToolFromEvent(set: StoreSet, event: AgentEvent, status: StepStatus): void {
  const payload = event.payload as {
    toolName?: unknown;
    args?: unknown;
    result?: { data?: unknown; duration?: number; error?: string };
    error?: unknown;
    stepId?: unknown;
    attemptNo?: unknown;
  };
  const name = typeof payload.toolName === 'string' ? payload.toolName : 'unknownTool';
  const stepId = typeof payload.stepId === 'string' ? payload.stepId : undefined;
  const attemptNo = typeof payload.attemptNo === 'number' ? payload.attemptNo : 1;
  const result = payload.result?.data ?? payload.result ?? payload.error;

  set((state) => {
    const id = getToolRecordId(event, name, stepId, attemptNo);
    const previous = state.tools.find((tool) => tool.id === id);
    const tool: ToolCallRecord = {
      id,
      name,
      stepId,
      attemptNo,
      args: isRecord(payload.args) ? payload.args : (previous?.args ?? {}),
      status,
      result: result ?? previous?.result,
      duration: payload.result?.duration ?? previous?.duration,
    };
    const exists = state.tools.some((item) => item.id === tool.id);

    return {
      tools: exists
        ? state.tools.map((item) => (item.id === tool.id ? tool : item))
        : [...state.tools, tool],
    };
  });
}

function applyFinalAnswer(set: StoreSet, get: StoreGet, payload: Record<string, unknown>): void {
  if (typeof payload.delta === 'string') {
    const nextContent = `${get().answerBuffer}${payload.delta}`;
    set((state) => ({
      answerBuffer: nextContent,
      messages: updateAssistantMessage(state, nextContent),
    }));
    return;
  }

  if (typeof payload.content === 'string') {
    set((state) => ({
      answerBuffer: payload.content as string,
      messages: updateAssistantMessage(state, payload.content as string),
    }));
  }

  if (payload.done === true) {
    // The answer is complete, but the task is not: evaluation and task_complete
    // still follow. Declaring success here made the UI show "success" while the
    // graph was still replaying earlier events, so only the composer is unlocked.
    set({ isStreaming: false });
  }
}

function updateAssistantMessage(state: AgentState, content: string): Message[] {
  const assistantMessageId = state.activeAssistantMessageId ?? createId('msg');
  const exists = state.messages.some((message) => message.id === assistantMessageId);

  if (!exists) {
    return [
      ...state.messages,
      {
        id: assistantMessageId,
        role: 'assistant',
        content,
        createdAt: Date.now(),
      },
    ];
  }

  return state.messages.map((message) =>
    message.id === assistantMessageId ? { ...message, content } : message,
  );
}

function toWorkflowEvent(event: AgentEvent): WorkflowEvent {
  const payload = event.payload as
    | {
        title?: string;
        detail?: string;
        status?: string;
        toolName?: string;
        query?: string;
        error?: { message?: string };
        reason?: string;
      }
    | undefined;

  return {
    id: event.id,
    type: event.type,
    title: payload?.title ?? getDefaultTitle(event.type, payload),
    detail: payload?.detail ?? getDefaultDetail(event.type, payload),
    timestamp: event.timestamp,
    status: normalizeStepStatus(payload?.status),
  };
}

function normalizePlan(plan: Plan): Plan {
  return {
    goal: plan.goal,
    steps: plan.steps.map((step) => ({
      ...step,
      status: normalizeStepStatus(step.status),
    })),
  };
}

function toCitations(event: AgentEvent): CitationRecord[] {
  const payload = event.payload as { documents?: unknown };
  if (!Array.isArray(payload.documents)) return [];

  return payload.documents.map((document, index) => {
    const item = document as {
      id?: unknown;
      content?: unknown;
      metadata?: { title?: unknown; chunk?: unknown };
      score?: unknown;
    };

    return {
      id: typeof item.id === 'string' ? item.id : `${event.id}_doc_${index + 1}`,
      source:
        typeof item.metadata?.title === 'string'
          ? item.metadata.title
          : typeof item.id === 'string'
            ? item.id
            : 'Knowledge Document',
      content: typeof item.content === 'string' ? item.content : '',
      chunk:
        typeof item.metadata?.chunk === 'string' || typeof item.metadata?.chunk === 'number'
          ? item.metadata.chunk
          : index + 1,
      score: typeof item.score === 'number' ? item.score : undefined,
    };
  });
}

function toMemoryRecords(event: AgentEvent): MemoryRecord[] {
  const payload = event.payload as { memoryType?: unknown; items?: unknown };
  if (!Array.isArray(payload.items)) return [];

  return payload.items.map((item, index) => {
    const record = item as {
      id?: unknown;
      type?: unknown;
      content?: unknown;
      importance?: unknown;
    };
    const fallbackType = isMemoryType(payload.memoryType) ? payload.memoryType : 'episodic';

    return {
      id: typeof record.id === 'string' ? record.id : `${event.id}_memory_${index + 1}`,
      type: isMemoryType(record.type) ? record.type : fallbackType,
      content: typeof record.content === 'string' ? record.content : '',
      importance: typeof record.importance === 'number' ? record.importance : 0.5,
      updatedAt: event.timestamp,
    };
  });
}

function toStateSnapshot(state: AgentState, event: AgentEvent): AgentStateSnapshot {
  const payload = event.payload as {
    status?: unknown;
    currentStep?: unknown;
    currentStepId?: unknown;
    completedStepIds?: unknown;
    error?: unknown;
  };

  return {
    goal: state.plan?.goal ?? getLastUserInput(state.messages) ?? 'Agent Task',
    currentStepId:
      typeof payload.currentStep === 'string'
        ? payload.currentStep
        : typeof payload.currentStepId === 'string'
          ? payload.currentStepId
          : undefined,
    completedStepIds: Array.isArray(payload.completedStepIds)
      ? payload.completedStepIds.filter((item): item is string => typeof item === 'string')
      : [],
    status: normalizeStateStatus(payload.status),
    error: typeof payload.error === 'string' ? payload.error : undefined,
  };
}

function mergeMemory(current: MemoryRecord[], next: MemoryRecord[]): MemoryRecord[] {
  const map = new Map(current.map((item) => [item.id, item]));
  next.forEach((item) => map.set(item.id, item));
  return Array.from(map.values());
}

function getDefaultTitle(
  type: AgentEventType,
  payload?: { toolName?: string; query?: string },
): string {
  if (type === 'plan_start') return 'Planner started';
  if (type === 'task_created') return 'Task created';
  if (type === 'plan_update') return 'Plan generated';
  if (type === 'tool_start') return `${payload?.toolName ?? 'Tool'} started`;
  if (type === 'tool_success') return `${payload?.toolName ?? 'Tool'} success`;
  if (type === 'tool_error') return `${payload?.toolName ?? 'Tool'} error`;
  if (type === 'permission_denied') return `${payload?.toolName ?? 'Tool'} permission denied`;
  if (type === 'tool_blocked') return `${payload?.toolName ?? 'Tool'} blocked`;
  if (type === 'approval_required') return `${payload?.toolName ?? 'Tool'} approval required`;
  if (type === 'rag_retrieve') return 'RAG retrieved context';
  if (type === 'reflection') return 'Reflection completed';
  if (type === 'memory_update') return 'Memory updated';
  if (type === 'evaluation_start') return 'Evaluation started';
  if (type === 'evaluation_complete') return 'Evaluation completed';
  if (type === 'state_update') return 'State updated';
  if (type === 'final_answer') return 'Final answer';
  if (type === 'task_complete') return 'Task complete';
  if (type === 'task_cancelled') return 'Task cancelled';
  if (type === 'task_retry') return 'Task retry';
  if (type === 'task_failed') return 'Task failed';
  return type;
}

function getDefaultDetail(
  type: AgentEventType,
  payload?: { toolName?: string; query?: string; error?: { message?: string }; reason?: string },
): string | undefined {
  if (type === 'rag_retrieve') return payload?.query;
  if (type === 'tool_error') return payload?.error?.message;
  if (type === 'permission_denied' || type === 'tool_blocked' || type === 'approval_required') {
    return payload?.reason;
  }
  return undefined;
}

function normalizeStepStatus(status: unknown): StepStatus {
  if (status === 'completed' || status === 'success') return 'success';
  if (status === 'failed' || status === 'error') return 'failed';
  if (status === 'running') return 'running';
  return 'pending';
}

function normalizeStateStatus(status: unknown): AgentStateSnapshot['status'] {
  if (status === 'completed' || status === 'success') return 'success';
  if (status === 'failed' || status === 'error') return 'failed';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'planning') return 'planning';
  if (status === 'running') return 'running';
  return 'idle';
}

function getTaskCompleteStatus(payload: Record<string, unknown>): AgentState['status'] {
  if (payload.status === 'completed') return 'success';
  if (payload.status === 'cancelled') return 'cancelled';
  return 'error';
}

function getToolRecordId(
  event: AgentEvent,
  toolName: string,
  stepId?: string,
  attemptNo = 1,
): string {
  return `${event.taskId ?? 'task'}_${stepId ?? toolName}_${attemptNo}`;
}

function getLastUserInput(messages: Message[]): string | undefined {
  return [...messages].reverse().find((message) => message.role === 'user')?.content;
}

function isPlan(value: unknown): value is Plan {
  return Boolean(value && typeof value === 'object' && 'goal' in value && 'steps' in value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isMemoryType(value: unknown): value is MemoryRecord['type'] {
  return value === 'working' || value === 'episodic' || value === 'semantic';
}

function isEvaluationResult(value: unknown): value is EvaluationResult {
  if (!isRecord(value)) return false;
  const criteria = value.criteria;
  return (
    typeof value.score === 'number' &&
    Array.isArray(value.feedback) &&
    isRecord(criteria) &&
    typeof criteria.completeness === 'number' &&
    typeof criteria.accuracy === 'number' &&
    typeof criteria.groundedness === 'number' &&
    typeof criteria.taskCompletion === 'number'
  );
}

function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
