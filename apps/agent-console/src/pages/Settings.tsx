import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  ChevronRightIcon,
  JsonViewer,
  Panel,
  RuntimeIcon,
  StatusTag,
} from '@console/components/ui';
import { classNames } from '@console/components/ui/classNames';
import {
  getRuntimeEnvironmentLabel,
  useRuntimeModelLabel,
} from '@console/features/agent-console/runtime-overview';
import { checkAgentServerHealth, getAgentServerURL } from '@console/services/agent';
import { useAgentStore } from '@console/store/agentStore';

interface ReadinessItem {
  label: string;
  status: 'available' | 'partial' | 'planned';
  description: string;
}

interface RuntimeHealthState {
  status: 'checking' | 'healthy' | 'unhealthy' | 'unavailable';
  latencyMs?: number;
  checkedAt?: number;
  message?: string;
}

const sseEvents = [
  'task_created',
  'plan_start',
  'plan_update',
  'tool_start',
  'tool_success',
  'tool_error',
  'permission_denied',
  'tool_blocked',
  'approval_required',
  'rag_retrieve',
  'reflection',
  'memory_update',
  'evaluation_start',
  'evaluation_complete',
  'state_update',
  'final_answer',
  'task_cancelled',
  'task_retry',
  'task_failed',
  'task_complete',
];

const readiness: ReadinessItem[] = [
  {
    label: 'Runtime Server',
    status: 'available',
    description: 'Task creation, task status, retry, cancel, and SSE streaming are wired.',
  },
  {
    label: 'Observability',
    status: 'partial',
    description: 'Frontend RuntimeObject, trace timeline, evaluation, and logs exist. Persistent tracing backend is future work.',
  },
  {
    label: 'Knowledge',
    status: 'partial',
    description: 'Current-session RAG evidence is inspectable. Document ingestion and vector index management are future work.',
  },
  {
    label: 'Memory',
    status: 'partial',
    description: 'Current-session memory writes are inspectable. Persistent memory database and cross-task graph are future work.',
  },
  {
    label: 'Evaluation',
    status: 'partial',
    description: 'Current-run scorecard exists. Datasets, history, regression suites, and compare-runs are future work.',
  },
  {
    label: 'Workflow Builder',
    status: 'partial',
    description: 'Read-only Planner graph exists. Drag editing, versioning, and deployment are future work.',
  },
  {
    label: 'RBAC / SSO',
    status: 'planned',
    description: 'No identity provider, roles, teams, or permission model is implemented yet.',
  },
  {
    label: 'Audit',
    status: 'planned',
    description: 'Runtime events are visible in session. Tamper-resistant audit logs are future work.',
  },
  {
    label: 'Deployment',
    status: 'planned',
    description: 'No deployment pipeline, environment promotion, or model provider management UI is implemented yet.',
  },
];

export function Settings() {
  const status = useAgentStore((state) => state.status);
  const events = useAgentStore((state) => state.events);
  const tools = useAgentStore((state) => state.tools);
  const citations = useAgentStore((state) => state.citations);
  const memory = useAgentStore((state) => state.memory);
  const evaluation = useAgentStore((state) => state.evaluation);
  const serverUrl = getSafeAgentServerURL();
  const envLabel = getRuntimeEnvironmentLabel();
  const modelLabel = useRuntimeModelLabel();
  const [health, setHealth] = useState<RuntimeHealthState>({ status: 'checking' });
  const refreshHealth = useCallback(async () => {
    if (serverUrl === 'not configured') {
      setHealth({ status: 'unavailable', message: 'VITE_AGENT_SERVER_URL is not configured.' });
      return;
    }

    setHealth({ status: 'checking' });
    const startedAt = performance.now();

    try {
      const response = await checkAgentServerHealth();
      setHealth({
        status: response.status === 'ok' ? 'healthy' : 'unhealthy',
        latencyMs: Math.round(performance.now() - startedAt),
        checkedAt: Date.now(),
        message: response.status === 'ok' ? undefined : `Unexpected status: ${response.status}`,
      });
    } catch (error) {
      setHealth({
        status: 'unhealthy',
        latencyMs: Math.round(performance.now() - startedAt),
        checkedAt: Date.now(),
        message: error instanceof Error ? error.message : 'Health check failed.',
      });
    }
  }, [serverUrl]);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

  return (
    <section className="h-full overflow-y-auto bg-[var(--studio-bg)]">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-4 p-4 lg:p-6">
        <SettingsHeader serverUrl={serverUrl} />

        <SettingsMetricStrip
          status={status}
          serverUrl={serverUrl}
          envLabel={envLabel}
          modelLabel={modelLabel}
        />
        <RuntimeHealthPanel
          health={health}
          serverUrl={serverUrl}
          onRefresh={() => void refreshHealth()}
        />

        <div className="grid min-h-[690px] min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="grid min-h-0 gap-4 xl:grid-rows-[300px_minmax(0,1fr)]">
            <RuntimeConnectionPanel
              serverUrl={serverUrl}
              envLabel={envLabel}
              modelLabel={modelLabel}
            />
            <SseContractPanel />
          </div>

          <div className="grid min-h-0 gap-4 xl:grid-rows-[minmax(0,1fr)_300px]">
            <EnterpriseReadinessPanel />
            <SessionSignalsPanel
              status={status}
              events={events.length}
              tools={tools.length}
              citations={citations.length}
              memory={memory.length}
              evaluationReady={Boolean(evaluation)}
            />
          </div>
        </div>

        <SecurityBoundaryPanel />
      </div>
    </section>
  );
}

