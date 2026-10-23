import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createInMemoryAgentEventHub } from '../app';
import { createFileEventHistory } from '../sse/event-history';
import { FileTaskRepository } from './file-task-store';
import type { AgentServerEvent } from '@shared-types/api';

function event(taskId: string, id: string, type: AgentServerEvent['type']): AgentServerEvent {
  return { id, taskId, type, timestamp: Date.now(), payload: {} };
}

async function main(): Promise<void> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-studio-history-'));

  try {
    const repository = new FileTaskRepository(dataDir);
    const task = repository.create({
      input: 'persist me',
      conversationId: 'conv-persist',
      provider: 'mock',
    });
    repository.update(task.taskId, { status: 'completed', progress: 100 });

    const hub = createInMemoryAgentEventHub(createFileEventHistory(dataDir));
    const first = event(task.taskId, 'event-1', 'task_created');
    const second = event(task.taskId, 'event-2', 'task_complete');
    hub.publish(first);
    hub.publish(second);

    // A fresh process (new repository + new hub) must see the same run.
    const reloadedRepository = new FileTaskRepository(dataDir);
    const reloadedTask = reloadedRepository.get(task.taskId);
    assert.ok(reloadedTask, 'task should survive a repository reload');
    assert.equal(reloadedTask?.status, 'completed');
    assert.equal(reloadedTask?.provider, 'mock');

    const reloadedHub = createInMemoryAgentEventHub(createFileEventHistory(dataDir));
    const history = reloadedHub.getHistory(task.taskId);
    assert.deepEqual(history.map((item) => item.id), ['event-1', 'event-2']);

    const replayed: string[] = [];
    reloadedHub.subscribe(task.taskId, (item) => replayed.push(item.id), 'event-1');
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepEqual(replayed, ['event-2'], 'subscribe(after) should replay only newer events');

    console.log('Task and event persistence cases passed.');
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

void main();
