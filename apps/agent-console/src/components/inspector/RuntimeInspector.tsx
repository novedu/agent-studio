import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { Accordion, Badge, Card, JsonViewer } from '../ui';
import { getKindLabel, getStatusTone } from '../execution/execution-model';
import { EvaluationDashboard } from './EvaluationDashboard';
import { KnowledgeExplorer } from './KnowledgeExplorer';
import { MemoryExplorer } from './MemoryExplorer';
import { RuntimeLogs } from './RuntimeLogs';
import { lazy, Suspense } from 'react';

// The chart pulls in ECharts. Loading it lazily keeps the runtime console's
// first paint free of the chart bundle; the panel streams in right after.
const EventRateChart = lazy(() =>
  import('../../features/metrics/EventRateChart').then(module => ({
    default: module.EventRateChart,
  })),
);
import { TraceExplorer } from './TraceExplorer';
import type { RuntimeInspectorProps } from './inspector-types';

export function RuntimeInspector({
  currentNode,
  nodes,
  events,
  plan,
  state,
  memory,
  citations,
  evaluation,
  status,
  isLoading,
  runtimeOverview,
  runtimeObjects,
  focusedObject,
  focusSection,
  highlightedCitationId,
  highlightedMemoryId,
  highlightedTraceId,
  onMemorySelect,
  onEvaluationTrace,
  onCitationSelect,
  onTraceSelect,
}: RuntimeInspectorProps) {
  const runtimeNode = focusedObject?.type === 'node' ? focusedObject.node : currentNode;
  const runtimeObject = runtimeObjects.find((object) => object.id === runtimeNode?.id);
  const focusType = focusedObject?.type ?? runtimeObject?.type;
  const defaultOpen = getDefaultOpenSection(focusType, focusSection);
  const runtimeMetrics = readRuntimeMetrics(events);

  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden rounded-none border-0 bg-white shadow-none">
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-line bg-white px-3">
        <div className="min-w-0">
          <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted">
            {runtimeObject ? 'Runtime Inspector' : 'Runtime Overview'}
          </div>
          <h2 className="mt-0.5 truncate text-sm font-semibold leading-4 text-ink">
            {runtimeObject ? runtimeObject.title : 'System Status'}
          </h2>
        </div>
        <Badge tone={status === 'error' ? 'danger' : status === 'running' ? 'info' : 'neutral'} className="text-[10px] px-1.5 py-0.5">
          {status}
        </Badge>
      </header>

      <section className="shrink-0 border-b border-line bg-white px-3 pb-2 pt-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted">
            Runtime Telemetry
          </span>
          <span className="text-[9px] text-muted">last 60s</span>
        </div>
        <Suspense fallback={<div className="mt-1 h-16 w-full animate-pulse rounded bg-slate-100" />}>
          <EventRateChart compact />
        </Suspense>
      </section>

      <motion.div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      >
        {runtimeObject ? (
          <RuntimeObjectInspector
            object={runtimeObject}
            nodeCount={nodes.length}
            defaultOpen={defaultOpen}
            events={events}
            plan={plan}
            state={state}
            memory={memory}
            citations={citations}
            evaluation={evaluation}
            isLoading={isLoading}
            runtimeTokens={runtimeMetrics.tokens}
            runtimeCost={runtimeMetrics.cost}
            highlightedCitationId={highlightedCitationId}
            highlightedMemoryId={highlightedMemoryId}
            highlightedTraceId={highlightedTraceId}
            onMemorySelect={onMemorySelect}
            onEvaluationTrace={onEvaluationTrace}
            onCitationSelect={onCitationSelect}
            onTraceSelect={onTraceSelect}
          />
        ) : (
          <EmptyInspector runtimeOverview={runtimeOverview} />
        )}
      </motion.div>

      <footer className="shrink-0 border-t border-line bg-white px-3 py-1.5 text-[9px] text-muted">
        Focus mode · click a node or span to inspect it
      </footer>
    </Card>
  );
}

