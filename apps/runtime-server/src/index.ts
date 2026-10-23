import path from 'node:path';
import { createAgentServerApp, createInMemoryAgentEventHub, type CreateAgentServerAppOptions } from './app';
import { loadEnvFile } from './env';
import { createHttpServer } from './http';
import { AgentRuntimeAdapter } from './runtime/agent-runtime-adapter';
import { createFileEventHistory } from './sse/event-history';
import { FileTaskRepository } from './task/file-task-store';

export function createServer(options: CreateAgentServerAppOptions) {
  return createAgentServerApp(options);
}

export function startServer(port = Number(process.env.PORT ?? 3001)) {
  loadEnvFile();
  const dataDir = process.env.AGENT_DATA_DIR?.trim() || path.join(process.cwd(), '.data');
  const app = createAgentServerApp({
    runtime: new AgentRuntimeAdapter(),
    taskRepository: new FileTaskRepository(dataDir),
    eventHub: createInMemoryAgentEventHub(createFileEventHistory(dataDir)),
  });
  const server = createHttpServer({ app });

  server.listen(port, () => {
    console.log(`Agent Runtime Server listening on http://127.0.0.1:${port}`);
    console.log(`Persisting runs to ${dataDir}`);
  });

  return server;
}

if (require.main === module) {
  startServer();
}

export type { CreateAgentServerAppOptions };
