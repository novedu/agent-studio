import type { ExecutionNodeRecord, ExecutionNodeStatus } from '../../components/execution/execution-model';
import type { AgentEvent } from '../../types/agent';

export type RuntimeObjectType =
  | 'planner'
  | 'workflow'
  | 'tool'
  | 'knowledge'
  | 'memory'
  | 'reflection'
  | 'evaluation'
  | 'answer';

export type RuntimeLifecycle = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface RuntimeSpan {
  spanId: string;
  traceId: string;
  parentId?: string;
  objectId: string;
  component: string;
  type: RuntimeObjectType;
  status: ExecutionNodeStatus;
  lifecycle: RuntimeLifecycle;
  depth: number;
  startTime?: number;
  endTime?: number;
  duration?: number;
  eventCount: number;
  events: AgentEvent[];
}

export interface RuntimeObject {
  id: string;
  type: RuntimeObjectType;
  traceId: string;
  spanId: string;
  parentId?: string;
  dependencyIds: string[];
  childIds: string[];
  title: string;
  status: ExecutionNodeStatus;
  lifecycle: RuntimeLifecycle;
  summary: string;
  input?: unknown;
  output?: unknown;
  arguments?: unknown;
  reasoning?: unknown;
  metadata?: Record<string, unknown>;
  trace?: unknown;
  duration?: number;
  startTime?: number;
  endTime?: number;
  tokenCount?: number;
  retryCount?: number;
  cost?: number;
  span: RuntimeSpan;
  sourceNode: ExecutionNodeRecord;
}

export interface RuntimeDependencyEdge {
  id: string;
  from: string;
  to: string;
  status: ExecutionNodeStatus;
  label: string;
}

export function buildRuntimeObjects(nodes: ExecutionNodeRecord[]): RuntimeObject[] {
  const traceId = inferTraceId(nodes);
  const baseObjects = nodes.map((node) => {
    const type = toRuntimeObjectType(node.kind);
    const events = getTraceEvents(node.trace);
    const lifecycle = toLifecycle(node.status);
    const spanId = `${traceId}:${node.id}`;

    return {
      id: node.id,
      type,
      traceId,
      spanId,
      dependencyIds: [],
      childIds: [],
      title: node.component,
      status: node.status,
      lifecycle,
      summary: node.summary,
      input: node.input,
      output: node.output,
      arguments: node.arguments,
      reasoning: getReasoningPayload(node),
      metadata: {
        ...node.metadata,
        traceId,
        spanId,
        lifecycle,
      },
      trace: node.trace,
      duration: node.duration,
      startTime: node.startTime,
      endTime: node.endTime,
      tokenCount: readNumber(node.metadata, 'tokenCount'),
      retryCount: readNumber(node.metadata, 'retryCount'),
      cost: readNumber(node.metadata, 'cost'),
      span: {
        spanId,
        traceId,
        objectId: node.id,
        component: node.component,
        type,
        status: node.status,
        lifecycle,
        depth: getRuntimeDepth(type),
        startTime: node.startTime,
        endTime: node.endTime,
        duration: node.duration,
        eventCount: events.length,
        events,
      },
      sourceNode: node,
    } satisfies RuntimeObject;
  });

  return enrichRelationships(baseObjects);
}