interface RuntimeObjectInspectorProps {
  object: RuntimeInspectorProps['runtimeObjects'][number];
  nodeCount: number;
  defaultOpen: string;
  events: RuntimeInspectorProps['events'];
  plan: RuntimeInspectorProps['plan'];
  state: RuntimeInspectorProps['state'];
  memory: RuntimeInspectorProps['memory'];
  citations: RuntimeInspectorProps['citations'];
  evaluation: RuntimeInspectorProps['evaluation'];
  isLoading: boolean;
  runtimeTokens?: number;
  runtimeCost?: number;
  highlightedCitationId?: string;
  highlightedMemoryId?: string;
  highlightedTraceId?: string;
  onMemorySelect?: RuntimeInspectorProps['onMemorySelect'];
  onEvaluationTrace?: RuntimeInspectorProps['onEvaluationTrace'];
  onCitationSelect?: RuntimeInspectorProps['onCitationSelect'];
  onTraceSelect?: RuntimeInspectorProps['onTraceSelect'];
}

function RuntimeObjectInspector({
  object,
  nodeCount,
  defaultOpen,
  events,
  plan,
  state,
  memory,
  citations,
  evaluation,
  isLoading,
  runtimeTokens,
  runtimeCost,
  highlightedCitationId,
  highlightedMemoryId,
  highlightedTraceId,
  onMemorySelect,
  onEvaluationTrace,
  onCitationSelect,
  onTraceSelect,
}: RuntimeObjectInspectorProps) {
  const sections = buildObjectSections({
    object,
    events,
    plan,
    state,
    memory,
    citations,
    evaluation,
    isLoading,
    runtimeTokens,
    runtimeCost,
    highlightedCitationId,
    highlightedMemoryId,
    highlightedTraceId,
    onMemorySelect,
    onEvaluationTrace,
    onCitationSelect,
    onTraceSelect,
  });

  return (
    <div className="p-4">
      <section className="border-b border-line pb-4">
        <header className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-ink">{object.title}</div>
            <div className="mt-0.5 text-[10px] text-muted">
              {getKindLabel(object.sourceNode.kind)} · runtime object
            </div>
          </div>
          <Badge tone={getStatusTone(object.status)}>{object.status}</Badge>
        </header>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Metric label="Duration" value={formatDuration(object.duration)} />
          <Metric label="Token" value={String(object.tokenCount ?? 0)} />
          <Metric label="Retry" value={String(object.retryCount ?? 0)} />
          <Metric label="Lifecycle" value={object.lifecycle} />
          <Metric label="Span" value={shortId(object.spanId)} />
          <Metric label="Objects" value={`${nodeCount}`} />
        </div>
      </section>

      <div className="mt-4">
        <Accordion
          defaultOpenId={defaultOpen}
          focusId={defaultOpen}
          variant="flush"
          items={sections}
        />
      </div>
    </div>
  );
}

