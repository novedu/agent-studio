import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  ChevronRightIcon,
  EvaluationIcon,
  LinkIcon,
  Panel,
} from '@console/components/ui';
import { classNames } from '@console/components/ui/classNames';
import { useAgentStore } from '@console/store/agentStore';
import type {
  AgentEvent,
  CitationRecord,
  EvaluationCriteria,
  EvaluationResult,
  MemoryRecord,
  Message,
  ToolCallRecord,
} from '@console/types/agent';

type CriteriaKey = keyof EvaluationCriteria;

interface EvaluationRun {
  startEvent?: AgentEvent;
  completeEvent?: AgentEvent;
  duration?: number;
  taskId?: string;
  status: 'pending' | 'running' | 'completed';
}

interface EvaluationContextSummary {
  task: string;
  answerLength: number;
  toolCount: number;
  failedToolCount: number;
  citationCount: number;
  memoryCount: number;
  eventCount: number;
}

const criteriaDefinitions: Array<{
  key: CriteriaKey;
  label: string;
  description: string;
}> = [
  {
    key: 'completeness',
    label: 'Completeness',
    description: 'Answer includes structure, analysis, conclusion, and recommendations.',
  },
  {
    key: 'accuracy',
    label: 'Accuracy',
    description: 'Tool outputs are usable and no critical execution error is present.',
  },
  {
    key: 'groundedness',
    label: 'Groundedness',
    description: 'Answer is supported by retrieved knowledge and citations.',
  },
  {
    key: 'taskCompletion',
    label: 'Task Completion',
    description: 'The final answer satisfies the requested Agent task.',
  },
];

