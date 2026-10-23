import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  ChevronRightIcon,
  Panel,
  RefreshIcon,
  Skeleton,
  StatusTag,
} from '@console/components/ui';
import {
  buildRuntimeOverview,
  getRuntimeEnvironmentLabel,
  useRuntimeModelLabel,
} from '@console/features/agent-console/runtime-overview';
import {
  listAgentTasks,
  retryAgentTask,
  type AgentTaskStatusResponse,
} from '@console/services/agent';
import { useAgentStore } from '@console/store/agentStore';

const demoTask = '分析华东销售下降原因，并生成报告';

export function Dashboard() {
  const [tasks, setTasks] = useState<AgentTaskStatusResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [retryingTaskId, setRetryingTaskId] = useState<string>();

  const status = useAgentStore((state) => state.status);
  const messages = useAgentStore((state) => state.messages);
  const events = useAgentStore((state) => state.events);
  const plan = useAgentStore((state) => state.plan);
  const tools = useAgentStore((state) => state.tools);
  const citations = useAgentStore((state) => state.citations);
  const memory = useAgentStore((state) => state.memory);
  const evaluation = useAgentStore((state) => state.evaluation);
  const runtimeState = useAgentStore((state) => state.state);
  const modelLabel = useRuntimeModelLabel();

  const runtimeOverview = useMemo(
    () =>
      buildRuntimeOverview({
        messages,
        events,
        plan,
        tools,
        citations,
        memory,
        evaluation,
        state: runtimeState,
        status,
        modelLabel,
      }),
    [citations, evaluation, events, memory, messages, modelLabel, plan, runtimeState, status, tools],
  );

  const refresh = useCallback(async () => {
    setError(undefined);
    setLoading(true);
    try {
      setTasks(await listAgentTasks());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load runtime task history.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const summary = useMemo(() => summarizeTasks(tasks), [tasks]);
  const failures = useMemo(
    () => tasks.filter((task) => task.status === 'failed' || task.status === 'cancelled').slice(0, 5),
    [tasks],
  );

  async function handleRetry(taskId: string) {
    setRetryingTaskId(taskId);
    setError(undefined);
    try {
      await retryAgentTask(taskId);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to retry this task.');
    } finally {
      setRetryingTaskId(undefined);
    }
  }

  return (
    <section className="h-full overflow-y-auto bg-[var(--studio-bg)]">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-5 p-6 lg:p-8">
        <RuntimeOverviewHeader
          status={status}
          error={error}
          onRefresh={() => {
            void refresh();
          }}
        />

        {error && (
          <Card className="border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{error}</span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  void refresh();
                }}
              >
                Retry loading
              </Button>
            </div>
          </Card>
        )}

        {loading ? (
          <DashboardSkeleton />
        ) : tasks.length === 0 ? (
          <DashboardEmptyState />
        ) : (
          <>
            <CurrentRuntimeSpotlight overview={runtimeOverview} />
            <RuntimeMetricStrip summary={summary} />

            <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.7fr)]">
              <RecentTasksPanel tasks={tasks} />
              <FailureReviewPanel
                tasks={failures}
                retryingTaskId={retryingTaskId}
                onRetry={(taskId) => {
                  void handleRetry(taskId);
                }}
              />
            </div>

            <RuntimeSignalsPanel overview={runtimeOverview} />
          </>
        )}

        <p className="px-1 text-[10px] text-muted">
          Dashboard is an operational overview. Agent Workspace remains the primary runtime surface.
        </p>
      </div>
    </section>
  );
}

function RuntimeOverviewHeader({
  status,
  error,
  onRefresh,
}: {
  status: string;
  error?: string;
  onRefresh: () => void;
}) {
  const modelLabel = useRuntimeModelLabel();

  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
            Run History
          </div>
          <Badge tone={error ? 'danger' : 'success'}>{error ? 'Disconnected' : 'Connected'}</Badge>
        </div>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-ink">Runs</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Review persisted runs, failures, and the current live session before opening a run.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[10px] text-muted">
          <span>{getRuntimeEnvironmentLabel()}</span>
          <span className="text-lineStrong">·</span>
          <span>{modelLabel}</span>
          <span className="text-lineStrong">·</span>
          <span>runtime {status}</span>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={onRefresh} title="Refresh task history">
          <RefreshIcon className="h-3.5 w-3.5" />
          Refresh
        </Button>
        <Link to="/agent">
          <Button size="sm" variant="primary">
            Open Agent Workspace
          </Button>
        </Link>
      </div>
    </header>
  );
}

