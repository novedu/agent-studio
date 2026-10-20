import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAgentStore } from './agentStore';

const STORAGE_KEY = 'agent-studio:session';

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
    conversationId: undefined,
  });
}

describe('session persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('keeps the conversation id across task resets', () => {
    const first = useAgentStore.getState().ensureConversationId();
    useAgentStore.getState().beginTask('第一轮');
    const second = useAgentStore.getState().ensureConversationId();

    expect(second).toBe(first);
  });

  it('writes the transcript and conversation id to localStorage', async () => {
    const conversationId = useAgentStore.getState().ensureConversationId();
    useAgentStore.getState().beginTask('你好');

    await Promise.resolve();

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw ?? '{}') as { state?: { conversationId?: string; messages?: unknown[] } };
    expect(parsed.state?.conversationId).toBe(conversationId);
    expect((parsed.state?.messages ?? []).length).toBeGreaterThan(0);
  });

  it('startNewConversation clears the transcript and the conversation id', () => {
    useAgentStore.getState().ensureConversationId();
    useAgentStore.getState().beginTask('你好');

    useAgentStore.getState().startNewConversation();

    const state = useAgentStore.getState();
    expect(state.messages).toEqual([]);
    expect(state.conversationId).toBeUndefined();
    expect(state.status).toBe('idle');
  });
});
