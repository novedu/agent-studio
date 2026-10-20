import { createAgentServerApp, type CreateAgentServerAppOptions } from './app';
import { loadEnvFile } from './env';
import { createHttpServer } from './http';
import { AgentRuntimeAdapter } from './runtime/agent-runtime-adapter';

export function createServer(options: CreateAgentServerAppOptions) {
  return createAgentServerApp(options);
}

export function startServer(port = Number(process.env.PORT ?? 3001)) {
  loadEnvFile();
  const app = createAgentServerApp({
    runtime: new AgentRuntimeAdapter(),
  });
  const server = createHttpServer({ app });

  server.listen(port, () => {
    console.log(`Agent Runtime Server listening on http://127.0.0.1:${port}`);
  });

  return server;
}

if (require.main === module) {
  startServer();
}

export type { CreateAgentServerAppOptions };