function CurrentRuntimeSpotlight({
  overview,
}: {
  overview: ReturnType<typeof buildRuntimeOverview>;
}) {
  const isRunning = overview.status === 'running';
  const title = isRunning ? 'Agent is currently running' : 'Ready for the next runtime task';
  const taskLabel = isRunning ? overview.taskLabel : 'No running task';

  return (
    <Card className="overflow-hidden border-blue-100">
      <div className="flex flex-wrap items-start justify-between gap-4 bg-blue-50/50 px-4 py-4 lg:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${isRunning ? 'animate-pulse bg-blue-600' : 'bg-emerald-500'}`} />
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-700">
              Current Runtime
            </div>
            <StatusTag status={isRunning ? 'running' : overview.status === 'error' ? 'failed' : 'ready'} />
          </div>
          <h2 className="mt-2 text-base font-semibold text-ink">{title}</h2>
          <p className="mt-1 max-w-3xl truncate text-sm text-muted">{taskLabel}</p>
        </div>
        <Link to="/agent">
          <Button size="sm" variant="secondary">
            {isRunning ? 'Continue in Workspace' : 'Start a Task'}
            <ChevronRightIcon className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 border-t border-line bg-white px-4 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center lg:px-5">
        <div>
          <div className="flex items-center justify-between gap-3 text-[10px] text-muted">
            <span>Progress</span>
            <span className="font-mono font-semibold text-ink">{overview.progress}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <motion.div
              className="h-full rounded-full bg-blue-600"
              initial={{ width: 0 }}
              animate={{ width: `${overview.progress}%` }}
              transition={{ duration: 0.35 }}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-3">
          <RuntimeContextValue label="Current step" value={overview.currentStep} />
          <RuntimeContextValue label="Tool" value={overview.currentTool} />
          <RuntimeContextValue label="Session events" value={String(overview.eventCount)} />
        </div>
      </div>
    </Card>
  );
}

