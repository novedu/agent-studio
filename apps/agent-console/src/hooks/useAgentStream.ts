import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AgentApiError,
  cancelAgentTask,
  createAgentTask,
  getAgentTask,
  retryAgentTaskStep,
  subscribeAgentEvents,
  type AgentEventSubscription,
  type AgentTaskStatus,
} from '../services/agent';
import { useAgentStore } from '../store/agentStore';
import type { AgentEvent } from '../types/agent';

/**
 * Demo pacing is opt-in: by default the console renders events as they arrive.
 * A paced replay made the UI lag behind the real runtime, which is the opposite
 * of what a debugging workbench should do.
 */
const demoPacingEnabled = import.meta.env.VITE_AGENT_DEMO_PACING === 'true';

export function useAgentStream() {
  const subscriptionRef = useRef<AgentEventSubscription | null>(null);
  const taskIdRef = useRef<string | null>(null);
  const eventQueueRef = useRef<AgentEvent[]>([]);
  const pendingBatchRef = useRef<AgentEvent[]>([]);
  const streamClosedRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const batchTimerRef = useRef<number | null>(null);
  const lastEventIdRef = useRef<string | undefined>(undefined);
  const [taskId, setTaskId] = useState<string | null>(null);

  const beginTask = useAgentStore((state) => state.beginTask);
  const beginRetry = useAgentStore((state) => state.beginRetry);
  const updateFromEvent = useAgentStore((state) => state.updateFromEvent);
  const setStatus = useAgentStore((state) => state.setStatus);
  const setLastError = useAgentStore((state) => state.setLastError);
  const markInterrupted = useAgentStore((state) => state.markInterrupted);
  const markCancelled = useAgentStore((state) => state.markCancelled);

  const clearQueuedEvents = useCallback(() => {
    eventQueueRef.current = [];
    pendingBatchRef.current = [];
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (batchTimerRef.current !== null) {
      window.clearTimeout(batchTimerRef.current);
      batchTimerRef.current = null;
    }
  }, []);

  const flushBatch = useCallback(() => {
    batchTimerRef.current = null;
    const batch = pendingBatchRef.current;
    pendingBatchRef.current = [];
    // A final answer arrives as many tiny delta events. Applying them one by one
    // produced 50+ nested Zustand updates in a burst; merge adjacent deltas and
    // apply the batch once per frame instead.
    coalesceFinalAnswerDeltas(batch).forEach(updateFromEvent);
  }, [updateFromEvent]);

  const flushNextEvent = useCallback(() => {
    const event = eventQueueRef.current.shift();
    if (!event) {
      timerRef.current = null;
      // The queue can be empty between batches; only a closed stream plus a
      // still-running task means the answer really was cut off.
      if (streamClosedRef.current && useAgentStore.getState().status === 'running') {
        useAgentStore.getState().markInterrupted();
        useAgentStore.getState().setLastError('任务在完成前中断了，可以重试这条。');
      }
      return;
    }

    updateFromEvent(event);
    timerRef.current = window.setTimeout(flushNextEvent, getPlaybackDelay(event));
  }, [updateFromEvent]);

  const dispatchEvent = useCallback(
    (event: AgentEvent) => {
      // Remember the cursor even when pacing is off, so a step retry can resume
      // the SSE stream without replaying the earlier attempt.
      lastEventIdRef.current = event.id;

      if (!demoPacingEnabled) {
        pendingBatchRef.current.push(event);
        if (batchTimerRef.current === null) {
          batchTimerRef.current = window.setTimeout(flushBatch, 16);
        }
        return;
      }

      eventQueueRef.current.push(event);
      if (timerRef.current === null) {
        flushNextEvent();
      }
    },
    [flushBatch, flushNextEvent],
  );

  const subscribe = useCallback(
    (id: string) => {
      subscriptionRef.current?.close();
      subscriptionRef.current = subscribeAgentEvents(id, {
        after: lastEventIdRef.current,
        onEvent: dispatchEvent,
        onError: () => {
          streamClosedRef.current = true;
          // Stop replaying buffered events: the transcript should end where
          // the connection actually ended, not a few frames later.
          clearQueuedEvents();
          markInterrupted();
          setLastError('与运行时服务的连接中断了，这条回答没有完成。确认 Agent Server 还在运行，再点重试。');
        },
        onClose: () => {
          subscriptionRef.current = null;
          streamClosedRef.current = true;
          // Apply anything still waiting in the 16ms batch before judging the
          // close: task_complete may be in that batch. Without this flush a
          // normal failure close looked like a dropped connection.
          if (pendingBatchRef.current.length > 0) {
            if (batchTimerRef.current !== null) {
              window.clearTimeout(batchTimerRef.current);
              batchTimerRef.current = null;
            }
            flushBatch();
          }
          // The server closes the stream as soon as it finishes sending, which
          // can be before the paced replay has applied task_complete. Only an
          // empty queue plus a running task is a genuine interruption.
          if (eventQueueRef.current.length === 0 && useAgentStore.getState().status === 'running') {
            markInterrupted();
            setLastError('任务在完成前中断了，可以重试这条。');
          }
        },
      });
    },
    [clearQueuedEvents, dispatchEvent, flushBatch, markInterrupted, setLastError],
  );

  const start = useCallback(
    async (input: string) => {
      subscriptionRef.current?.close();
      subscriptionRef.current = null;
      taskIdRef.current = null;
      setTaskId(null);
      streamClosedRef.current = false;
      lastEventIdRef.current = undefined;
      clearQueuedEvents();
      setLastError(undefined);
      beginTask(input);

      try {
        const conversationId = useAgentStore.getState().ensureConversationId();
        const task = await createAgentTask(input, conversationId);
        taskIdRef.current = task.taskId;
        setTaskId(task.taskId);
        subscribe(task.taskId);
      } catch {
        setStatus('error');
        setLastError('无法创建任务：运行时服务可能没有启动。先运行 `npm run server`，再重试。');
        writeActiveAssistantMessage('Unable to start the Agent Server task. Start the runtime server, then run the demo again.');
      }
    },
    [beginTask, clearQueuedEvents, setLastError, setStatus, subscribe],
  );

  const retryStep = useCallback(
    async (stepId: string, args: Record<string, unknown>) => {
      const id = taskIdRef.current;
      if (!id) {
        setLastError('找不到当前任务，无法重试这一步。');
        return;
      }

      subscriptionRef.current?.close();
      subscriptionRef.current = null;
      streamClosedRef.current = false;
      clearQueuedEvents();
      beginRetry();

      try {
        const result = await retryAgentTaskStep(id, stepId, args);
        taskIdRef.current = result.taskId;
        setTaskId(result.taskId);
        subscribe(result.taskId);
      } catch (error) {
        const message =
          error instanceof AgentApiError
            ? error.message
            : '重试失败：运行时服务没有响应。';
        setStatus('error');
        setLastError(message);
        // The retry turn already created an empty assistant message; fill it so
        // the transcript does not keep showing a "thinking" bubble.
        writeActiveAssistantMessage(`重试失败：${message}`);
      }
    },
    [beginRetry, clearQueuedEvents, setLastError, setStatus, subscribe],
  );

  const stop = useCallback(async () => {
    const id = taskIdRef.current;
    if (!id) {
      markCancelled();
      return;
    }

    try {
      // Only a 2xx means the runtime actually cancelled the task. Swallowing a
      // 409 here used to show "cancelled" for tasks that had already completed.
      await cancelAgentTask(id);
      markCancelled();
    } catch (error) {
      if (error instanceof AgentApiError && error.code === 'TASK_NOT_CANCELLABLE') {
        try {
          const task = await getAgentTask(id);
          setStatus(mapTaskStatus(task.status));
          // A completed task simply finished first; do not turn that into a
          // red "needs attention" banner.
          if (task.status !== 'completed' && task.status !== 'cancelled') {
            setLastError(`任务当前状态为 ${task.status}，无法取消。`);
          }
        } catch {
          setStatus('error');
          setLastError('无法确认任务状态，请刷新页面后重试。');
        }
      } else {
        setStatus('error');
        setLastError(error instanceof Error ? error.message : '取消失败，请重试。');
      }
    } finally {
      subscriptionRef.current?.close();
      subscriptionRef.current = null;
      taskIdRef.current = null;
      setTaskId(null);
      clearQueuedEvents();
    }
  }, [clearQueuedEvents, markCancelled, setLastError, setStatus]);

  useEffect(
    () => () => {
      subscriptionRef.current?.close();
      clearQueuedEvents();
    },
    [clearQueuedEvents],
  );

  return { start, stop, retryStep, taskId };
}

function coalesceFinalAnswerDeltas(events: AgentEvent[]): AgentEvent[] {
  const result: AgentEvent[] = [];

  for (const event of events) {
    const payload = event.payload as { delta?: unknown } | undefined;
    const previous = result[result.length - 1];
    const previousPayload = previous?.payload as { delta?: unknown } | undefined;

    if (
      event.type === 'final_answer' &&
      typeof payload?.delta === 'string' &&
      previous?.type === 'final_answer' &&
      typeof previousPayload?.delta === 'string'
    ) {
      result[result.length - 1] = {
        ...previous,
        id: event.id,
        timestamp: event.timestamp,
        payload: { delta: previousPayload.delta + payload.delta },
      };
      continue;
    }

    result.push(event);
  }

  return result;
}

function mapTaskStatus(status: AgentTaskStatus): 'idle' | 'running' | 'success' | 'error' | 'cancelled' {
  if (status === 'completed') return 'success';
  if (status === 'failed') return 'error';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'running' || status === 'queued') return 'running';
  return 'idle';
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
  store.updateMessage(messageId, { content });
}