function RuntimeHealthPanel({
  health,
  serverUrl,
  onRefresh,
}: {
  health: RuntimeHealthState;
  serverUrl: string;
  onRefresh: () => void;
}) {
  const tone =
    health.status === 'healthy'
      ? 'success'
      : health.status === 'unhealthy'
        ? 'danger'
        : health.status === 'checking'
          ? 'info'
          : 'neutral';

  return (
    <Panel
      title="Runtime Health"
      description="Live connectivity check against the Agent Server"
      actions={
        <Button size="sm" variant="secondary" onClick={onRefresh} disabled={health.status === 'checking'}>
          {health.status === 'checking' ? 'Checking' : 'Check again'}
        </Button>
      }
      bodyClassName="p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Badge tone={tone}>{health.status}</Badge>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-ink">
              {health.status === 'healthy'
                ? 'Agent Server is reachable'
                : health.status === 'checking'
                  ? 'Checking Agent Server'
                  : health.status === 'unavailable'
                    ? 'Agent Server is not configured'
                    : 'Agent Server is unavailable'}
            </div>
            <div className="mt-1 truncate font-mono text-[10px] text-muted">
              {health.message ?? `${serverUrl}/health`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 font-mono text-[10px] text-muted">
          <span>latency {health.latencyMs === undefined ? '-' : `${health.latencyMs}ms`}</span>
          <span>
            checked {health.checkedAt ? new Date(health.checkedAt).toLocaleTimeString() : '-'}
          </span>
        </div>
      </div>
    </Panel>
  );
}

function SettingsHeader({ serverUrl }: { serverUrl: string }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
            Workspace Boundary
          </div>
          <Badge tone={serverUrl === 'not configured' ? 'danger' : 'info'}>readiness view</Badge>
        </div>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-ink">About & Limits</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Inspect runtime connection, environment configuration, SSE contract, and enterprise readiness boundaries.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[10px] text-muted">
          <span>configuration is read-only in this phase</span>
          <span className="text-lineStrong">·</span>
          <span>no RBAC/SSO backend yet</span>
          <span className="text-lineStrong">·</span>
          <span>{serverUrl}</span>
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

function SettingsMetricStrip({
  status,
  serverUrl,
  envLabel,
  modelLabel,
}: {
  status: string;
  serverUrl: string;
  envLabel: string;
  modelLabel: string;
}) {
  const metrics = [
    { label: 'Runtime status', value: status, detail: 'console store', tone: status === 'running' ? 'info' as const : 'neutral' as const },
    { label: 'Server URL', value: compactUrl(serverUrl), detail: serverUrl === 'not configured' ? 'missing' : 'configured', tone: serverUrl === 'not configured' ? 'danger' as const : 'success' as const },
    { label: 'Environment', value: envLabel, detail: 'vite env', tone: 'info' as const },
    { label: 'Model', value: modelLabel, detail: 'runtime label', tone: 'neutral' as const },
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
          <div className="mt-3 truncate font-mono text-lg font-semibold tracking-tight text-ink">
            {metric.value}
          </div>
        </Card>
      ))}
    </div>
  );
}

