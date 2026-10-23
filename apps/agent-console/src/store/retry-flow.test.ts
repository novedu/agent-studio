import { beforeEach, describe, expect, it } from 'vitest';
import { useAgentStore } from './agentStore';
import type { AgentEvent } from '../types/agent';

let sequence = 0;

function event(type: AgentEvent['type'], payload: unknown): AgentEvent {
  sequence += 1;
  return {
    id: `${type}_${sequence}`,
    taskId: 'task_retry_flow',
    type,
    timestamp: 100 + sequence,
    payload,
  };
}

const plan = {
  goal: 'Retry a failed tool',
  steps: [
    { id: '1', tool: 'querySalesData', description: 'Query sales', status: 'pending' as const },
    { id: '2', tool: 'calculateMetrics', description: 'Calculate', status: 'pending' as const },
    { id: '3', tool: 'llm', description: 'Answer', status: 'pending' as const },
  ],
};

function resetStore(): void {
  useAgentStore.getState().reset();
  useAgentStore.setState({
    messages: [],
    status: 'idle',
    isStreaming: false,
    activeAssistantMessageId: undefined,
    answerBuffer: '',
  });
}

describe('Step retry flow', () => {
  beforeEach(resetStore);

  it('drives plan step status from completedStepIds', () => {
    useAgentStore.getState().beginTask('Retry a failed tool');
    useAgentStore.getState().updateFromEvent(event('plan_update', { plan, steps: plan.steps }));
    useAgentStore.getState().updateFromEvent(
      event('state_update', {
        status: 'running',
        currentStep: '1',
        completedStepIds: [],
        progress: 0,
      }),
    );

    expect(useAgentStore.getState().plan?.steps[0]?.status).toBe('running');

    useAgentStore.getState().updateFromEvent(
      event('state_update', {
        status: 'running',
        currentStep: '2',
        completedStepIds: ['1'],
        progress: 33,
      }),
    );

    const steps = useAgentStore.getState().plan?.steps;
    expect(steps?.[0]?.status).toBe('success');
    expect(steps?.[1]?.status).toBe('running');
    expect(steps?.[2]?.status).toBe('pending');
  });

  it('keeps the failed attempt and adds a second attempt on retry without clearing history', () => {
    useAgentStore.getState().beginTask('Retry a failed tool');
    useAgentStore.getState().updateFromEvent(event('plan_update', { plan, steps: plan.steps }));
    useAgentStore.getState().updateFromEvent(
      event('tool_start', { toolName: 'querySalesData', args: { region: '华中' }, stepId: '1', attemptNo: 1 }),
    );
    useAgentStore.getState().updateFromEvent(
      event('tool_error', {
        toolName: 'querySalesData',
        stepId: '1',
        attemptNo: 1,
        error: { type: 'argument', message: 'Unsupported region' },
      }),
    );

    expect(useAgentStore.getState().status).toBe('error');
    expect(useAgentStore.getState().tools).toHaveLength(1);
    const eventCount = useAgentStore.getState().events.length;

    useAgentStore.getState().beginRetry();
    expect(useAgentStore.getState().status).toBe('running');
    expect(useAgentStore.getState().events.length).toBe(eventCount);

    useAgentStore.getState().updateFromEvent(
      event('task_retry', { mode: 'step', stepId: '1', attemptNo: 2 }),
    );
    useAgentStore.getState().updateFromEvent(
      event('tool_start', {
        toolName: 'querySalesData',
        args: { region: '华东' },
        stepId: '1',
        attemptNo: 2,
      }),
    );
    useAgentStore.getState().updateFromEvent(
      event('tool_success', {
        toolName: 'querySalesData',
        stepId: '1',
        attemptNo: 2,
        result: { data: 'ok', duration: 150 },
      }),
    );

    const tools = useAgentStore.getState().tools;
    expect(tools).toHaveLength(2);
    expect(tools[0]).toMatchObject({ attemptNo: 1, status: 'failed' });
    expect(tools[1]).toMatchObject({ attemptNo: 2, status: 'success', args: { region: '华东' } });
  });

  it('only marks cancelled when the server confirms it, and preserves a partial answer', () => {
    useAgentStore.getState().beginTask('Cancel me');
    useAgentStore.getState().updateFromEvent(
      event('final_answer', { content: 'Partial answer' }),
    );

    useAgentStore.getState().markCancelled();
    const state = useAgentStore.getState();
    expect(state.status).toBe('cancelled');
    expect(state.messages.find((message) => message.role === 'assistant')?.content).toBe(
      'Partial answer',
    );
  });

  it('maps a cancelled task_complete to the cancelled state', () => {
    useAgentStore.getState().updateFromEvent(
      event('task_complete', { status: 'cancelled', duration: 120 }),
    );
    expect(useAgentStore.getState().status).toBe('cancelled');
    expect(useAgentStore.getState().isStreaming).toBe(false);
  });
});
