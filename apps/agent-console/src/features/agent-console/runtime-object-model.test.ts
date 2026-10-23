import { describe, expect, it } from 'vitest';
import {
  buildRuntimeDependencyEdges,
  buildRuntimeObjects,
  getCurrentRuntimeObjectId,
} from './runtime-object-model';
import type { AgentEvent } from '../../types/agent';
import type { ExecutionNodeRecord } from '../../components/execution/execution-model';

function event(
  id: string,
  type: AgentEvent['type'],
  timestamp: number,
  payload: unknown = {},
): AgentEvent {
  return {
    id,
    taskId: 'task_runtime_1',
    type,
    timestamp,
    payload,
  };
}

function node(
  id: string,
  kind: ExecutionNodeRecord['kind'],
  status: ExecutionNodeRecord['status'],
  trace: AgentEvent[] = [],
  metadata?: Record<string, unknown>,
): ExecutionNodeRecord {
  return {
    id,
    kind,
    component: id,
    summary: `${id} summary`,
    status,
    duration: 40,
    startTime: 100,
    endTime: 140,
    metadata,
    trace,
  };
}

describe('RuntimeObject projection', () => {
  it('projects lifecycle, trace metadata, and dependency relationships', () => {
    const nodes = [
      node('planner', 'planner', 'success', [event('plan_1', 'plan_start', 100)]),
      node('workflow', 'workflow', 'success'),
      node('tool:querySales', 'tool', 'success', [], {
        tokenCount: 120,
        retryCount: 1,
        cost: 0.004,
      }),
      node('rag', 'rag', 'success'),
      node('memory', 'memory', 'success'),
      node('reflection', 'reflection', 'running'),
      node('evaluation', 'evaluation', 'waiting'),
      node('answer', 'answer', 'waiting'),
    ];

    const objects = buildRuntimeObjects(nodes);
    const tool = objects.find((object) => object.id === 'tool:querySales');
    const reflection = objects.find((object) => object.id === 'reflection');

    expect(tool).toMatchObject({
      type: 'tool',
      traceId: 'task_runtime_1',
      lifecycle: 'completed',
      parentId: 'workflow',
      dependencyIds: ['workflow'],
      tokenCount: 120,
      retryCount: 1,
      cost: 0.004,
    });
    expect(tool?.metadata).toMatchObject({
      traceId: 'task_runtime_1',
      spanId: 'task_runtime_1:tool:querySales',
      lifecycle: 'completed',
    });
    expect(reflection).toMatchObject({
      status: 'running',
      lifecycle: 'running',
      dependencyIds: ['evaluation'],
    });
    expect(tool?.span.eventCount).toBe(0);
    expect(getCurrentRuntimeObjectId(objects)).toBe('reflection');
  });

  it('builds dependency edges from the same projected objects', () => {
    const objects = buildRuntimeObjects([
      node('planner', 'planner', 'success'),
      node('workflow', 'workflow', 'success'),
      node('tool:querySales', 'tool', 'success'),
      node('rag', 'rag', 'success'),
      node('memory', 'memory', 'success'),
      node('reflection', 'reflection', 'success'),
      node('evaluation', 'evaluation', 'success'),
      node('answer', 'answer', 'success'),
    ]);

    const edges = buildRuntimeDependencyEdges(objects);
    const edgeIds = edges.map((edge) => edge.id);

    expect(edgeIds).toContain('planner__workflow');
    expect(edgeIds).toContain('workflow__tool:querySales');
    expect(edgeIds).toContain('tool:querySales__evaluation');
    expect(edgeIds).toContain('rag__evaluation');
    expect(edgeIds).toContain('evaluation__reflection');
    expect(edgeIds).toContain('reflection__memory');
    expect(edgeIds).toContain('memory__answer');
    expect(edges.every((edge) => edge.status === 'success')).toBe(true);
  });
});