function buildObjectSections({
  object,
  events,
  plan,
  state,
  memory,
  citations,
  evaluation,
  isLoading,
  runtimeTokens,
  runtimeCost,
  highlightedCitationId,
  highlightedMemoryId,
  highlightedTraceId,
  onMemorySelect,
  onEvaluationTrace,
  onCitationSelect,
  onTraceSelect,
}: Omit<RuntimeObjectInspectorProps, 'nodeCount' | 'defaultOpen'>) {
  const sharedTraceSection = {
    id: 'trace',
    title: 'Trace Spans',
    meta: <Badge>{events.length} spans</Badge>,
    children: (
      <TraceExplorer
        events={events}
        isLoading={isLoading}
        highlightedTraceId={highlightedTraceId}
        onSelectEvent={onTraceSelect}
      />
    ),
  };
  const dependencySection = {
    id: 'dependencies',
    title: 'Dependency Context',
    meta: <Badge>{object.dependencyIds.length} deps</Badge>,
    children: <DependencyContext object={object} />,
  };
  const logsSection = {
    id: 'logs',
    title: 'Runtime Logs',
    meta: <Badge>{events.length} events</Badge>,
    children: (
      <RuntimeLogs
        events={events}
        isLoading={isLoading}
        highlightedLogId={highlightedTraceId}
        onSelectEvent={onTraceSelect}
      />
    ),
  };

  if (object.type === 'planner') {
    return [
      section('execution', 'Planner Output', <Badge tone={plan ? 'success' : 'neutral'}>{plan ? `${plan.steps.length} steps` : 'pending'}</Badge>, (
        <JsonViewer title="Plan" value={plan ?? object.output} collapsed />
      )),
      section('input', 'Planner Input', <Badge tone="info">goal</Badge>, (
        <JsonViewer title="Planner Input" value={object.input} collapsed />
      )),
      dependencySection,
      sharedTraceSection,
      logsSection,
    ];
  }

  if (object.type === 'workflow') {
    return [
      section('execution', 'Workflow State', <Badge tone={state ? 'info' : 'neutral'}>{state?.status ?? object.status}</Badge>, (
        <JsonViewer title="Workflow State" value={state ?? object.output} collapsed />
      )),
      section('input', 'Workflow Plan', <Badge>{plan?.steps.length ?? 0} steps</Badge>, (
        <JsonViewer title="Workflow Input" value={object.input ?? plan} collapsed />
      )),
      dependencySection,
      sharedTraceSection,
      logsSection,
    ];
  }

  if (object.type === 'tool') {
    return [
      section('arguments', 'Arguments', <Badge tone="info">tool input</Badge>, (
        <JsonViewer title="Tool Arguments" value={object.arguments ?? object.input} collapsed />
      )),
      section('output', 'Result', <Badge tone="success">{object.status}</Badge>, (
        <JsonViewer title="Tool Result" value={object.output} collapsed />
      )),
      section('execution', 'Execution Metrics', <Badge>{formatDuration(object.duration)}</Badge>, (
        <ObjectMetrics
          rows={[
            ['Tool', object.title],
            ['Duration', formatDuration(object.duration)],
            ['Retry', String(object.retryCount ?? 0)],
            ['Tokens', String(object.tokenCount ?? 0)],
            ['Trace', shortId(object.traceId)],
            ['Parent', object.parentId ?? '-'],
          ]}
        />
      )),
      dependencySection,
      sharedTraceSection,
      logsSection,
    ];
  }

  if (object.type === 'knowledge') {
    return [
      section('evidence', 'Retrieved Chunks', <Badge tone="warning">{citations.length} refs</Badge>, (
        <KnowledgeExplorer
          citations={citations}
          isLoading={isLoading}
          highlightedCitationId={highlightedCitationId}
          onSelectCitation={onCitationSelect}
        />
      )),
      section('query', 'Retriever Input', <Badge tone="info">RAG</Badge>, (
        <JsonViewer title="Retriever Input" value={object.input} collapsed />
      )),
      dependencySection,
      sharedTraceSection,
      logsSection,
    ];
  }

  if (object.type === 'memory') {
    return [
      section('memory', 'Memory Writes', <Badge tone="neutral">{memory.length}</Badge>, (
        <MemoryExplorer
          memories={memory}
          isLoading={isLoading}
          highlightedMemoryId={highlightedMemoryId}
          onSelectMemory={onMemorySelect}
        />
      )),
      section('metadata', 'Memory Metadata', <Badge>metadata</Badge>, (
        <JsonViewer title="Memory Metadata" value={object.metadata ?? object.output} collapsed />
      )),
      dependencySection,
      sharedTraceSection,
      logsSection,
    ];
  }

  if (object.type === 'evaluation') {
    return [
      section('evaluation', 'Evaluation Dashboard', <Badge tone={evaluation ? 'success' : 'neutral'}>{evaluation ? 'ready' : 'pending'}</Badge>, (
        <EvaluationDashboard
          evaluation={evaluation}
          isLoading={isLoading}
          runtimeDuration={object.duration}
          runtimeTokens={runtimeTokens}
          runtimeCost={runtimeCost}
          onViewTrace={onEvaluationTrace}
        />
      )),
      section('reasoning', 'Feedback', <Badge tone="info">judge</Badge>, (
        <JsonViewer title="Evaluation Feedback" value={evaluation?.feedback ?? object.output} collapsed />
      )),
      dependencySection,
      sharedTraceSection,
      logsSection,
    ];
  }

  if (object.type === 'answer') {
    return [
      section('output', 'Final Answer', <Badge tone="success">answer</Badge>, (
        <JsonViewer title="Answer Output" value={object.output} collapsed />
      )),
      section('evidence', 'Evidence Used', <Badge tone="warning">{citations.length} refs</Badge>, (
        <KnowledgeExplorer
          citations={citations}
          isLoading={isLoading}
          highlightedCitationId={highlightedCitationId}
          onSelectCitation={onCitationSelect}
        />
      )),
      section('evaluation', 'Quality', <Badge tone={evaluation ? 'success' : 'neutral'}>{evaluation ? 'ready' : 'pending'}</Badge>, (
        <EvaluationDashboard
          evaluation={evaluation}
          isLoading={isLoading}
          runtimeDuration={object.duration}
          runtimeTokens={runtimeTokens}
          runtimeCost={runtimeCost}
          onViewTrace={onEvaluationTrace}
        />
      )),
      dependencySection,
      sharedTraceSection,
    ];
  }

  if (object.type === 'reflection') {
    return [
      section('reasoning', 'Reflection Reasoning', <Badge tone="info">reasoning</Badge>, (
        <JsonViewer title="Reflection Output" value={object.reasoning ?? object.output} collapsed />
      )),
      section('input', 'Reflection Input', <Badge>input</Badge>, (
        <JsonViewer title="Reflection Input" value={object.input} collapsed />
      )),
      dependencySection,
      sharedTraceSection,
      logsSection,
    ];
  }

  return [
    section('execution', 'Execution Snapshot', <Badge>{object.title}</Badge>, (
      <JsonViewer title="Runtime Object" value={object} collapsed />
    )),
    section('input', 'Input', <Badge tone="info">JSON</Badge>, (
      <JsonViewer title="Input" value={object.input ?? object.arguments} collapsed />
    )),
    section('output', 'Output', <Badge tone="success">Result</Badge>, (
      <JsonViewer title="Output" value={object.output} collapsed />
    )),
    dependencySection,
    sharedTraceSection,
    logsSection,
  ];
}

