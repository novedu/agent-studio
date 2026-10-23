import type {
  AgentEvent,
  CitationRecord,
  EvaluationResult,
  Message,
  Plan,
  StepStatus,
  ToolCallRecord,
  WorkflowEvent,
} from '../../types/agent';

export type ExecutionNodeKind =
  | 'planner'
  | 'workflow'
  | 'tool'
  | 'rag'
  | 'memory'
  | 'reflection'
  | 'evaluation'
  | 'llm'
  | 'answer';

export type ExecutionNodeStatus =
  | 'waiting'
  | 'running'
  | 'success'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export interface ExecutionNodeRecord {
  id: string;
  kind: ExecutionNodeKind;
  component: string;
  summary: string;
  status: ExecutionNodeStatus;
  duration?: number;
  startTime?: number;
  endTime?: number;
  input?: unknown;
  output?: unknown;
  arguments?: unknown;
  metadata?: Record<string, unknown>;
  trace?: unknown;
}

export type FocusedRuntimeObject =
  | { type: 'node'; id: string; node: ExecutionNodeRecord }
  | { type: 'citation'; id: string }
  | { type: 'memory'; id: string }
  | { type: 'evaluation'; id: string }
  | { type: 'trace'; id: string; eventType?: string }
  | { type: 'log'; id: string; eventType?: string };

export interface ExecutionModelInput {
  plan: Plan | null;
  tools: ToolCallRecord[];
  events: AgentEvent[];
  workflow: WorkflowEvent[];
  citations: CitationRecord[];
  evaluation?: EvaluationResult;
  messages: Message[];
  status: string;
}

export function buildExecutionNodes(input: ExecutionModelInput): ExecutionNodeRecord[] {
  const latestAssistant = [...input.messages]
    .reverse()
    .find((message) => message.role === 'assistant');
  const nodes: ExecutionNodeRecord[] = [
    buildPlannerNode(input),
    buildWorkflowNode(input),
    ...buildToolNodes(input),
    buildRagNode(input),
    // The runtime emits post-run checks (evaluation -> reflection -> memory)
    // before the final answer, so the graph uses the same order.
    buildEvaluationNode(input),
    buildReflectionNode(input),
    buildMemoryNode(input),
    {
      id: 'answer',
      kind: 'answer',
      component: 'Answer',
      summary:
        input.status === 'error' || input.status === 'cancelled'
          ? 'No final answer: the run did not complete'
          : latestAssistant?.content
            ? 'Final response generated'
            : 'Waiting for final answer',
      status: getAnswerStatus(input.status, latestAssistant?.content),
      startTime: getFirstEvent(input.events, 'final_answer')?.timestamp,
      endTime: getLastEvent(input.events, 'final_answer')?.timestamp,
      duration: getDuration(
        getFirstEvent(input.events, 'final_answer')?.timestamp,
        getLastEvent(input.events, 'final_answer')?.timestamp,
      ),
      input: input.plan?.goal,
      output: latestAssistant?.content,
      metadata: { messageId: latestAssistant?.id },
      trace: getEventsByTypes(input.events, ['final_answer', 'task_complete']),
    },
  ];

  return nodes;
}

export function getCurrentNodeId(nodes: ExecutionNodeRecord[]): string | undefined {
  return (
    // A failed step is what the user needs to see; the workflow wrapper failing
    // with it is not actionable.
    nodes.find((node) => node.status === 'failed' && node.kind !== 'workflow')?.id ??
    nodes.find((node) => node.status === 'cancelled')?.id ??
    nodes.find((node) => node.status === 'running' && node.kind !== 'workflow')?.id ??
    nodes.find((node) => node.status === 'running')?.id ??
    [...nodes].reverse().find((node) => node.status === 'success')?.id ??
    nodes.find((node) => node.status === 'waiting')?.id
  );
}

export function getExecutionProgress(nodes: ExecutionNodeRecord[]): number {
  if (nodes.length === 0) return 0;
  const complete = nodes.filter(
    (node) => node.status === 'success' || node.status === 'skipped',
  ).length;
  return Math.round((complete / nodes.length) * 100);
}