function RuntimeConnectionPanel({
  serverUrl,
  envLabel,
  modelLabel,
}: {
  serverUrl: string;
  envLabel: string;
  modelLabel: string;
}) {
  const rows = [
    ['Agent Server', serverUrl],
    ['Environment', envLabel],
    ['Model', modelLabel],
    ['Task API', '/api/agent/tasks'],
    ['SSE API', '/api/agent/tasks/:taskId/events'],
    ['Retry API', '/api/agent/tasks/:taskId/retry'],
    ['Cancel API', '/api/agent/tasks/:taskId/cancel'],
  ];

  return (
    <Panel
      title="Runtime Connection"
      description="Frontend-to-runtime server contract"
      actions={<StatusTag status={serverUrl === 'not configured' ? 'failed' : 'configured'} />}
      bodyClassName="min-h-0 overflow-y-auto p-0"
    >
      <div className="grid gap-3 p-4 md:grid-cols-[220px_minmax(0,1fr)]">
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
          <RuntimeIcon className="h-5 w-5 text-blue-700" />
          <h2 className="mt-3 text-sm font-semibold text-ink">Runtime Server</h2>
          <p className="mt-2 text-xs leading-5 text-muted">
            The console talks to the Agent Runtime through a Node HTTP server and SSE events.
          </p>
        </div>
        <div className="rounded-xl border border-line bg-white p-4">
          <dl className="space-y-2 text-xs">
            {rows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3 border-t border-line pt-2 first:border-t-0 first:pt-0">
                <dt className="text-muted">{label}</dt>
                <dd className="max-w-[360px] truncate text-right font-mono text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </Panel>
  );
}

function SseContractPanel() {
  return (
    <Panel
      title="SSE Contract"
      description="Event types supported by the console"
      actions={<Badge>{sseEvents.length} events</Badge>}
      bodyClassName="min-h-0 overflow-hidden p-0"
    >
      <div className="grid h-full min-h-0 gap-0 md:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-h-0 overflow-y-auto p-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sseEvents.map((event) => (
              <div key={event} className="rounded-lg border border-line bg-white px-3 py-2">
                <div className="font-mono text-[11px] font-semibold text-ink">{event}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="min-h-0 border-t border-line bg-white p-4 md:border-l md:border-t-0">
          <JsonViewer
            title="Event Shape"
            value={{
              id: 'evt_xxx',
              taskId: 'task_xxx',
              type: 'tool_success',
              timestamp: Date.now(),
              payload: {
                toolName: 'querySalesData',
                result: { duration: 320, data: {} },
              },
            }}
          />
        </div>
      </div>
    </Panel>
  );
}

function EnterpriseReadinessPanel() {
  return (
    <Panel
      title="Enterprise Readiness"
      description="Honest platform capability matrix"
      actions={<Badge tone="warning">Phase 8</Badge>}
      bodyClassName="min-h-0 overflow-y-auto p-0"
    >
      <div className="divide-y divide-line">
        {readiness.map((item) => (
          <article key={item.label} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-ink">{item.label}</div>
                <p className="mt-1 text-xs leading-5 text-muted">{item.description}</p>
              </div>
              <Badge tone={getReadinessTone(item.status)}>{item.status}</Badge>
            </div>
          </article>
        ))}
      </div>
    </Panel>
  );
}

function SessionSignalsPanel({
  status,
  events,
  tools,
  citations,
  memory,
  evaluationReady,
}: {
  status: string;
  events: number;
  tools: number;
  citations: number;
  memory: number;
  evaluationReady: boolean;
}) {
  const signals = [
    ['Runtime', status],
    ['Events', `${events}`],
    ['Tools', `${tools}`],
    ['Knowledge', `${citations}`],
    ['Memory', `${memory}`],
    ['Evaluation', evaluationReady ? 'ready' : 'pending'],
  ];

  return (
    <Panel
      title="Current Session Signals"
      description="What the console can inspect right now"
      actions={<Badge>{events} events</Badge>}
      bodyClassName="min-h-0 overflow-y-auto p-0"
    >
      <div className="grid grid-cols-2 gap-3 p-4">
        {signals.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-line bg-white p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
              {label}
            </div>
            <div className="mt-1 truncate font-mono text-xs font-semibold text-ink">{value}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function SecurityBoundaryPanel() {
  const boundaries = [
    {
      title: 'Available',
      items: ['Runtime task lifecycle', 'SSE event contract', 'Retry and cancel API', 'Frontend observability surfaces'],
      tone: 'success' as const,
    },
    {
      title: 'Not implemented yet',
      items: ['Identity provider', 'RBAC policy engine', 'SSO', 'Audit log persistence', 'Secret management UI'],
      tone: 'warning' as const,
    },
    {
      title: 'Enterprise next step',
      items: ['Workspace model', 'Team roles', 'API key management', 'Deployment environments', 'Production monitoring'],
      tone: 'info' as const,
    },
  ];

  return (
    <Panel
      title="Security Boundary"
      description="What can be claimed today without overpromising"
      actions={<Badge tone="neutral">transparent scope</Badge>}
      bodyClassName="p-0"
    >
      <div className="grid gap-4 p-4 lg:grid-cols-3">
        {boundaries.map((group) => (
          <article key={group.title} className="rounded-xl border border-line bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-ink">{group.title}</h2>
              <Badge tone={group.tone}>{group.items.length}</Badge>
            </div>
            <ul className="mt-3 space-y-2">
              {group.items.map((item) => (
                <li key={item} className="flex gap-2 text-xs leading-5 text-muted">
                  <span
                    className={classNames(
                      'mt-2 h-1.5 w-1.5 shrink-0 rounded-full',
                      group.tone === 'success' && 'bg-emerald-500',
                      group.tone === 'warning' && 'bg-amber-500',
                      group.tone === 'info' && 'bg-blue-500',
                    )}
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </Panel>
  );
}

function getSafeAgentServerURL(): string {
  try {
    return getAgentServerURL();
  } catch {
    return 'not configured';
  }
}

function compactUrl(value: string): string {
  if (value.length <= 26) return value;
  return `${value.slice(0, 18)}...${value.slice(-8)}`;
}

function getReadinessTone(status: ReadinessItem['status']): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
  if (status === 'available') return 'success';
  if (status === 'partial') return 'warning';
  return 'neutral';
}