export function Evaluation() {
  const evaluation = useAgentStore((state) => state.evaluation);
  const events = useAgentStore((state) => state.events);
  const messages = useAgentStore((state) => state.messages);
  const tools = useAgentStore((state) => state.tools);
  const citations = useAgentStore((state) => state.citations);
  const memory = useAgentStore((state) => state.memory);
  const status = useAgentStore((state) => state.status);

  const run = useMemo(() => buildEvaluationRun(events), [events]);
  const context = useMemo(
    () => buildContextSummary(messages, tools, citations, memory, events),
    [citations, events, memory, messages, tools],
  );

  return (
    <section className="h-full overflow-y-auto bg-[var(--studio-bg)]">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-4 p-4 lg:p-6">
        <EvaluationHeader evaluation={evaluation} run={run} status={status} />

        {!evaluation ? (
          <EvaluationEmptyState run={run} context={context} />
        ) : (
          <>
            <EvaluationMetricStrip evaluation={evaluation} run={run} context={context} />

            <div className="grid min-h-[650px] min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="grid min-h-0 gap-4 xl:grid-rows-[320px_minmax(0,1fr)]">
                <ScorecardPanel evaluation={evaluation} />
                <FeedbackPanel evaluation={evaluation} context={context} />
              </div>

              <div className="grid min-h-0 gap-4 xl:grid-rows-[minmax(0,1fr)_280px]">
                <EvaluationTracePanel run={run} events={events} />
                <RegressionReadinessPanel />
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function EvaluationHeader({
  evaluation,
  run,
  status,
}: {
  evaluation?: EvaluationResult;
  run: EvaluationRun;
  status: string;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
            Evaluation Platform
          </div>
          <Badge tone="neutral">Rule-based</Badge>
          <Badge tone={evaluation ? getScoreTone(evaluation.score) : run.status === 'running' ? 'info' : 'neutral'}>
            {evaluation ? `${Math.round(evaluation.score * 100)} score` : run.status}
          </Badge>
        </div>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-ink">Evaluation Center</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Heuristic rule scoring (structure, tool success, RAG evidence, completion) — not an LLM judge.
          Review criteria, feedback, and runtime evidence from the current Agent run.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[10px] text-muted">
          <span>current session only</span>
          <span className="text-lineStrong">·</span>
          <span>runtime {status}</span>
          <span className="text-lineStrong">·</span>
          <span>{run.taskId ?? 'no task id'}</span>
        </div>
      </div>
      <Link to="/agent">
        <Button size="sm" variant="primary">
          Open Agent Workspace
          <ChevronRightIcon className="h-3.5 w-3.5" />
        </Button>
      </Link>
    </header>
  );
}

function EvaluationMetricStrip({
  evaluation,
  run,
  context,
}: {
  evaluation: EvaluationResult;
  run: EvaluationRun;
  context: EvaluationContextSummary;
}) {
  const metrics = [
    {
      label: 'Overall score',
      value: `${Math.round(evaluation.score * 100)}%`,
      detail: getScoreLabel(evaluation.score),
      tone: getScoreTone(evaluation.score),
    },
    {
      label: 'Duration',
      value: formatDuration(run.duration),
      detail: 'evaluation span',
      tone: 'neutral' as const,
    },
    {
      label: 'Evidence',
      value: `${context.citationCount}`,
      detail: 'citations',
      tone: context.citationCount > 0 ? 'warning' as const : 'neutral' as const,
    },
    {
      label: 'Tool health',
      value: context.failedToolCount === 0 ? 'clean' : `${context.failedToolCount} failed`,
      detail: `${context.toolCount} calls`,
      tone: context.failedToolCount === 0 ? 'success' as const : 'danger' as const,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <Card key={metric.label} className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
              {metric.label}
            </div>
            <Badge tone={metric.tone}>{metric.detail}</Badge>
          </div>
          <div className="mt-3 font-mono text-2xl font-semibold tracking-tight text-ink">
            {metric.value}
          </div>
        </Card>
      ))}
    </div>
  );
}

function ScorecardPanel({ evaluation }: { evaluation: EvaluationResult }) {
  return (
    <Panel
      title="Quality Scorecard"
      description="Rule-based evaluator output"
      actions={<Badge tone={getScoreTone(evaluation.score)}>{getScoreLabel(evaluation.score)}</Badge>}
      bodyClassName="min-h-0 overflow-hidden p-0"
    >
      <div className="grid h-full min-h-0 gap-0 md:grid-cols-[290px_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col justify-between border-b border-line bg-white p-5 md:border-b-0 md:border-r">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
              Overall
            </div>
            <div className="mt-2 font-mono text-6xl font-semibold tracking-tight text-ink">
              {Math.round(evaluation.score * 100)}
            </div>
            <p className="mt-3 text-sm leading-6 text-muted">
              The current evaluator combines completeness, accuracy, groundedness, and task completion.
            </p>
          </div>
          <div className="mt-5">
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={classNames(
                  'h-full rounded-full transition-[width] duration-200',
                  evaluation.score >= 0.8 && 'bg-emerald-500',
                  evaluation.score < 0.8 && evaluation.score >= 0.6 && 'bg-amber-500',
                  evaluation.score < 0.6 && 'bg-rose-500',
                )}
                style={{ width: `${Math.round(evaluation.score * 100)}%` }}
              />
            </div>
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto p-4">
          <div className="grid gap-3 md:grid-cols-2">
            {criteriaDefinitions.map((criterion) => {
              const value = evaluation.criteria[criterion.key];
              return (
                <article key={criterion.key} className="rounded-xl border border-line bg-panel p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-ink">{criterion.label}</div>
                      <p className="mt-1 text-xs leading-5 text-muted">{criterion.description}</p>
                    </div>
                    <Badge tone={getScoreTone(value)}>{Math.round(value * 100)}%</Badge>
                  </div>
                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={classNames(
                        'h-full rounded-full',
                        value >= 0.8 && 'bg-emerald-500',
                        value < 0.8 && value >= 0.6 && 'bg-amber-500',
                        value < 0.6 && 'bg-rose-500',
                      )}
                      style={{ width: `${Math.round(value * 100)}%` }}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function FeedbackPanel({
  evaluation,
  context,
}: {
  evaluation: EvaluationResult;
  context: EvaluationContextSummary;
}) {
  return (
    <Panel
      title="Feedback Review"
      description="Evaluator feedback and supporting runtime context"
      actions={<Badge>{evaluation.feedback.length} notes</Badge>}
      bodyClassName="min-h-0 overflow-y-auto p-0"
    >
      <div className="grid min-h-0 gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          {evaluation.feedback.map((item, index) => (
            <article key={`${item}_${index}`} className="rounded-xl border border-line bg-white p-4">
              <div className="flex items-start gap-3">
                <span className="mt-1 h-2 w-2 rounded-full bg-teal-500" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-ink">Feedback {index + 1}</div>
                  <p className="mt-1 text-sm leading-6 text-muted">{item}</p>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="space-y-3">
          <ContextCard label="Task" value={context.task} />
          <ContextGrid
            items={[
              ['Answer length', `${context.answerLength} chars`],
              ['Runtime events', String(context.eventCount)],
              ['Tools', `${context.toolCount} calls`],
              ['Failed tools', String(context.failedToolCount)],
              ['Knowledge', `${context.citationCount} chunks`],
              ['Memory', `${context.memoryCount} records`],
            ]}
          />
          <Link to="/agent" className="inline-flex">
            <Button size="sm" variant="secondary">
              <LinkIcon className="h-3.5 w-3.5" />
              Inspect runtime trace
            </Button>
          </Link>
        </div>
      </div>
    </Panel>
  );
}

function EvaluationTracePanel({
  run,
  events,
}: {
  run: EvaluationRun;
  events: AgentEvent[];
}) {
  const evaluationEvents = events.filter(
    (event) => event.type === 'evaluation_start' || event.type === 'evaluation_complete',
  );

  return (
    <Panel
      title="Evaluation Trace"
      description="Evaluator lifecycle events"
      actions={<Badge tone={run.status === 'completed' ? 'success' : 'neutral'}>{run.status}</Badge>}
      bodyClassName="min-h-0 overflow-y-auto p-0"
    >
      {evaluationEvents.length === 0 ? (
        <SmallEmpty title="No evaluator events" description="Evaluation starts after the final answer is generated." />
      ) : (
        <div className="divide-y divide-line">
          {evaluationEvents.map((event) => (
            <article key={event.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={classNames(
                        'h-2 w-2 rounded-full',
                        event.type === 'evaluation_start' ? 'bg-blue-500' : 'bg-emerald-500',
                      )}
                    />
                    <div className="text-xs font-semibold text-ink">{formatEventType(event.type)}</div>
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-muted">
                    {formatTime(event.timestamp)} · {event.id}
                  </div>
                </div>
                <Badge tone={event.type === 'evaluation_complete' ? 'success' : 'info'}>
                  {event.type === 'evaluation_complete' ? 'complete' : 'start'}
                </Badge>
              </div>
              <pre className="mt-3 overflow-hidden rounded-lg border border-line bg-slate-950 p-3 font-mono text-[10px] leading-5 text-slate-100">
                {JSON.stringify(event.payload, null, 2)}
              </pre>
            </article>
          ))}
        </div>
      )}
    </Panel>
  );
}

function RegressionReadinessPanel() {
  return (
    <Panel
      title="Regression Readiness"
      description="What is available now vs later"
      actions={<Badge tone="neutral">not persisted</Badge>}
      bodyClassName="min-h-0 overflow-y-auto p-0"
    >
      <div className="space-y-3 p-4">
        <article className="rounded-xl border border-line bg-white p-4">
          <div className="text-xs font-semibold text-ink">Available now</div>
          <p className="mt-2 text-xs leading-5 text-muted">
            Current-run score, criteria, feedback, evaluator events, runtime evidence counts, and trace navigation.
          </p>
        </article>
        <article className="rounded-xl border border-dashed border-lineStrong bg-panel p-4">
          <div className="text-xs font-semibold text-ink">Requires backend history</div>
          <p className="mt-2 text-xs leading-5 text-muted">
            Score trends, leaderboards, regression datasets, compare-runs, and long-term quality analytics.
          </p>
        </article>
        <div className="grid grid-cols-4 items-end gap-1 rounded-xl border border-line bg-white p-4">
          {[0.35, 0.52, 0.68, 0.9].map((height, index) => (
            <div key={height} className="flex h-24 flex-col justify-end">
              <div
                className={classNames(
                  'rounded-t border border-dashed border-slate-300 bg-slate-100',
                  index === 3 && 'border-teal-200 bg-teal-50',
                )}
                style={{ height: `${height * 100}%` }}
              />
            </div>
          ))}
          <div className="col-span-4 mt-2 text-center font-mono text-[10px] text-muted">
            trend placeholder · no historical API yet
          </div>
        </div>
      </div>
    </Panel>
  );
}

function EvaluationEmptyState({
  run,
  context,
}: {
  run: EvaluationRun;
  context: EvaluationContextSummary;
}) {
  return (
    <Card className="border-dashed border-lineStrong p-8">
      <div className="mx-auto max-w-2xl text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg border border-teal-200 bg-teal-50 text-teal-700">
          <EvaluationIcon className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-base font-semibold text-ink">
          {run.status === 'running' ? 'Evaluation running' : 'No evaluation result yet'}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Run the sales decline demo in Agent Workspace. After the final answer, the evaluator scores
          completeness, accuracy, groundedness, and task completion.
        </p>
        <div className="mx-auto mt-5 grid max-w-xl gap-3 text-left sm:grid-cols-3">
          <MiniMetric label="Answer" value={`${context.answerLength} chars`} />
          <MiniMetric label="Evidence" value={`${context.citationCount} chunks`} />
          <MiniMetric label="Tools" value={`${context.toolCount} calls`} />
        </div>
        <Link to="/agent" className="mt-5 inline-flex">
          <Button variant="primary" size="sm">
            Open Agent Workspace
          </Button>
        </Link>
      </div>
    </Card>
  );
}

function ContextCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-xl border border-line bg-white p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</div>
      <p className="mt-2 line-clamp-4 text-xs leading-5 text-ink">{value}</p>
    </article>
  );
}

function ContextGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map(([label, value]) => (
        <MiniMetric key={label} label={label} value={value} />
      ))}
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</div>
      <div className="mt-1 truncate font-mono text-xs font-semibold text-ink">{value}</div>
    </div>
  );
}

function SmallEmpty({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-[180px] items-center justify-center p-6 text-center">
      <div>
        <div className="text-sm font-semibold text-ink">{title}</div>
        <p className="mt-1 text-xs leading-5 text-muted">{description}</p>
      </div>
    </div>
  );
}

function buildEvaluationRun(events: AgentEvent[]): EvaluationRun {
  const startEvent = [...events].reverse().find((event) => event.type === 'evaluation_start');
  const completeEvent = [...events].reverse().find((event) => event.type === 'evaluation_complete');
  return {
    startEvent,
    completeEvent,
    duration:
      startEvent && completeEvent
        ? Math.max(0, completeEvent.timestamp - startEvent.timestamp)
        : undefined,
    taskId: completeEvent?.taskId ?? startEvent?.taskId,
    status: completeEvent ? 'completed' : startEvent ? 'running' : 'pending',
  };
}

function buildContextSummary(
  messages: Message[],
  tools: ToolCallRecord[],
  citations: CitationRecord[],
  memory: MemoryRecord[],
  events: AgentEvent[],
): EvaluationContextSummary {
  const latestUser = [...messages].reverse().find((message) => message.role === 'user');
  const latestAssistant = [...messages].reverse().find((message) => message.role === 'assistant');
  return {
    task: latestUser?.content ?? 'No current task',
    answerLength: latestAssistant?.content.length ?? 0,
    toolCount: tools.length,
    failedToolCount: tools.filter((tool) => tool.status === 'failed').length,
    citationCount: citations.length,
    memoryCount: memory.length,
    eventCount: events.length,
  };
}

function getScoreTone(score: number): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
  if (score >= 0.8) return 'success';
  if (score >= 0.6) return 'warning';
  return 'danger';
}

function getScoreLabel(score: number): string {
  if (score >= 0.8) return 'Strong';
  if (score >= 0.6) return 'Review';
  return 'Needs work';
}

function formatDuration(duration?: number): string {
  if (duration === undefined) return '-';
  return duration >= 1000 ? `${(duration / 1000).toFixed(1)}s` : `${duration}ms`;
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp));
}

function formatEventType(type: string): string {
  return type
    .split('_')
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}