export function getNodeIcon(kind: ExecutionNodeKind): string {
  if (kind === 'planner') return 'PL';
  if (kind === 'workflow') return 'WF';
  if (kind === 'tool') return 'TL';
  if (kind === 'rag') return 'RG';
  if (kind === 'memory') return 'MM';
  if (kind === 'reflection') return 'RF';
  if (kind === 'evaluation') return 'EV';
  if (kind === 'llm') return 'LM';
  return 'AN';
}

export function getKindLabel(kind: ExecutionNodeKind): string {
  if (kind === 'planner') return 'Planner';
  if (kind === 'workflow') return 'Workflow';
  if (kind === 'tool') return 'Tool';
  if (kind === 'rag') return 'RAG';
  if (kind === 'memory') return 'Memory';
  if (kind === 'reflection') return 'Reflection';
  if (kind === 'evaluation') return 'Evaluation';
  if (kind === 'llm') return 'LLM';
  return 'Answer';
}

export function getStatusTone(
  status: ExecutionNodeStatus,
): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
  if (status === 'success') return 'success';
  if (status === 'running') return 'info';
  if (status === 'failed') return 'danger';
  if (status === 'cancelled') return 'warning';
  return 'neutral';
}

export function getStatusColor(status: ExecutionNodeStatus): string {
  if (status === 'success') return '#059669';
  if (status === 'running') return '#1d4ed8';
  if (status === 'failed') return '#dc2626';
  if (status === 'cancelled') return '#d97706';
  return '#cbd5e1';
}

function buildPlannerNode(input: ExecutionModelInput): ExecutionNodeRecord {
  const startEvent = getFirstEvent(input.events, 'plan_start');
  const endEvent = getFirstEvent(input.events, 'plan_update');

  return {
    id: 'planner',
    kind: 'planner',
    component: 'Planner',
    summary: input.plan ? `${input.plan.steps.length} steps generated` : 'Waiting for plan',
    status: getPlannerStatus(input),
    duration: getDuration(startEvent?.timestamp, endEvent?.timestamp),
    startTime: startEvent?.timestamp,
    endTime: endEvent?.timestamp,
    input: startEvent?.payload,
    output: input.plan,
    metadata: { stepCount: input.plan?.steps.length ?? 0 },
    trace: getEventsByTypes(input.events, ['plan_start', 'plan_update']),
  };
}

function buildWorkflowNode(input: ExecutionModelInput): ExecutionNodeRecord {
  const startEvent =
    getFirstEvent(input.events, 'workflow_start') ??
    getFirstEvent(input.events, 'state_update') ??
    getFirstEvent(input.events, 'tool_start');
  const completeEvent =
    getFirstEvent(input.events, 'task_complete') ??
    getFirstEvent(input.events, 'final_answer') ??
    getLastEvent(input.events, 'state_update');

  return {
    id: 'workflow',
    kind: 'workflow',
    component: 'Workflow',
    summary: input.workflow.length
      ? `${input.workflow.length} runtime events observed`
      : 'Waiting for workflow activity',
    status: getWorkflowStatus(input, startEvent?.timestamp, completeEvent?.timestamp),
    duration: getDuration(startEvent?.timestamp, completeEvent?.timestamp),
    startTime: startEvent?.timestamp,
    endTime: completeEvent?.timestamp,
    input: input.plan,
    output: input.workflow,
    metadata: { eventCount: input.workflow.length },
    trace: getEventsByTypes(input.events, ['workflow_start', 'state_update', 'task_retry', 'task_complete']),
  };
}

function buildToolNodes(input: ExecutionModelInput): ExecutionNodeRecord[] {
  const planSteps = input.plan?.steps.filter((step) => step.tool && step.tool !== 'llm') ?? [];
  const byToolName = new Map(input.tools.map((tool) => [tool.name, tool]));

  if (planSteps.length === 0 && input.tools.length > 0) {
    return input.tools.map((tool) => buildToolNode(tool.name, tool.name, tool, input));
  }

  return planSteps.map((step) => {
    const toolName = step.tool ?? step.description;
    return buildToolNode(
      step.id,
      toolName,
      byToolName.get(toolName),
      input,
      step.description,
      step.status,
      step.args,
    );
  });
}