function RuntimeMetricStrip({
  summary,
}: {
  summary: DashboardSummary;
}) {
  const metrics = [
    { label: 'Total tasks', value: summary.total, detail: 'history', tone: 'neutral' as const },
    { label: 'Completed', value: summary.completed, detail: 'successful runs', tone: 'success' as const },
    { label: 'Failed / cancelled', value: summary.failed + summary.cancelled, detail: 'needs review', tone: summary.failed + summary.cancelled ? 'danger' as const : 'neutral' as const },
    { label: 'Running', value: summary.running + summary.queued, detail: 'active queue', tone: summary.running + summary.queued ? 'info' as const : 'neutral' as const },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <Card key={metric.label} className="min-h-[126px] p-5">
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

function RecentTasksPanel({ tasks }: { tasks: AgentTaskStatusResponse[] }) {
  return (
    <Panel
      title="Recent Tasks"
      description="Task history from the Agent Runtime Server"
      actions={<Badge>{tasks.length} runs</Badge>}
      className="min-h-[360px]"
      bodyClassName="min-h-0 overflow-hidden p-0"
    >
      <div className="h-full min-h-0 overflow-y-auto">
        <AnimatePresence initial={false}>
          {tasks.slice(0, 12).map((task) => (
            <motion.div
              key={task.taskId}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="border-b border-line last:border-b-0"
            >
              <Link
                to={`/runs/${task.taskId}`}
                className="group flex min-w-0 items-center gap-3 px-4 py-3 transition-colors duration-200 hover:bg-panel focus:bg-panel focus:outline-none lg:px-5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="truncate text-xs font-semibold text-ink">
                      {task.taskId}
                    </span>
                    <StatusTag status={task.status} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[10px] text-muted">
                    <span>{formatTaskTime(task.createdAt)}</span>
                    <span>progress {task.progress}%</span>
                    <span>retry {task.retryCount}/{task.maxRetry}</span>
                    {task.currentStep && <span>step {task.currentStep}</span>}
                    {task.provider ? (
                      <span>
                        {task.provider === 'mock' ? 'mock' : `${task.provider}${task.model ? ` · ${task.model}` : ''}`}
                      </span>
                    ) : null}
                  </div>
                  {task.lastError && (
                    <p className="mt-1 truncate text-[10px] text-rose-700">{task.lastError}</p>
                  )}
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${task.status === 'failed' ? 'bg-rose-500' : task.status === 'cancelled' ? 'bg-amber-500' : 'bg-blue-600'}`}
                      style={{ width: `${clampProgress(task.progress)}%` }}
                    />
                  </div>
                </div>
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-300 transition-colors duration-200 group-hover:text-blue-600" />
              </Link>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Panel>
  );
}

function FailureReviewPanel({
  tasks,
  retryingTaskId,
  onRetry,
}: {
  tasks: AgentTaskStatusResponse[];
  retryingTaskId?: string;
  onRetry: (taskId: string) => void;
}) {
  return (
    <Panel
      title="Failure Review"
      description="Failed and cancelled runs"
      actions={<Badge tone={tasks.length ? 'danger' : 'success'}>{tasks.length}</Badge>}
      className="min-h-[360px]"
      bodyClassName="min-h-0 overflow-hidden p-0"
    >
      {tasks.length === 0 ? (
        <div className="flex h-full min-h-[300px] items-center justify-center p-6 text-center">
          <div>
            <div className="text-sm font-semibold text-ink">No recent failures</div>
            <p className="mt-1 text-xs leading-5 text-muted">
              Runtime errors and cancelled tasks will appear here for review.
            </p>
          </div>
        </div>
      ) : (
        <div className="h-full min-h-0 overflow-y-auto">
          {tasks.map((task) => {
            const canRetry = task.retryCount < task.maxRetry;
            return (
              <div key={task.taskId} className="border-b border-line p-4 last:border-b-0 lg:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-ink">{task.taskId}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <StatusTag status={task.status} />
                      <span className="font-mono text-[10px] text-muted">
                        {formatTaskTime(task.createdAt)}
                      </span>
                    </div>
                  </div>
                  <Link
                    to={`/runs/${task.taskId}`}
                    className="text-[10px] font-semibold text-blue-700 hover:underline"
                  >
                    Open run
                  </Link>
                </div>
                <p className="mt-3 line-clamp-3 text-xs leading-5 text-rose-700">
                  {task.lastError ?? 'Task ended without a recorded error message.'}
                </p>
                <div className="mt-3 flex items-center justify-between gap-3 text-[10px] text-muted">
                  <span>
                    retry {task.retryCount}/{task.maxRetry}
                  </span>
                  {canRetry ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8 px-2 text-[10px]"
                      disabled={retryingTaskId === task.taskId}
                      onClick={() => onRetry(task.taskId)}
                    >
                      {retryingTaskId === task.taskId ? 'Retrying…' : 'Retry task'}
                    </Button>
                  ) : (
                    <span className="font-medium text-muted">Retry limit reached</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function RuntimeSignalsPanel({
  overview,
}: {
  overview: ReturnType<typeof buildRuntimeOverview>;
}) {
  const signals = [
    { label: 'Events', value: overview.eventCount, detail: 'current session', tone: 'info' as const },
    { label: 'Tool calls', value: overview.toolCount, detail: 'current session', tone: 'success' as const },
    { label: 'Knowledge', value: overview.citationCount, detail: 'retrieved chunks', tone: 'warning' as const },
    { label: 'Memory', value: overview.memoryCount, detail: 'writes in session', tone: 'info' as const },
    {
      label: 'Evaluation',
      value: overview.evaluationScore === undefined ? 'Pending' : `${Math.round(overview.evaluationScore * 100)}%`,
      detail: 'current session',
      tone: overview.evaluationScore === undefined ? 'neutral' as const : 'success' as const,
    },
  ];

  return (
    <Panel
      title="Runtime Signals"
      description="Current session only · not historical aggregation"
      actions={
        <span className="hidden shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-muted sm:inline">
          live projection
        </span>
      }
    >
      <div className="p-6 lg:p-7">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {signals.map((signal) => (
            <div key={signal.label} className="min-h-[144px] rounded-lg border border-line bg-panel p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
                  {signal.label}
                </span>
                <span className={`h-1.5 w-1.5 rounded-full ${signal.tone === 'warning' ? 'bg-amber-500' : signal.tone === 'success' ? 'bg-emerald-500' : signal.tone === 'info' ? 'bg-blue-500' : 'bg-slate-300'}`} />
              </div>
              <div className="mt-3 font-mono text-xl font-semibold text-ink">{signal.value}</div>
              <div className="mt-1.5 text-[10px] text-muted">{signal.detail}</div>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton variant="card" lines={3} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} variant="card" lines={1} />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.7fr)]">
        <Skeleton variant="timeline" lines={5} />
        <Skeleton variant="card" lines={5} />
      </div>
    </div>
  );
}

function DashboardEmptyState() {
  return (
    <Card className="border-dashed border-lineStrong p-8">
      <div className="mx-auto max-w-xl text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-700">
          <span className="h-2 w-2 animate-pulse rounded-full bg-current" />
        </div>
        <h2 className="mt-4 text-base font-semibold text-ink">No runtime tasks yet</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Run the sales decline demo to create the first trace, then inspect it from Agent Workspace.
        </p>
        <Link to="/agent" className="mt-5 inline-flex">
          <Button variant="primary" size="sm">
            Open Agent Workspace
          </Button>
        </Link>
        <div className="mt-4 font-mono text-[10px] text-muted">{demoTask}</div>
      </div>
    </Card>
  );
}

function RuntimeContextValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] text-muted">{label}</div>
      <div className="mt-0.5 max-w-[180px] truncate font-mono text-[11px] font-semibold text-ink">
        {value}
      </div>
    </div>
  );
}

interface DashboardSummary {
  total: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
}

function summarizeTasks(tasks: AgentTaskStatusResponse[]): DashboardSummary {
  return tasks.reduce<DashboardSummary>(
    (summary, task) => {
      summary.total += 1;
      summary[task.status] += 1;
      return summary;
    },
    {
      total: 0,
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    },
  );
}

function formatTaskTime(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function clampProgress(value: number): number {
  return Math.min(100, Math.max(0, value));
}
