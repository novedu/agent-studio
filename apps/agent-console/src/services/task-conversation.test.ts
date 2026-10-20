import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAgentTask } from './agent';

function stubFetch() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ taskId: 'task_1', status: 'running' }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('createAgentTask conversation id', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the conversation id so follow-up turns share history', async () => {
    const fetchMock = stubFetch();

    await createAgentTask('那第二点呢', 'conv-123');

    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body).toEqual({ input: '那第二点呢', conversationId: 'conv-123' });
  });

  it('omits the conversation id when the caller has none', async () => {
    const fetchMock = stubFetch();

    await createAgentTask('你好');

    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body).toEqual({ input: '你好' });
  });
});
