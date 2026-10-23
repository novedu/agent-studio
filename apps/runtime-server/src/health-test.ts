import assert from 'node:assert/strict';
import { createHttpServer } from './http';
import { createAgentServerApp } from './app';
import type { AgentRuntimePort } from '@shared-types/api';

const runtime: AgentRuntimePort = {
  runTask: async () => ({
    taskId: 'health-test',
    conversationId: 'health-test',
    steps: [],
    totalDuration: 0,
    success: true,
  }),
};

async function main(): Promise<void> {
  const server = createHttpServer({
    app: createAgentServerApp({ runtime }),
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));

  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { status: string; provider?: string };
    assert.equal(body.status, 'ok');
    // The console shows a "Mock" badge when no model key is configured.
    assert.ok(['mock', 'openai', 'deepseek'].includes(body.provider ?? ''));
    console.log('Runtime server health check passed.');
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

void main();
