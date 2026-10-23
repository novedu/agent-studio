import { describe, expect, it } from 'vitest';
import { buildExecutionNodes, getCurrentNodeId, getExecutionProgress } from './execution-model';
import type { AgentEvent, Message, Plan, ToolCallRecord } from '../../types/agent';

function event(
  id: string,
  type: AgentEvent['type'],
  timestamp: number,
  payload: unknown = {},
): AgentEvent {
  return {
    id,
    taskId: 'task_timeline_1',
    type,
    timestamp,
    payload,
  };
}

const plan: Plan = {
  goal: 'Analyze East China sales decline',
  steps: [
    {
      id: 'query-sales',
      description: 'Query sales data',
      tool: 'querySalesData',
      args: { region: 'East China' },
      status: 'success',
    },
  ],
};

const messages: Message[] = [
  {
    id: 'user_1',
    role: 'user',
    content: 'Analyze East China sales decline',
    createdAt: 1,
  },
  {
    id: 'assistant_1',
    role: 'assistant',
    content: 'The final report is ready.',
    createdAt: 200,
  },
];

describe('Execution model', () => {
  it('keeps tool retry recovery and runtime stages visible in timeline nodes', () => {
    const tools: ToolCallRecord[] = [
      {
        id: 'task_timeline_1_querySalesData',
        name: 'querySalesData',
        attemptNo: 2,
        args: { region: 'East China' },
        result: { rows: 24 },
        status: 'success',
        duration: 320,
      },
    ];
    const events = [
      event('plan_start', 'plan_start', 100, { input: plan.goal }),
      event('plan_update', 'plan_update', 110, { plan }),
      event('tool_start_1', 'tool_start', 120, { toolName: 'querySalesData', args: { region: 'East China' } }),
      event('tool_error_1', 'tool_error', 140, {
        toolName: 'querySalesData',
        error: { message: 'Missing region index' },
      }),
      event('retry_1', 'task_retry', 150, { retryCount: 1 }),
      event('tool_success_1', 'tool_success', 180, {
        toolName: 'querySalesData',
        result: { data: { rows: 24 }, duration: 320 },
      }),
      event('rag_1', 'rag_retrieve', 200, { documents: [{ id: 'doc_1', content: 'market context' }] }),
      event('memory_1', 'memory_update', 220, { items: [] }),
      event('reflection_1', 'reflection', 240, { status: 'passed' }),
      event('evaluation_1', 'evaluation_complete', 260, { score: 0.89 }),
      event('answer_1', 'final_answer', 280, { delta: 'The final report is ready.' }),
    ];

    const nodes = buildExecutionNodes({
      plan,
      tools,
      events,
      workflow: [],
      citations: [{ id: 'doc_1', source: 'Market Brief', content: 'market context', score: 0.91 }],
      evaluation: {
        score: 0.89,
        criteria: {
          completeness: 0.9,
          accuracy: 0.88,
          groundedness: 0.9,
          taskCompletion: 0.88,
        },
        feedback: ['Grounded and complete.'],
      },
      messages,
      status: 'success',
    });

    const tool = nodes.find((node) => node.id === 'tool:query-sales');
    const evaluation = nodes.find((node) => node.id === 'evaluation');

    expect(tool?.status).toBe('success');
    expect(tool?.metadata).toMatchObject({
      hadError: true,
      recoveredByRetry: true,
      retryCount: 1,
    });
    expect(evaluation?.status).toBe('success');
    expect(getCurrentNodeId(nodes)).toBe('answer');
    expect(getExecutionProgress(nodes)).toBeGreaterThan(0);
  });
});
