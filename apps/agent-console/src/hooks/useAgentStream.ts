import { useCallback, useEffect, useRef } from 'react';
import {
  cancelAgentTask,
  createAgentTask,
  subscribeAgentEvents,
  type AgentEventSubscription,
} from '../services/agent';
import { useAgentStore } from '../store/agentStore';
import type { AgentEvent } from '../types/agent';

const demoPacingEnabled = import.meta.env.VITE_AGENT_DEMO_PACING !== 'false';

export function useAgentStream() {
  const subscriptionRef = useRef<AgentEventSubscription | null>(null);
  const taskIdRef = useRef<string | null>(null);
  const eventQueueRef = useRef<AgentEvent[]>([]);
  const timerRef = useRef<number | null>(null);
  const beginTask = useAgentStore((state) => state.beginTask);
  const updateFromEvent = useAgentStore((state) => state.updateFromEvent);
  const setStatus = useAgentStore((state) => state.setStatus);
  const setLastError = useAgentStore((state) => state.setLastError);

  const clearQueuedEvents = useCallback(() => {
    eventQueueRef.current = [];
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const flushNextEvent = useCallback(() => {
    const event = eventQueueRef.current.shift();
    if (!event) {
      timerRef.current = null;
      return;
    }

    updateFromEvent(event);
    timerRef.current = window.setTimeout(flushNextEvent, getPlaybackDelay(event));
  }, [updateFromEvent]);

  const dispatchEvent = useCallback(
    (event: AgentEvent) => {
      if (!demoPacingEnabled) {
        updateFromEvent(event);
        return;
      }

      eventQueueRef.current.push(event);
      if (timerRef.current === null) {
        flushNextEvent();
      }
    },
    [flushNextEvent, updateFromEvent],
  );

  const start = useCallback(
    async (input: string) => {
      subscriptionRef.current?.close();
      subscriptionRef.current = null;
      taskIdRef.current = null;
      clearQueuedEvents();
      setLastError(undefined);
      beginTask(input);

      try {
        const conversationId = useAgentStore.getState().ensureConversationId();
        const task = await createAgentTask(input, conversationId);
        taskIdRef.current = task.taskId;
        subscriptionRef.current = subscribeAgentEvents(task.taskId, {
          onEvent: dispatchEvent,
          onError: () => {
            setStatus('error');
            setLastError('与运行时服务的连接中断了。确认 Agent Server 还在运行，然后重试。');
            writeActiveAssistantMessage('Runtime server connection lost. Check the Agent Server and rerun the demo task.');
          },
          onClose: () => {
            subscriptionRef.current = null;
            taskIdRef.current = null;
          },
        });
      } catch {
        setStatus('error');
        setLastError('无法创建任务：运行时服务可能没有启动。先运行 `npm run server`，再重试。');
        writeActiveAssistantMessage('Unable to start the Agent Server task. Start the runtime server, then run the demo again.');
      }
    },
    [beginTask, clearQueuedEvents, dispatchEvent, setLastError, setStatus],
  );

  const stop = useCallback(() => {
    const taskId = taskIdRef.current;
    subscriptionRef.current?.close();
    subscriptionRef.current = null;
    taskIdRef.current = null;
    clearQueuedEvents();
    if (taskId) {
      void cancelAgentTask(taskId).catch(() => undefined);
    }
    writeActiveAssistantMessage('Task cancelled by user.');
    setStatus('idle');
  }, [clearQueuedEvents, setStatus]);

  useEffect(
    () => () => {
      subscriptionRef.current?.close();
      clearQueuedEvents();
    },
    [clearQueuedEvents],
  );

  return { start, stop };
}

function getPlaybackDelay(event: AgentEvent): number {
  if (event.type === 'final_answer') return 16;
  if (event.type === 'state_update') return 36;
  if (event.type === 'tool_start') return 180;
  if (event.type === 'tool_success') return 120;
  if (event.type === 'plan_start' || event.type === 'plan_update') return 180;
  if (event.type === 'rag_retrieve') return 160;
  if (event.type === 'memory_update') return 140;
  if (event.type === 'reflection') return 160;
  if (event.type === 'evaluation_start' || event.type === 'evaluation_complete') return 160;
  return 80;
}

function writeActiveAssistantMessage(content: string): void {
  const store = useAgentStore.getState();
  const messageId = store.activeAssistantMessageId;
  if (!messageId) return;
  store.updateMessage(messageId, {
    content,
  });
}
