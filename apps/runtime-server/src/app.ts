import { agentRoutes, createAgentRouteHandlers, type AgentEventHub } from './routes/agent';
import { TaskManager } from './task/task-manager';
import type { TaskRepository } from './task/task-repository';
import { InMemoryTaskRepository } from './task/task-store';
import type { AgentEventSink, AgentRuntimePort, AgentServerEvent } from '@shared-types/api';
import { getRuntimeModelInfo, type RuntimeModelInfo } from './env';
import type { EventHistoryStorage } from './sse/event-history';

export interface AgentServerApp {
  routes: typeof agentRoutes;
  handlers: ReturnType<typeof createAgentRouteHandlers>;
  taskManager: TaskManager;
  taskRepository: TaskRepository;
  eventHub: AgentEventHub;
}

export interface CreateAgentServerAppOptions {
  runtime: AgentRuntimePort;
  taskRepository?: TaskRepository;
  eventHub?: AgentEventHub;
  /** Describes the model that actually serves new tasks (mock vs real). */
  runtimeInfo?: () => RuntimeModelInfo;
}

export function createAgentServerApp(options: CreateAgentServerAppOptions): AgentServerApp {
  const eventHub = options.eventHub ?? createInMemoryAgentEventHub();
  const taskRepository = options.taskRepository ?? new InMemoryTaskRepository();
  const taskManager = new TaskManager({
    repository: taskRepository,
    runtime: options.runtime,
    publishEvent: eventHub.publish,
    runtimeInfo: options.runtimeInfo ?? getRuntimeModelInfo,
  });

  return {
    routes: agentRoutes,
    handlers: createAgentRouteHandlers({
      taskManager,
      eventHub,
    }),
    taskManager,
    taskRepository,
    eventHub,
  };
}

export function createInMemoryAgentEventHub(storage?: EventHistoryStorage): AgentEventHub {
  const listeners = new Map<string, Set<AgentEventSink>>();
  const history = storage?.load() ?? new Map<string, AgentServerEvent[]>();

  return {
    publish: (event: AgentServerEvent) => {
      const taskHistory = history.get(event.taskId) ?? [];
      taskHistory.push(event);
      history.set(event.taskId, taskHistory);
      storage?.append(event);

      const taskListeners = listeners.get(event.taskId);
      if (!taskListeners) return;

      taskListeners.forEach((listener) => listener(event));
    },

    getHistory: (taskId) => [...(history.get(taskId) ?? [])],

    subscribe: (taskId, listener, afterEventId) => {
      const taskListeners = listeners.get(taskId) ?? new Set<AgentEventSink>();
      taskListeners.add(listener);
      listeners.set(taskId, taskListeners);
      queueMicrotask(() => {
        const taskHistory = history.get(taskId) ?? [];
        const cursor = afterEventId
          ? taskHistory.findIndex((event) => event.id === afterEventId)
          : -1;
        // Replay only what this subscriber has not seen. A missing cursor means
        // the history was evicted or the client is new, so replay everything.
        const replay = cursor >= 0 ? taskHistory.slice(cursor + 1) : taskHistory;
        replay.forEach((event) => {
          if (listeners.get(taskId)?.has(listener)) {
            listener(event);
          }
        });
      });

      return () => {
        taskListeners.delete(listener);
        if (taskListeners.size === 0) {
          listeners.delete(taskId);
        }
      };
    },
  };
}