export function buildRuntimeDependencyEdges(objects: RuntimeObject[]): RuntimeDependencyEdge[] {
  const byType = new Map<RuntimeObjectType, RuntimeObject[]>();
  objects.forEach((object) => {
    byType.set(object.type, [...(byType.get(object.type) ?? []), object]);
  });

  const planner = first(byType, 'planner');
  const workflow = first(byType, 'workflow');
  const knowledge = first(byType, 'knowledge');
  const memory = first(byType, 'memory');
  const reflection = first(byType, 'reflection');
  const evaluation = first(byType, 'evaluation');
  const answer = first(byType, 'answer');
  const tools = byType.get('tool') ?? [];
  const edges: RuntimeDependencyEdge[] = [];

  if (planner && workflow) addEdge(edges, planner, workflow, 'plan');
  if (planner && knowledge) addEdge(edges, planner, knowledge, 'context');
  tools.forEach((tool) => {
    if (workflow) addEdge(edges, workflow, tool, 'execute');
    else if (planner) addEdge(edges, planner, tool, 'execute');
  });

  // Post-run checks read the tool results and retrieved evidence, then write
  // memory before the answer is delivered.
  const lastTool = tools[tools.length - 1];
  if (lastTool && evaluation) addEdge(edges, lastTool, evaluation, 'result');
  if (knowledge && evaluation) addEdge(edges, knowledge, evaluation, 'evidence');
  if (evaluation && reflection) addEdge(edges, evaluation, reflection, 'judge');
  if (reflection && memory) addEdge(edges, reflection, memory, 'write');
  if (memory && answer) addEdge(edges, memory, answer, 'deliver');
  if (lastTool && !evaluation && reflection) addEdge(edges, lastTool, reflection, 'result');
  if (reflection && !memory && answer) addEdge(edges, reflection, answer, 'deliver');
  if (lastTool && !evaluation && !reflection && answer) addEdge(edges, lastTool, answer, 'answer');
  if (planner && answer && edges.length === 0) addEdge(edges, planner, answer, 'answer');

  return edges;
}

export function getCurrentRuntimeObjectId(objects: RuntimeObject[]): string | undefined {
  return (
    objects.find((object) => object.status === 'failed' && object.type !== 'workflow')?.id ??
    objects.find((object) => object.status === 'cancelled')?.id ??
    objects.find((object) => object.status === 'running')?.id ??
    [...objects].reverse().find((object) => object.status === 'success')?.id ??
    objects.find((object) => object.status === 'waiting')?.id
  );
}

function addEdge(
  edges: RuntimeDependencyEdge[],
  from: RuntimeObject,
  to: RuntimeObject,
  label: string,
): void {
  edges.push({
    id: `${from.id}__${to.id}`,
    from: from.id,
    to: to.id,
    status: getEdgeStatus(from.status, to.status),
    label,
  });
}

function enrichRelationships(objects: RuntimeObject[]): RuntimeObject[] {
  const parentById = new Map<string, string | undefined>();
  objects.forEach((object) => parentById.set(object.id, getParentId(object, objects)));

  const dependenciesById = new Map<string, string[]>();
  objects.forEach((object) => dependenciesById.set(object.id, getDependencyIds(object, objects)));

  return objects.map((object) => {
    const parentId = parentById.get(object.id);
    const dependencyIds = dependenciesById.get(object.id) ?? [];
    const childIds = objects
      .filter((candidate) => parentById.get(candidate.id) === object.id)
      .map((candidate) => candidate.id);

    return {
      ...object,
      parentId,
      dependencyIds,
      childIds,
      metadata: {
        ...object.metadata,
        parentId,
        dependencyIds,
        childIds,
      },
      span: {
        ...object.span,
        parentId,
      },
    };
  });
}

function getParentId(object: RuntimeObject, objects: RuntimeObject[]): string | undefined {
  const planner = firstObject(objects, 'planner');
  const workflow = firstObject(objects, 'workflow');
  const knowledge = firstObject(objects, 'knowledge');
  const memory = firstObject(objects, 'memory');
  const reflection = firstObject(objects, 'reflection');
  const evaluation = firstObject(objects, 'evaluation');
  const latestTool = latestObject(objects, 'tool');

  if (object.type === 'workflow') return planner?.id;
  if (object.type === 'knowledge') return planner?.id;
  if (object.type === 'tool') return workflow?.id ?? planner?.id;
  if (object.type === 'memory') return reflection?.id ?? latestTool?.id ?? workflow?.id;
  if (object.type === 'reflection') return evaluation?.id ?? latestTool?.id;
  if (object.type === 'evaluation') return latestTool?.id ?? knowledge?.id ?? workflow?.id;
  if (object.type === 'answer') return memory?.id ?? reflection?.id ?? evaluation?.id;
  return undefined;
}

