import { beforeEach, describe, expect, it } from 'vitest';
import { useAgentStore } from './agentStore';

function resetStore() {
  useAgentStore.setState({
    messages: [],
    events: [],
    workflow: [],
    plan: null,
    tools: [],
    citations: [],
    memory: [],
    memories: [],
    status: 'idle',
    isStreaming: false,
    activeAssistantMessageId: undefined,
    answerBuffer: '',
    state: undefined,
    lastError: undefined,
  });
}

describe('markInterrupted', () => {
  beforeEach(resetStore);

  it('flags the streaming assistant message and stops streaming', () => {
    useAgentStore.getState().beginTask('分析华东区域销售下降原因');
    const activeId = useAgentStore.getState().activeAssistantMessageId;
    expect(activeId).toBeTruthy();

    useAgentStore.getState().markInterrupted();

    const state = useAgentStore.getState();
    const assistant = state.messages.find((message) => message.id === activeId);
    expect(assistant?.interrupted).toBe(true);
    expect(state.status).toBe('error');
    expect(state.isStreaming).toBe(false);
  });

  it('keeps partial answer text so the user can read what arrived', () => {
    useAgentStore.getState().beginTask('你好');
    const activeId = useAgentStore.getState().activeAssistantMessageId ?? '';
    useAgentStore.setState((state) => ({
      messages: state.messages.map((message) =>
        message.id === activeId ? { ...message, content: '部分回答' } : message,
      ),
    }));

    useAgentStore.getState().markInterrupted();

    const assistant = useAgentStore.getState().messages.find((message) => message.id === activeId);
    expect(assistant?.content).toBe('部分回答');
    expect(assistant?.interrupted).toBe(true);
  });

  it('is a no-op for the transcript when nothing is streaming', () => {
    useAgentStore.getState().markInterrupted();

    const state = useAgentStore.getState();
    expect(state.status).toBe('error');
    expect(state.messages).toEqual([]);
  });
});