function section(id: string, title: string, meta: ReactNode, children: ReactNode) {
  return { id, title, meta, children };
}

function ObjectMetrics({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="grid gap-2">
      {rows.map(([label, value]) => (
        <RuntimeContextRow key={label} label={label} value={value} />
      ))}
    </div>
  );
}

function DependencyContext({
  object,
}: {
  object: RuntimeInspectorProps['runtimeObjects'][number];
}) {
  return (
    <div className="space-y-3">
      <ObjectMetrics
        rows={[
          ['Trace ID', shortId(object.traceId)],
          ['Span ID', shortId(object.spanId)],
          ['Parent', object.parentId ?? '-'],
          ['Lifecycle', object.lifecycle],
          ['Children', object.childIds.length ? object.childIds.join(', ') : '-'],
        ]}
      />
      <JsonViewer
        title="Dependency Graph Projection"
        value={{
          objectId: object.id,
          parentId: object.parentId,
          dependencyIds: object.dependencyIds,
          childIds: object.childIds,
          span: object.span,
        }}
        collapsed
      />
    </div>
  );
}

function EmptyInspector({
  runtimeOverview,
}: {
  runtimeOverview: RuntimeInspectorProps['runtimeOverview'];
}) {
  const evaluationLabel =
    runtimeOverview.evaluationScore === undefined
      ? 'Pending'
      : `${Math.round(runtimeOverview.evaluationScore * 100)}%`;

  const sections = [
    {
      id: 'context',
      title: 'Runtime Context',
      meta: <Badge>{runtimeOverview.progress}%</Badge>,
      children: (
        <div className="space-y-1">
          <RuntimeContextRow label="Task" value={truncate(runtimeOverview.taskLabel, 30)} />
          <RuntimeContextRow label="Tools" value={String(runtimeOverview.toolCount)} />
          <RuntimeContextRow label="Knowledge" value={String(runtimeOverview.citationCount)} />
          <RuntimeContextRow label="Memory" value={String(runtimeOverview.memoryCount)} />
          <RuntimeContextRow label="Events" value={String(runtimeOverview.eventCount)} />
          <RuntimeContextRow label="Last event" value={runtimeOverview.latestEvent ?? 'None'} />
        </div>
      ),
    },
    {
      id: 'path',
      title: 'Runtime Path',
      meta: <Badge>{runtimeOverview.availableSignals.length}</Badge>,
      children: (
        <div className="space-y-2">
          {runtimeOverview.availableSignals.map((signal) => (
            <RuntimeObjectPreview key={signal.label} label={signal.label} detail={signal.value} />
          ))}
        </div>
      ),
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <section className="border-b border-line bg-white p-3">
        <div className="grid grid-cols-3 gap-2">
          <OverviewStat label="Step" value={truncate(runtimeOverview.currentStep, 14)} />
          <OverviewStat label="Progress" value={`${runtimeOverview.progress}%`} />
          <OverviewStat label="Eval" value={evaluationLabel} />
        </div>
        <p className="mt-2 text-[10px] leading-4 text-muted">
          Select a graph node or timeline span to inspect the runtime object behind it.
        </p>
      </section>

      <div className="p-3">
        <Accordion items={sections} defaultOpenId="" variant="flush" />
      </div>
    </div>
  );
}

function OverviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-semibold text-ink">{value}</div>
    </div>
  );
}

function RuntimeContextRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-[11px] text-muted">{label}</span>
      <span className="font-mono text-[11px] font-semibold text-ink">{value}</span>
    </div>
  );
}

function RuntimeObjectPreview({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="border-t border-line py-2 first:border-t-0">
      <div className="text-xs font-semibold text-ink">{label}</div>
      <div className="mt-0.5 text-[10px] leading-4 text-muted">{detail}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-white p-2">
      <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</div>
      <div className="mt-0.5 truncate font-mono text-xs font-semibold text-ink">{value}</div>
    </div>
  );
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

function shortId(value: string): string {
  return value.length > 18 ? value.slice(-18) : value;
}

function getDefaultOpenSection(focusType?: string, focusSection?: string): string {
  if (focusSection) return focusSection;
  if (focusType === 'citation' || focusType === 'rag') return 'evidence';
  if (focusType === 'memory') return 'memory';
  if (focusType === 'evaluation') return 'evaluation';
  if (focusType === 'trace') return 'trace';
  if (focusType === 'log') return 'logs';
  return 'execution';
}

function readRuntimeMetrics(events: RuntimeInspectorProps['events']) {
  const tokens = events.reduce((sum, event) => sum + readTokenCount(event.payload), 0);
  const timestamps = events.map((event) => event.timestamp).filter(Boolean);
  const duration = timestamps.length >= 2 ? Math.max(...timestamps) - Math.min(...timestamps) : undefined;
  const cost = tokens > 0 ? (tokens / 1000) * 0.002 : undefined;
  return { tokens, duration, cost };
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

function formatDuration(duration?: number): string {
  if (duration === undefined) return 'pending';
  return duration >= 1000 ? `${(duration / 1000).toFixed(1)}s` : `${duration}ms`;
}