function buildToolNode(
  id: string,
  toolName: string,
  tool: ToolCallRecord | undefined,
  input: ExecutionModelInput,
  summary = toolName,
  planStatus?: StepStatus,
  planArgs?: Record<string, unknown>,
): ExecutionNodeRecord {
  const toolEvents = input.events.filter(
    (event) =>
      (event.type === 'tool_start' || event.type === 'tool_success' || event.type === 'tool_error') &&
      getToolName(event) === toolName,
  );
  const startEvent = [...toolEvents].reverse().find((event) => event.type === 'tool_start');
  const successEvent = [...toolEvents].reverse().find((event) => event.type === 'tool_success');
  const errorEvent = [...toolEvents].reverse().find((event) => event.type === 'tool_error');
  const endEvent = successEvent ?? errorEvent;
  const retryEvent = [...input.events].reverse().find((event) => event.type === 'task_retry');
  const status = toExplorerStatus(tool?.status ?? planStatus);
  const eventAttempts = toolEvents
    .map((event) => (event.payload as { attemptNo?: unknown } | undefined)?.attemptNo)
    .filter((value): value is number => typeof value === 'number');
  const attemptCount = Math.max(1, tool?.attemptNo ?? 1, ...eventAttempts);

  return {
    id: `tool:${id}`,
    kind: 'tool',
    component: toolName,
    summary: attemptCount > 1 ? `${summary} · ${attemptCount} attempts` : summary,
    status,
    duration: tool?.duration ?? getDuration(startEvent?.timestamp, endEvent?.timestamp),
    startTime: startEvent?.timestamp,
    endTime: endEvent?.timestamp,
    input: startEvent?.payload,
    output: tool?.result ?? successEvent?.payload ?? errorEvent?.payload,
    arguments: tool?.args ?? planArgs,
    metadata: {
      toolName,
      hadError: Boolean(errorEvent),
      recoveredByRetry: Boolean(errorEvent && retryEvent && status === 'success'),
      retryEventId: retryEvent?.id,
      retryCount: attemptCount - 1,
      attemptCount,
      attemptNo: tool?.attemptNo ?? 1,
      attempts: buildAttempts(toolEvents),
      error: readErrorMessage(errorEvent?.payload),
    },
    trace: [startEvent, errorEvent, retryEvent, successEvent].filter(Boolean),
  };
}

function buildRagNode(input: ExecutionModelInput): ExecutionNodeRecord {
  const ragEvents = getEventsByTypes(input.events, ['rag_retrieve']);
  const firstEvent = ragEvents[0];
  const lastEvent = ragEvents[ragEvents.length - 1];

  return {
    id: 'rag',
    kind: 'rag',
    component: 'RAG Retrieve',
    summary: input.citations.length
      ? `${input.citations.length} knowledge sources retrieved`
      : 'Waiting for retrieval',
    status: firstEvent ? 'success' : 'waiting',
    duration: getDuration(firstEvent?.timestamp, lastEvent?.timestamp) ?? (firstEvent ? 0 : undefined),
    startTime: firstEvent?.timestamp,
    endTime: lastEvent?.timestamp,
    input: firstEvent?.payload,
    output: input.citations,
    metadata: { citationCount: input.citations.length },
    trace: ragEvents,
  };
}

function buildMemoryNode(input: ExecutionModelInput): ExecutionNodeRecord {
  const memoryEvent = getFirstEvent(input.events, 'memory_update');

  return {
    id: 'memory',
    kind: 'memory',
    component: 'Memory',
    summary: memoryEvent ? 'Memory updated from execution' : 'Waiting for memory update',
    status: memoryEvent ? 'success' : 'waiting',
    startTime: memoryEvent?.timestamp,
    endTime: memoryEvent?.timestamp,
    duration: 0,
    input: input.plan?.goal,
    output: memoryEvent?.payload,
    metadata: { eventCount: getEventsByTypes(input.events, ['memory_update']).length },
    trace: getEventsByTypes(input.events, ['memory_update']),
  };
}

