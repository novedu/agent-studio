import assert from 'node:assert/strict';
import { MockLLMProvider } from '@runtime/index';
import { createAgentServerApp } from '../app';
import { AgentRuntimeAdapter } from '../runtime/agent-runtime-adapter';

const FAILURE_INPUT = '演示工具失败：预检华中区域销售数据，失败后用修正参数重试';

async function waitForStatus(
  app: ReturnType<typeof createAgentServerApp>,
  taskId: string,
  expected: string,
  timeoutMs = 5000,
): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const task = app.taskManager.getTask(taskId);
    if (task?.status === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const task = app.taskManager.getTask(taskId);
  throw new Error(`Timed out waiting for ${expected}, last status was ${task?.status}`);
}

async function main(): Promise<void> {
  // Force the offline provider: the test must not depend on a developer's .env key.
  const app = createAgentServerApp({
    runtimeInfo: () => ({ provider: 'mock', label: 'Mock · 模板' }),
    runtime: new AgentRuntimeAdapter({
      llmProvider: new MockLLMProvider({
        responses: [
          {
            content: [
              '# 华东区域销售下降分析报告',
              '',
              '## 结论摘要',
              '',
              '华东区域 2024-02 营收为 ¥980000，较 2024-01 的 ¥1250000 下降 21.60%。',
              '',
              '## 建议动作',
              '',
              '1. 拆分订单量、客单价和渠道来源。',
              '2. 优先回访重点客户。',
            ].join('\n'),
            done: true,
          },
        ],
      }),
    }),
  });

  // 1. Real failure: the planner calls querySalesData with an unsupported region.
  const created = app.handlers.createTask({
    input: FAILURE_INPUT,
    conversationId: 'step-retry-test-conversation',
  });
  const createdTask = await created;
  assert.ok('taskId' in createdTask, 'task should be created');
  const taskId = createdTask.taskId;

  await waitForStatus(app, taskId, 'failed');
  const failedTask = app.taskManager.getTask(taskId);
  assert.ok(failedTask, 'failed task should exist');
  assert.equal(failedTask.status, 'failed');
  assert.equal(failedTask.failedStepId, '1', 'the first plan step should be the failed one');
  assert.equal(failedTask.progress, 0, 'a failed first step must not report 100%');
  assert.equal(failedTask.steps?.[0]?.status, 'failed');
  assert.equal(failedTask.steps?.[0]?.attempts.length, 1);
  assert.equal(failedTask.steps?.[0]?.attempts[0]?.status, 'failed');

  // 2. Retry only the failed step with corrected args.
  const retry = app.taskManager.retryStep(taskId, '1', { region: '华东', month: '2024-02' });
  assert.ok(retry.task, `step retry should start: ${retry.error?.message ?? ''}`);
  assert.equal(retry.task?.retryCount, 1);

  await waitForStatus(app, taskId, 'completed');
  const completed = app.taskManager.getTask(taskId);
  assert.ok(completed, 'completed task should exist');
  assert.equal(completed.status, 'completed');
  assert.equal(completed.progress, 100);
  assert.equal(completed.failedStepId, undefined);
  assert.equal(completed.trace?.finalAnswer?.includes('华东区域销售下降分析报告'), true);

  const step = completed.steps?.[0];
  assert.ok(step, 'retried step should exist');
  assert.equal(step.status, 'completed');
  assert.deepEqual(
    step.attempts.map((attempt) => [attempt.attemptNo, attempt.status]),
    [[1, 'failed'], [2, 'success']],
  );
  // Steps after the retried one are still on their first attempt.
  assert.equal(completed.steps?.[1]?.attempts[0]?.attemptNo, 1);
  assert.equal(completed.steps?.[1]?.status, 'completed');

  // 3. Cancelling a completed task must not report success.
  const cancelled = app.taskManager.cancelTask(taskId);
  assert.equal(cancelled?.status, 'completed', 'completed tasks cannot be cancelled');

  // 4. Queued cancellation keeps progress and is not recorded as an error.
  const queued = app.taskManager.createTask('Cancel a queued task', undefined, 'cancel-queued');
  const queuedCancelled = app.taskManager.cancelTask(queued.taskId);
  assert.equal(queuedCancelled?.status, 'cancelled');
  assert.equal(queuedCancelled?.lastError, undefined);

  // 5. Event order and progress are driven by the runtime, not by the client.
  const orderEvents: Array<{ type: string; payload: unknown }> = [];
  const orderTask = app.taskManager.createTask(
    '分析华东区域销售下降原因，并生成报告',
    undefined,
    'event-order-conversation',
  );
  app.eventHub.subscribe(orderTask.taskId, (event) => orderEvents.push({ type: event.type, payload: event.payload }));
  app.taskManager.startTask(orderTask.taskId);
  await waitForStatus(app, orderTask.taskId, 'completed');

  const types = orderEvents.map((event) => event.type);
  const indexOf = (type: string) => types.indexOf(type);
  assert.ok(indexOf('evaluation_start') > indexOf('rag_retrieve'));
  assert.ok(indexOf('reflection') > indexOf('evaluation_complete'));
  assert.ok(indexOf('memory_update') > indexOf('reflection'));
  assert.ok(types.lastIndexOf('final_answer') > indexOf('memory_update'));
  assert.equal(types[types.length - 1], 'task_complete');

  const progresses = orderEvents
    .filter((event) => event.type === 'state_update')
    .map((event) => (event.payload as { progress?: number }).progress ?? 0);
  assert.ok(progresses.length > 0, 'state updates should be streamed live');
  assert.deepEqual(progresses, [...progresses].sort((a, b) => a - b), 'progress must be monotonic');
  assert.equal(progresses[progresses.length - 1], 100);

  console.log('Step retry, cancel and event-order guardrail cases passed.');
}

void main();
