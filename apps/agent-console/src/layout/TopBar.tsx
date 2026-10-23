import { useEffect } from 'react';
import { useAgentStore } from '@console/store/agentStore';
import { checkAgentServerHealth } from '@console/services/agent';
import {
  CpuIcon,
  RuntimeIcon,
  ServerIcon,
} from '@console/components/ui';
import {
  getRuntimeEnvironmentLabel,
  useRuntimeModelLabel,
} from '@console/features/agent-console/runtime-overview';

export function TopBar() {
  const status = useAgentStore((state) => state.status);
  const events = useAgentStore((state) => state.events);
  const runtimeState = useAgentStore((state) => state.state);
  const currentStep = runtimeState?.currentStepId;
  const messages = useAgentStore((state) => state.messages);
  const plan = useAgentStore((state) => state.plan);
  const setRuntimeInfo = useAgentStore((state) => state.setRuntimeInfo);
  const modelLabel = useRuntimeModelLabel();

  // Health is fetched once for every page, not only /agent, so the header can
  // tell the truth about mock vs a real model.
  useEffect(() => {
    let active = true;
    checkAgentServerHealth()
      .then((health) => {
        if (active) setRuntimeInfo({ provider: health.provider, model: health.model });
      })
      .catch(() => {
        if (active) setRuntimeInfo({ provider: undefined, model: undefined });
      });
    return () => {
      active = false;
    };
  }, [setRuntimeInfo]);

  const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user');
  const currentTask = latestUserMessage?.content;

  const tokens = events.reduce(
    (sum: number, event: { payload?: unknown }) => sum + readTokenCount(event.payload),
    0,
  );
  const timestamps = events.map((event: { timestamp: number }) => event.timestamp).filter((t: number) => t > 0);
  const duration =
    timestamps.length >= 2 ? Math.max(...timestamps) - Math.min(...timestamps) : undefined;
  const estimatedCost = tokens > 0 ? (tokens / 1000) * 0.002 : undefined;

  return (
    <header className="flex shrink-0 flex-col border-b border-line bg-white">
      {/* Top row */}
      <div className="flex h-10 flex-nowrap items-center justify-between px-3">
        <div className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-hidden">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-900 bg-slate-950 text-white">
              <RuntimeIcon className="h-3 w-3" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold leading-tight text-ink">Agent Studio</div>
              <div className="truncate text-[9px] text-muted">Enterprise Runtime Studio</div>
            </div>
          </div>

          <div className="h-3 w-px bg-line" />

          {/* Selectors */}
          <Selector icon={<RuntimeIcon className="h-2.5 w-2.5" />} label="Workspace" value="Runtime" />
          <Selector icon={<CpuIcon className="h-2.5 w-2.5" />} label="Model" value={modelLabel} />
          <Selector icon={<ServerIcon className="h-2.5 w-2.5" />} label="Environment" value={getRuntimeEnvironmentLabel()} />

          <div className="h-3 w-px bg-line" />

          {/* Status pill */}
          <div className="flex items-center gap-1 rounded-full border border-line bg-panel px-1.5 py-0.5">
            <span className={getStatusDot(status)} />
            <span className="text-[10px] font-semibold text-ink">{getStatusLabel(status)}</span>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-6 items-center rounded-md border border-line bg-panel px-2 font-mono text-[10px] font-semibold text-muted">
            Run from Chat
          </span>
        </div>
      </div>

      {/* Runtime status row */}
      <div className="flex h-5 items-center justify-between border-t border-line bg-slate-50/60 px-3 text-[9px]">
        <div className="flex items-center gap-2 overflow-hidden">
          {status === 'idle' ? (
            <>
              <Metric label="RUNTIME" value="ready" tone="success" />
              <Metric label="TASK" value="waiting for chat input" />
              <Metric label="NEXT" value="plan · tool · rag · memory · answer" />
            </>
          ) : (
            <>
              <Metric label="STATUS" value={status} tone={getStatusTone(status)} />
              <Metric label="TASK" value={currentTask ? truncate(currentTask, 24) : 'running'} />
              <Metric
                label="STEP"
                value={
                  currentStep ??
                  (status === 'success'
                    ? 'answer'
                    : status === 'cancelled'
                      ? 'cancelled'
                      : status === 'error'
                        ? 'failed'
                        : 'planning')
                }
              />
              <Metric label="PROGRESS" value={`${getProgress(plan, runtimeState, status)}%`} />
              {status === 'success' && (
                <>
                  <Metric label="DURATION" value={formatDuration(duration)} />
                  <Metric label="TOKENS" value={tokens > 0 ? tokens.toLocaleString() : '0'} />
                  <Metric label="COST" value={formatCost(estimatedCost)} />
                </>
              )}
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="flex items-center gap-1 text-muted">
            <span className={`h-1.5 w-1.5 rounded-full ${status === 'running' ? 'animate-pulse bg-blue-500' : 'bg-emerald-500'}`} />
            {status === 'running' ? 'SSE Streaming' : 'SSE Endpoint'}
          </span>
          <div className="flex h-5 w-5 items-center justify-center rounded-full border border-line bg-panel text-[9px] font-semibold text-ink">
            RJ
          </div>
        </div>
      </div>
    </header>
  );
}

function Selector({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex h-6 items-center gap-1 rounded-md border border-line bg-panel px-1.5 text-[10px] text-muted">
      <span className="text-muted">{icon}</span>
      <span className="font-medium text-ink">{label}</span>
      <span className="text-muted">·</span>
      <span className="font-mono font-medium text-ink">{value}</span>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'info' | 'warning' | 'danger';
}) {
  const toneClass =
    tone === 'success'
      ? 'text-emerald-600'
      : tone === 'info'
        ? 'text-blue-600'
        : tone === 'warning'
          ? 'text-amber-600'
          : tone === 'danger'
            ? 'text-rose-600'
            : 'text-ink';

  return (
    <div className="flex items-center gap-1.5">
      <span className="font-semibold tracking-wider text-muted">{label}</span>
      <span className={`font-mono font-semibold ${toneClass}`}>{value}</span>
    </div>
  );
}

function getStatusTone(status: string): 'success' | 'info' | 'warning' | 'danger' | 'default' {
  if (status === 'running') return 'info';
  if (status === 'success' || status === 'completed') return 'success';
  if (status === 'error' || status === 'failed') return 'danger';
  if (status === 'cancelled') return 'warning';
  return 'default';
}

function getStatusLabel(status: string): string {
  if (status === 'running') return 'Agent running';
  if (status === 'success') return 'Completed';
  if (status === 'error') return 'Needs attention';
  if (status === 'cancelled') return 'Cancelled';
  return 'Runtime ready';
}

function getStatusDot(status: string): string {
  const tone =
    status === 'running'
      ? 'bg-blue-500 animate-pulse'
      : status === 'success'
        ? 'bg-emerald-500'
        : status === 'error'
          ? 'bg-rose-500'
          : status === 'cancelled'
            ? 'bg-amber-500'
            : 'bg-emerald-500';
  return `h-1 w-1 rounded-full ${tone}`;
}

function getProgress(
  plan: { steps: Array<{ status: string }> } | null,
  state: { completedStepIds: string[] } | undefined,
  status: string,
): number {
  // Single source of truth: completed plan steps, not the names of events.
  if (plan?.steps.length) {
    const completed = state?.completedStepIds.length
      ? state.completedStepIds.length
      : plan.steps.filter((step) => step.status === 'success').length;
    return Math.min(100, Math.round((completed / plan.steps.length) * 100));
  }
  return status === 'success' ? 100 : 0;
}

function formatDuration(duration?: number): string {
  if (duration === undefined) return '—';
  if (duration < 1000) return `${duration}ms`;
  return `${(duration / 1000).toFixed(1)}s`;
}

function formatCost(value?: number): string {
  if (value === undefined) return '$0.0000';
  return `$${value.toFixed(4)}`;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function readTokenCount(payload: unknown): number {
  if (!payload || typeof payload !== 'object') return 0;
  const record = payload as Record<string, unknown>;
  const usage = record.usage;
  if (usage && typeof usage === 'object') {
    const usageRecord = usage as Record<string, unknown>;
    const total = usageRecord.total_tokens ?? usageRecord.totalTokens;
    return typeof total === 'number' ? total : 0;
  }
  const tokenCount = record.tokenCount ?? record.tokens;
  return typeof tokenCount === 'number' ? tokenCount : 0;
}