function buildReflectionNode(input: ExecutionModelInput): ExecutionNodeRecord {
  // A retried run keeps the previous attempt's events, so use the latest
  // reflection instead of the first one.
  const reflectionEvent = getLastEvent(input.events, 'reflection');
  const reflectionStatus = getPayloadStatus(reflectionEvent?.payload);
  const passed = reflectionStatus === 'passed';
  const failed = reflectionStatus === 'failed' || reflectionStatus === 'needs_replanning';

  return {
    id: 'reflection',
    kind: 'reflection',
    component: 'Reflection',
    summary: reflectionEvent
      ? failed
        ? 'Reflection did not pass'
        : 'Result reviewed by reflection'
      : 'Waiting for reflection',
    status: reflectionEvent ? (failed ? 'failed' : 'success') : 'waiting',
    startTime: reflectionEvent?.timestamp,
    endTime: reflectionEvent?.timestamp,
    duration: 0,
    input: input.evaluation,
    output: reflectionEvent?.payload,
    metadata: { status: reflectionStatus, passed },
    trace: getEventsByTypes(input.events, ['reflection']),
  };
}

function buildEvaluationNode(input: ExecutionModelInput): ExecutionNodeRecord {
  const startEvent = getFirstEvent(input.events, 'evaluation_start');
  const endEvent = getFirstEvent(input.events, 'evaluation_complete');

  return {
    id: 'evaluation',
    kind: 'evaluation',
    component: 'Evaluation',
    summary: input.evaluation
      ? `Score ${Math.round(input.evaluation.score * 100)}`
      : 'Waiting for evaluation',
    status: startEvent && !endEvent ? 'running' : input.evaluation ? 'success' : 'waiting',
    duration: getDuration(startEvent?.timestamp, endEvent?.timestamp),
    startTime: startEvent?.timestamp,
    endTime: endEvent?.timestamp,
    input: startEvent?.payload,
    output: input.evaluation,
    metadata: input.evaluation ? { ...input.evaluation.criteria } : undefined,
    trace: getEventsByTypes(input.events, ['evaluation_start', 'evaluation_complete']),
  };
}

function getWorkflowStatus(
  input: ExecutionModelInput,
  startTime?: number,
  endTime?: number,
): ExecutionNodeStatus {
  if (input.status === 'cancelled') return 'cancelled';
  if (input.status === 'error') return 'failed';
  if (input.status === 'success' || input.status === 'completed') return 'success';
  if (startTime && !endTime) return 'running';
  if (startTime) return input.status === 'running' ? 'running' : 'success';
  return 'waiting';
}

function getPlannerStatus(input: ExecutionModelInput): ExecutionNodeStatus {
  if (input.status === 'cancelled') return 'cancelled';
  if (input.plan) return 'success';
  if (input.events.some((event) => event.type === 'plan_start')) return 'running';
  return 'waiting';
}

function getAnswerStatus(status: string, content?: string): ExecutionNodeStatus {
  // A failed run has no answer even though the transcript may contain a failure
  // note in the assistant slot.
  if (status === 'error') return 'skipped';
  if (status === 'cancelled') return 'cancelled';
  if (content) return status === 'running' ? 'running' : 'success';
  return 'waiting';
}

function toExplorerStatus(status?: StepStatus): ExecutionNodeStatus {
  if (status === 'success') return 'success';
  if (status === 'running') return 'running';
  if (status === 'failed') return 'failed';
  if (status === 'pending') return 'waiting';
  return 'waiting';
}

function getDuration(start?: number, end?: number): number | undefined {
  if (start === undefined || end === undefined) return undefined;
  return Math.max(0, end - start);
}

function getFirstEvent(events: AgentEvent[], type: AgentEvent['type']): AgentEvent | undefined {
  return events.find((event) => event.type === type);
}

function getLastEvent(events: AgentEvent[], type: AgentEvent['type']): AgentEvent | undefined {
  return [...events].reverse().find((event) => event.type === type);
}

function getEventsByTypes(events: AgentEvent[], types: AgentEvent['type'][]): AgentEvent[] {
  return events.filter((event) => types.includes(event.type));
}

function getToolName(event: AgentEvent): string | undefined {
  const payload = event.payload as { toolName?: unknown };
  return typeof payload.toolName === 'string' ? payload.toolName : undefined;
}

function getPayloadStatus(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const status = (payload as { status?: unknown }).status;
  return typeof status === 'string' ? status : undefined;
}