function getDependencyIds(object: RuntimeObject, objects: RuntimeObject[]): string[] {
  const planner = firstObject(objects, 'planner');
  const workflow = firstObject(objects, 'workflow');
  const knowledge = firstObject(objects, 'knowledge');
  const memory = firstObject(objects, 'memory');
  const reflection = firstObject(objects, 'reflection');
  const evaluation = firstObject(objects, 'evaluation');
  const tools = objects.filter((candidate) => candidate.type === 'tool');

  if (object.type === 'workflow') return compact([planner?.id]);
  if (object.type === 'knowledge') return compact([planner?.id]);
  if (object.type === 'tool') return compact([workflow?.id ?? planner?.id]);
  if (object.type === 'memory') return compact([reflection?.id, ...tools.map((tool) => tool.id)]);
  if (object.type === 'reflection') return compact([evaluation?.id]);
  if (object.type === 'evaluation') return compact([knowledge?.id, ...tools.map((tool) => tool.id)]);
  if (object.type === 'answer') return compact([memory?.id, reflection?.id, evaluation?.id]);
  return [];
}

function getEdgeStatus(from: ExecutionNodeStatus, to: ExecutionNodeStatus): ExecutionNodeStatus {
  if (from === 'failed' || to === 'failed') return 'failed';
  if (from === 'running' || to === 'running') return 'running';
  if (from === 'success' && to === 'success') return 'success';
  if (from === 'cancelled' || to === 'cancelled') return 'cancelled';
  return 'waiting';
}

function first(
  byType: Map<RuntimeObjectType, RuntimeObject[]>,
  type: RuntimeObjectType,
): RuntimeObject | undefined {
  return byType.get(type)?.[0];
}

function toRuntimeObjectType(kind: ExecutionNodeRecord['kind']): RuntimeObjectType {
  if (kind === 'rag') return 'knowledge';
  if (kind === 'llm') return 'answer';
  return kind;
}

function toLifecycle(status: ExecutionNodeStatus): RuntimeLifecycle {
  if (status === 'running') return 'running';
  if (status === 'success' || status === 'skipped') return 'completed';
  if (status === 'failed') return 'failed';
  if (status === 'cancelled') return 'cancelled';
  return 'pending';
}

export function getRuntimeDepth(type: RuntimeObjectType): number {
  if (type === 'planner') return 0;
  if (type === 'workflow' || type === 'knowledge') return 1;
  if (type === 'tool') return 2;
  if (type === 'memory' || type === 'reflection') return 3;
  if (type === 'evaluation') return 4;
  return 5;
}

function getReasoningPayload(node: ExecutionNodeRecord): unknown {
  if (node.metadata && 'reasoning' in node.metadata) return node.metadata.reasoning;
  if (node.kind === 'reflection') return node.output;
  if (node.kind === 'evaluation') return node.metadata;
  return undefined;
}

function readNumber(metadata: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = metadata?.[key];
  return typeof value === 'number' ? value : undefined;
}

function inferTraceId(nodes: ExecutionNodeRecord[]): string {
  for (const node of nodes) {
    const event = getTraceEvents(node.trace).find((item) => item.taskId);
    if (event?.taskId) return event.taskId;
  }
  return 'trace_local';
}

function getTraceEvents(trace: unknown): AgentEvent[] {
  if (!Array.isArray(trace)) return [];
  return trace.filter(isAgentEvent);
}

function isAgentEvent(value: unknown): value is AgentEvent {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.type === 'string' &&
    typeof record.timestamp === 'number'
  );
}

function firstObject(objects: RuntimeObject[], type: RuntimeObjectType): RuntimeObject | undefined {
  return objects.find((object) => object.type === type);
}

function latestObject(objects: RuntimeObject[], type: RuntimeObjectType): RuntimeObject | undefined {
  return [...objects].reverse().find((object) => object.type === type);
}

function compact(values: Array<string | undefined>): string[] {
  return values.filter((value): value is string => Boolean(value));
}
