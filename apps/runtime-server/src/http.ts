import { createServer as createNodeServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import type { AgentServerApp } from './app';
import { createEventStream, sseHeaders } from './sse/event-stream';
import { getLLMProviderName } from './env';
import type { ApiErrorResponse, CreateAgentTaskRequest } from '@shared-types/api';

export interface CreateHttpServerOptions {
  app: AgentServerApp;
}

export function createHttpServer(options: CreateHttpServerOptions): Server {
  return createNodeServer(async (req, res) => {
    try {
      await handleRequest(options.app, req, res);
    } catch (error) {
      sendJson(res, 500, {
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      } satisfies ApiErrorResponse);
    }
  });
}

async function handleRequest(app: AgentServerApp, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method ?? 'GET';
  const url = new URL(req.url ?? '/', 'http://localhost');
  const pathname = url.pathname;

  if (method === 'OPTIONS') {
    sendEmpty(res, 204);
    return;
  }

  if (method === 'GET' && pathname === '/health') {
    sendJson(res, 200, { status: 'ok', provider: getLLMProviderName() });
    return;
  }

  if (method === 'POST' && pathname === '/api/agent/tasks') {
    const body = await readJsonBody<CreateAgentTaskRequest>(req);
    const result = await app.handlers.createTask(body);
    sendJson(res, isApiError(result) ? 400 : 200, result);
    return;
  }

  if (method === 'GET' && pathname === '/api/agent/tasks') {
    sendJson(res, 200, await app.handlers.listTasks());
    return;
  }

  const taskCancelMatch = pathname.match(/^\/api\/agent\/tasks\/([^/]+)\/cancel$/);
  if (method === 'POST' && taskCancelMatch) {
    const result = await app.handlers.cancelTask(taskCancelMatch[1]);
    sendJson(res, isApiError(result) ? 404 : 200, result);
    return;
  }

  const taskRetryMatch = pathname.match(/^\/api\/agent\/tasks\/([^/]+)\/retry$/);
  if (method === 'POST' && taskRetryMatch) {
    const result = await app.handlers.retryTask(taskRetryMatch[1]);
    sendJson(res, isApiError(result) ? 400 : 200, result);
    return;
  }

  const taskEventsMatch = pathname.match(/^\/api\/agent\/tasks\/([^/]+)\/events$/);
  if (method === 'GET' && taskEventsMatch) {
    handleSse(app, taskEventsMatch[1], req, res);
    return;
  }

  const taskMatch = pathname.match(/^\/api\/agent\/tasks\/([^/]+)$/);
  if (method === 'GET' && taskMatch) {
    const result = await app.handlers.getTask(taskMatch[1]);
    sendJson(res, isApiError(result) ? 404 : 200, result);
    return;
  }

  sendJson(res, 404, {
    error: {
      code: 'NOT_FOUND',
      message: `${method} ${pathname} is not supported`,
    },
  } satisfies ApiErrorResponse);
}

function handleSse(
  app: AgentServerApp,
  taskId: string,
  req: IncomingMessage,
  res: ServerResponse,
): void {
  res.writeHead(200, {
    ...sseHeaders,
    ...corsHeaders,
  });
  res.write('\n');

  const stream = createEventStream({
    write: (chunk) => res.write(chunk),
    close: () => res.end(),
  });

  const heartbeat = setInterval(() => {
    stream.heartbeat();
  }, 15000);
  let unsubscribe: () => void = () => {
    // no active subscription yet
  };

  const unsubscribeOrError = app.handlers.subscribeTaskEvents(taskId, (event) => {
    stream.send(event);

    if (event.type === 'task_complete') {
      clearInterval(heartbeat);
      unsubscribe();
      stream.close();
    }
  });

  if (typeof unsubscribeOrError !== 'function') {
    clearInterval(heartbeat);
    stream.send({
      id: `${taskId}_subscribe_error`,
      taskId,
      type: 'task_complete',
      timestamp: Date.now(),
      payload: {
        status: 'failed',
        duration: 0,
        error: unsubscribeOrError.error.message,
      },
    });
    stream.close();
    return;
  }

  unsubscribe = unsubscribeOrError;

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {} as T;
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...corsHeaders,
  });
  res.end(JSON.stringify(payload));
}

function sendEmpty(res: ServerResponse, statusCode: number): void {
  res.writeHead(statusCode, corsHeaders);
  res.end();
}

function isApiError(value: unknown): value is ApiErrorResponse {
  return Boolean(value && typeof value === 'object' && 'error' in value);
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
} as const;
