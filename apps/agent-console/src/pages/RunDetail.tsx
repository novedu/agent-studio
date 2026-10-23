import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Badge, Card, Skeleton, StatusTag } from '@console/components/ui';
import {
  getAgentTaskHistory,
  type AgentTaskHistoryResponse,
} from '@console/services/agent';
import type { AgentEvent } from '@console/types/agent';
import type { TaskStepRecord } from '@shared-types/task';

export function RunDetail() {
  const { taskId } = useParams<{ taskId: string }>();
  const [data, setData] = useState<AgentTaskHistoryResponse>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!taskId) {
      setError('Missing task id.');
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    setError(undefined);
    getAgentTaskHistory(taskId)
      .then((history) => {
        if (active) setData(history);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load this run.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [taskId]);

  const task = data?.task;
  const events = useMemo(() => data?.events ?? [], [data]);
  const finalAnswer = useMemo(() => task?.trace?.finalAnswer ?? readFinalAnswer(events), [events, task]);
  const duration = task?.trace?.totalDuration ?? computeDuration(events);
  const steps = task?.steps ?? [];

  if (loading) {
    return (
      <section className="h-full overflow-y-auto bg-[var(--studio-bg)] p-6">
        <Skeleton lines={10} />
      </section>
    );
  }

  if (error || !task) {
    return (
      <section className="h-full overflow-y-auto bg-[var(--studio-bg)] p-6">
        <Card className="mx-auto max-w-xl p-6">
          <div className="text-sm font-semibold text-ink">Run not found</div>
          <p className="mt-2 text-xs leading-5 text-muted">
            {error ?? 'This run is not in the local history anymore.'}
          </p>
          <Link to="/dashboard" className="mt-4 inline-block text-xs font-semibold text-blue-700 hover:underline">
            Back to runs
          </Link>
        </Card>
      </section>
    );
  }

  const providerLabel =
    task.provider === 'mock'
      ? 'Mock · 模板'
      : task.model
        ? `${vendorLabel(task.provider)} · ${task.model}`
        : task.provider ?? 'unknown';

  return (
    <section className="h-full overflow-y-auto bg-[var(--studio-bg)]">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-4 p-4 lg:p-6">
        <header className="border-b border-line pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <Link to="/dashboard" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted hover:text-ink">
                ← Runs
              </Link>
              <h1 className="mt-1 truncate text-xl font-semibold tracking-tight text-ink">Run Detail</h1>
              <div className="mt-1 truncate font-mono text-[10px] text-muted">{task.taskId}</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge tone="neutral">{providerLabel}</Badge>
              <StatusTag status={task.status} />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] text-muted">
            <span>progress {task.progress}%</span>
            <span>retry {task.retryCount}/{task.maxRetry}</span>
            <span>duration {formatDuration(duration)}</span>
            <span>{formatTime(task.createdAt)}</span>
            {task.failedStepId ? <span className="text-rose-700">failed step {task.failedStepId}</span> : null}
          </div>
        </header>

        <Card className="p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Goal</div>
          <p className="mt-1 text-sm leading-6 text-ink">{task.input ?? 'No input recorded.'}</p>
          {task.lastError ? (
            <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
              {task.lastError}
            </p>
          ) : null}
        </Card>

        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-w-0 flex-col gap-4">
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-ink">Final answer</div>
                <Badge tone={task.status === 'completed' ? 'success' : 'neutral'}>
                  {task.status === 'completed' ? 'delivered' : 'not delivered'}
                </Badge>
              </div>
              {finalAnswer ? (
                <div className="prose prose-sm mt-3 max-w-none prose-headings:mb-2 prose-headings:mt-3 prose-headings:text-sm prose-li:my-0">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{finalAnswer}</ReactMarkdown>
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted">
                  This run ended without a final answer. Check the failed step below.
                </p>
              )}
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-ink">Steps & attempts</div>
                <Badge>{steps.length} steps</Badge>
              </div>
              {steps.length === 0 ? (
                <p className="mt-3 text-xs text-muted">No step records were persisted for this run.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {steps.map((step) => (
                    <StepCard key={step.id} step={step} />
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-ink">Event history</div>
                <Badge>{events.length} events</Badge>
              </div>
              <p className="mt-1 text-[10px] text-muted">
                Stored on the server as JSONL; answer deltas are collapsed and not listed one by one.
              </p>
              <div className="mt-3 space-y-1">
                {events
                  .filter((event) => !isAnswerDelta(event))
                  .map((event) => (
                    <EventRow key={event.id} event={event} />
                  ))}
              </div>
            </Card>
          </div>

          <aside className="flex min-w-0 flex-col gap-4">
            <Card className="p-4">
              <div className="text-sm font-semibold text-ink">Run metadata</div>
              <dl className="mt-3 space-y-2 text-[11px]">
                <Row label="Status" value={task.status} />
                <Row label="Provider" value={providerLabel} />
                <Row label="Progress" value={`${task.progress}%`} />
                <Row label="Retries" value={`${task.retryCount}/${task.maxRetry}`} />
                <Row label="Duration" value={formatDuration(duration)} />
                <Row label="Created" value={formatTime(task.createdAt)} />
                <Row label="Events" value={String(events.length)} />
              </dl>
            </Card>

            <Card className="p-4">
              <div className="text-sm font-semibold text-ink">Boundary</div>
              <p className="mt-2 text-[11px] leading-5 text-muted">
                History is a local JSON snapshot. Memory, knowledge base and evaluation datasets are still
                in-memory / demo scoped; this page only replays what the runtime actually persisted.
              </p>
            </Card>
          </aside>
        </div>
      </div>
    </section>
  );
}

function StepCard({ step }: { step: TaskStepRecord }) {
  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-muted">#{step.id}</span>
            <span className="truncate text-xs font-semibold text-ink">{step.description}</span>
          </div>
          <div className="mt-1 font-mono text-[10px] text-muted">
            {step.tool} · {step.attempts.length} attempt{step.attempts.length === 1 ? '' : 's'}
          </div>
        </div>
        <StatusTag status={step.status} />
      </div>

      {step.attempts.length > 0 ? (
        <div className="mt-2 space-y-2">
          {step.attempts.map((attempt) => (
            <div key={attempt.attemptNo} className="rounded-md border border-line bg-panel px-2.5 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[10px]">
                <span className="font-semibold text-ink">Attempt {attempt.attemptNo}</span>
                <span className="font-mono text-muted">
                  {attempt.status} · {formatDuration(attempt.duration)}
                </span>
              </div>
              {attempt.args ? (
                <pre className="mt-1 overflow-x-auto rounded bg-white px-2 py-1 font-mono text-[10px] text-slate-600">
                  {JSON.stringify(attempt.args)}
                </pre>
              ) : null}
              {attempt.error ? (
                <p className="mt-1 text-[10px] leading-4 text-rose-700">
                  {attempt.error.type ? `${attempt.error.type}: ` : ''}
                  {attempt.error.message}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[10px] text-muted">No tool attempt recorded (LLM step).</p>
      )}
    </div>
  );
}

function EventRow({ event }: { event: AgentEvent }) {
  return (
    <details className="group rounded-md border border-line bg-white px-2.5 py-1.5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[10px]">
        <span className="font-mono font-semibold text-ink">{event.type}</span>
        <span className="font-mono text-muted">{formatTime(event.timestamp)}</span>
      </summary>
      <pre className="mt-2 max-h-48 overflow-auto rounded bg-slate-950 p-2 text-[10px] leading-4 text-slate-100">
        {JSON.stringify(event.payload, null, 2)}
      </pre>
    </details>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="truncate font-mono text-ink">{value}</dd>
    </div>
  );
}

function isAnswerDelta(event: AgentEvent): boolean {
  const payload = event.payload as { delta?: unknown };
  return event.type === 'final_answer' && typeof payload?.delta === 'string';
}

function readFinalAnswer(events: AgentEvent[]): string | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type !== 'final_answer') continue;
    const payload = event.payload as { content?: unknown };
    if (typeof payload.content === 'string' && payload.content) return payload.content;
  }
  return undefined;
}

function computeDuration(events: AgentEvent[]): number | undefined {
  const timestamps = events.map((event) => event.timestamp).filter((value) => value > 0);
  if (timestamps.length < 2) return undefined;
  return Math.max(...timestamps) - Math.min(...timestamps);
}

function formatDuration(value?: number): string {
  if (value === undefined) return '—';
  if (value < 1000) return `${value}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}

function formatTime(timestamp?: number): string {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

function vendorLabel(provider?: string): string {
  if (provider === 'deepseek') return 'DeepSeek';
  if (provider === 'openai') return 'OpenAI';
  return provider ?? 'Unknown';
}