function buildAttempts(toolEvents: AgentEvent[]): Array<{
  attemptNo: number;
  status: 'running' | 'success' | 'failed';
  args?: Record<string, unknown>;
  duration?: number;
  error?: string;
}> {
  const byAttempt = new Map<
    number,
    {
      attemptNo: number;
      status: 'running' | 'success' | 'failed';
      args?: Record<string, unknown>;
      duration?: number;
      error?: string;
    }
  >();

  for (const event of toolEvents) {
    const payload = event.payload as {
      attemptNo?: unknown;
      args?: unknown;
      result?: { duration?: unknown };
      error?: unknown;
    };
    const attemptNo = typeof payload.attemptNo === 'number' ? payload.attemptNo : 1;
    const current =
      byAttempt.get(attemptNo) ?? { attemptNo, status: 'running' as const };

    if (event.type === 'tool_start') {
      current.status = 'running';
      if (payload.args && typeof payload.args === 'object' && !Array.isArray(payload.args)) {
        current.args = payload.args as Record<string, unknown>;
      }
    }
    if (event.type === 'tool_success') {
      current.status = 'success';
      if (typeof payload.result?.duration === 'number') current.duration = payload.result.duration;
    }
    if (event.type === 'tool_error') {
      current.status = 'failed';
      current.error = readErrorMessage(event.payload);
    }

    byAttempt.set(attemptNo, current);
  }

  return [...byAttempt.values()].sort((a, b) => a.attemptNo - b.attemptNo);
}

function readErrorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== 'object') return undefined;
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' ? message : undefined;
}

export interface ExecutionStepAttemptView {
  attemptNo: number;
  status: StepStatus;
  duration?: number;
  args?: Record<string, unknown>;
  error?: string;
}

export interface ExecutionStepRow {
  id: string;
  order: number;
  tool: string;
  description: string;
  status: ExecutionNodeStatus;
  duration?: number;
  attempts: ExecutionStepAttemptView[];
  error?: string;
  nodeId?: string;
}

export interface ExecutionStepsInput {
  plan: Plan | null;
  tools: ToolCallRecord[];
  events: AgentEvent[];
  status: string;
}

/**
 * The default dock view: one row per plan step, not one node per runtime object.
 * It answers "where am I / what failed / how many attempts" before the graph.
 */
export function buildExecutionSteps(input: ExecutionStepsInput): ExecutionStepRow[] {
  if (!input.plan) return [];

  return input.plan.steps.map((step, index) => {
    const stepTool = step.tool ?? 'llm';
    const records = input.tools
      .filter((tool) => tool.stepId === step.id || (!tool.stepId && tool.name === stepTool))
      .sort((a, b) => (a.attemptNo ?? 1) - (b.attemptNo ?? 1));

    const attempts: ExecutionStepAttemptView[] = records.map((record) => ({
      attemptNo: record.attemptNo ?? 1,
      status: record.status,
      duration: record.duration,
      args: record.args,
      error: readToolError(record.result),
    }));

    const latest = records[records.length - 1];
    const failedAttempt = [...attempts].reverse().find((attempt) => attempt.status === 'failed');
    const status =
      input.status === 'cancelled' && (latest?.status === 'running' || step.status === 'running')
        ? 'cancelled'
        : latest
          ? toExplorerStatus(latest.status)
          : toExplorerStatus(step.status);

    return {
      id: step.id,
      order: index + 1,
      tool: stepTool,
      description: step.description,
      status,
      duration: latest?.duration,
      attempts,
      error: failedAttempt?.error,
      nodeId: stepTool === 'llm' ? 'answer' : `tool:${step.id}`,
    } satisfies ExecutionStepRow;
  });
}

function readToolError(result: unknown): string | undefined {
  if (typeof result === 'string') return result;
  if (!result || typeof result !== 'object') return undefined;

  const record = result as { message?: unknown; error?: unknown };
  if (typeof record.message === 'string') return record.message;
  if (typeof record.error === 'string') return record.error;
  if (record.error && typeof record.error === 'object') {
    const nested = record.error as { message?: unknown };
    if (typeof nested.message === 'string') return nested.message;
  }
  return undefined;
}
