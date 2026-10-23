import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Badge, JsonViewer, Panel } from '../ui';
import { classNames } from '../ui/classNames';
import { ExecutionStatus } from './ExecutionStatus';
import {
  getKindLabel,
  getStatusColor,
  type ExecutionNodeRecord,
} from './execution-model';
import {
  buildRuntimeObjects,
  getRuntimeDepth,
  type RuntimeObject,
} from '../../features/agent-console/runtime-object-model';

interface ExecutionTimelineProps {
  nodes: ExecutionNodeRecord[];
  runtimeObjects?: RuntimeObject[];
  activeNodeId?: string;
  onSelectNode: (node: ExecutionNodeRecord) => void;
  onStart?: () => void;
  dockAction?: ReactNode;
}

const flowKinds = new Set([
  'planner',
  'workflow',
  'tool',
  'rag',
  'memory',
  'reflection',
  'evaluation',
  'answer',
]);

export function ExecutionTimeline({
  nodes,
  runtimeObjects,
  activeNodeId,
  onSelectNode,
  onStart,
  dockAction,
}: ExecutionTimelineProps) {
  const flowObjects = useMemo(
    () => (runtimeObjects ?? buildRuntimeObjects(nodes)).filter((object) => flowKinds.has(object.sourceNode.kind)),
    [nodes, runtimeObjects],
  );
  const [filter, setFilter] = useState<TimelineFilter>('all');
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | undefined>(activeNodeId);
  const visibleObjects = useMemo(
    () => flowObjects.filter((object) => matchesFilter(object, filter) && matchesQuery(object, query)),
    [filter, flowObjects, query],
  );
  const spanTree = useMemo(() => visibleObjects.map(toTimelineSpanModel), [visibleObjects]);
  const traceSummary = useMemo(() => buildTraceSummary(flowObjects), [flowObjects]);

  useEffect(() => {
    if (activeNodeId) setExpandedId(activeNodeId);
  }, [activeNodeId]);

  return (
    <Panel
      title="Debug Timeline"
      description={flowObjects.length ? 'Runtime events projected from objects' : 'Runtime flow preview'}
      className="h-full rounded-none border-0 shadow-none"
      bodyClassName="min-h-0 overflow-hidden p-0"
      actions={
        <TimelineToolbar
          filter={filter}
          query={query}
          visibleCount={visibleObjects.length}
          totalCount={flowObjects.length}
          onFilterChange={setFilter}
          onQueryChange={setQuery}
          dockAction={dockAction}
        />
      }
    >
      {flowObjects.length ? (
        <div className="h-full min-h-0 min-w-0 overflow-x-hidden overflow-y-auto px-3 py-2">
          {visibleObjects.length === 0 ? (
            <div className="flex h-full min-h-0 items-center justify-center text-center">
              <div>
                <div className="text-xs font-semibold text-ink">No events match this filter</div>
                <p className="mt-1 text-[10px] text-muted">Adjust search or filter to inspect runtime events.</p>
              </div>
            </div>
          ) : (
            <>
              <TraceSummary summary={traceSummary} />
              <div className="relative mt-2">
                <div className="absolute bottom-4 left-[111px] top-4 w-px bg-line" />
                {spanTree.map(({ object, depth }, index) => (
                  <TimelineSpan
                    key={object.id}
                    object={object}
                    depth={depth}
                    index={index}
                    active={object.id === activeNodeId}
                    expanded={object.id === expandedId}
                    onSelect={() => {
                      onSelectNode(object.sourceNode);
                      setExpandedId((value) => (value === object.id ? undefined : object.id));
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <EmptyFlow onStart={onStart} />
      )}
    </Panel>
  );
}

interface TraceSummaryModel {
  traceId: string;
  rootSpan?: string;
  spanCount: number;
  eventCount: number;
  duration?: number;
  criticalPath: string;
}

function TraceSummary({ summary }: { summary: TraceSummaryModel }) {
  return (
    <div className="rounded-lg border border-line bg-slate-50/70 px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-muted">
        <span>task {shortId(summary.traceId)}</span>
        <span>root {summary.rootSpan ?? '-'}</span>
        <span>events {summary.eventCount}</span>
        <span>events {summary.eventCount}</span>
        <span>duration {formatDuration(summary.duration)}</span>
      </div>
      <div className="mt-1 truncate text-[10px] text-muted">
        critical path · {summary.criticalPath}
      </div>
    </div>
  );
}

type TimelineFilter =
  | 'all'
  | 'running'
  | 'failed'
  | 'tool'
  | 'knowledge'
  | 'memory'
  | 'reflection'
  | 'evaluation';

function TimelineToolbar({
  filter,
  query,
  visibleCount,
  totalCount,
  onFilterChange,
  onQueryChange,
  dockAction,
}: {
  filter: TimelineFilter;
  query: string;
  visibleCount: number;
  totalCount: number;
  onFilterChange: (value: TimelineFilter) => void;
  onQueryChange: (value: string) => void;
  dockAction?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 shrink-0 items-center gap-1">
      <span className="hidden rounded-md border border-line bg-white px-2 py-1 font-mono text-[10px] text-muted xl:inline-flex">
        live {visibleCount}/{totalCount}
      </span>
      <select
        value={filter}
        onChange={(event) => onFilterChange(event.target.value as TimelineFilter)}
        className="h-6 cursor-pointer rounded-md border border-line bg-white px-1.5 text-[10px] font-medium text-muted outline-none transition-colors duration-200 hover:bg-panel focus:border-accent"
      >
        <option value="all">All</option>
        <option value="running">Running</option>
        <option value="failed">Failed</option>
        <option value="tool">Tool</option>
        <option value="knowledge">RAG</option>
        <option value="memory">Memory</option>
        <option value="reflection">Reflection</option>
        <option value="evaluation">Eval</option>
      </select>
      <input
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Search"
        className="h-6 w-20 rounded-md border border-line bg-white px-2 text-[10px] text-ink outline-none transition-colors duration-200 placeholder:text-muted hover:bg-panel focus:border-accent xl:w-28"
      />
      {dockAction}
    </div>
  );
}

function TimelineSpan({
  object,
  depth,
  index,
  active,
  expanded,
  onSelect,
}: {
  object: RuntimeObject;
  depth: number;
  index: number;
  active: boolean;
  expanded: boolean;
  onSelect: () => void;
}) {
  const color = getStatusColor(object.status);
  const node = object.sourceNode;

  return (
    <motion.article
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, delay: index * 0.015 }}
      className="relative min-w-0"
    >
      <button
        type="button"
        onClick={onSelect}
        className={classNames(
          'grid w-full min-w-0 cursor-pointer grid-cols-[84px_22px_minmax(0,1fr)] items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors duration-200',
          active ? 'bg-blue-50/80 ring-1 ring-inset ring-blue-100' : 'hover:bg-panel',
        )}
      >
        <div className="whitespace-nowrap pt-0.5 font-mono text-[10px] text-muted">
          {formatTime(node.startTime)}
        </div>
        <div className="relative flex h-full justify-center pt-1.5">
          {depth > 0 && (
            <span
              className="pointer-events-none absolute left-1/2 top-2 h-px bg-lineStrong"
              style={{ width: `${depth * 12 + 8}px` }}
            />
          )}
          <span
            className="relative z-10 h-2.5 w-2.5 rounded-full border-2 border-white shadow-sm"
            style={{ backgroundColor: color }}
          />
        </div>
        <div className="min-w-0 overflow-hidden" style={{ paddingLeft: `${depth * 12}px` }}>
          <div className="flex min-w-0 items-center gap-2 overflow-hidden">
            {depth > 0 && <span className="shrink-0 font-mono text-[10px] text-muted">+</span>}
            <Badge tone={getTone(node.kind)} className="shrink-0 px-1.5 py-0.5 text-[9px]">
              {getKindLabel(node.kind)}
            </Badge>
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink">{object.title}</span>
            <span className="shrink-0">
              <ExecutionStatus status={object.status} />
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[10px] text-muted">
            <span>{formatDuration(object.duration)}</span>
            <span>span {shortId(object.spanId)}</span>
            <span>events {object.span.eventCount}</span>
            <span>tokens {object.tokenCount ?? 0}</span>
            <span>retry {object.retryCount ?? 0}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {object.parentId && (
              <span className="rounded border border-line bg-white px-1.5 py-0.5 font-mono text-[9px] text-muted">
                parent {object.parentId}
              </span>
            )}
            {object.dependencyIds.slice(0, 3).map((dependencyId) => (
              <span
                key={dependencyId}
                className="rounded border border-line bg-white px-1.5 py-0.5 font-mono text-[9px] text-muted"
              >
                dep {dependencyId}
              </span>
            ))}
          </div>
          <p className="mt-1 line-clamp-1 text-[10px] leading-4 text-muted">{object.summary}</p>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="max-w-full overflow-hidden pl-[130px] pr-2"
          >
            <div className="mb-2 grid gap-2 rounded-lg border border-blue-100 bg-panel/50 p-2 lg:grid-cols-2">
              <JsonViewer title="Span" value={object.span} collapsed />
              <JsonViewer
                title="Dependencies"
                value={{
                  traceId: object.traceId,
                  spanId: object.spanId,
                  parentId: object.parentId,
                  dependencyIds: object.dependencyIds,
                  childIds: object.childIds,
                  lifecycle: object.lifecycle,
                }}
                collapsed
              />
              <JsonViewer title="Input" value={object.input ?? object.arguments} collapsed />
              <JsonViewer title="Output" value={object.output} collapsed />
              <JsonViewer title="Metadata" value={object.metadata} collapsed />
              <JsonViewer title="Trace" value={object.trace} collapsed />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

function matchesFilter(object: RuntimeObject, filter: TimelineFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'running') return object.status === 'running';
  if (filter === 'failed') return object.status === 'failed';
  return object.type === filter;
}

function matchesQuery(object: RuntimeObject, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  return [
    object.title,
    object.summary,
    object.type,
    object.status,
    object.sourceNode.kind,
    object.traceId,
    object.spanId,
    object.parentId ?? '',
    ...object.dependencyIds,
  ].some((value) => value.toLowerCase().includes(normalizedQuery));
}

function buildTraceSummary(objects: RuntimeObject[]): TraceSummaryModel {
  const timestamps = objects
    .flatMap((object) => [object.startTime, object.endTime])
    .filter((value): value is number => typeof value === 'number');
  const root = objects.find((object) => !object.parentId) ?? objects[0];
  const criticalPath = objects
    .filter((object) => object.lifecycle !== 'pending')
    .map((object) => object.title)
    .join(' -> ');

  return {
    traceId: root?.traceId ?? 'trace_local',
    rootSpan: root?.id,
    spanCount: objects.length,
    eventCount: objects.reduce((sum, object) => sum + object.span.eventCount, 0),
    duration:
      timestamps.length >= 2 ? Math.max(...timestamps) - Math.min(...timestamps) : undefined,
    criticalPath: criticalPath || 'waiting for first runtime span',
  };
}

function toTimelineSpanModel(object: RuntimeObject): { object: RuntimeObject; depth: number } {
  return { object, depth: getTimelineDepth(object.type) };
}

function getTimelineDepth(type: RuntimeObject['type']): number {
  return getRuntimeDepth(type);
}

function EmptyFlow({ onStart }: { onStart?: () => void }) {
  const preview = [
    { label: 'Planner', status: 'pending' },
    { label: 'Tool', status: 'pending' },
    { label: 'Knowledge', status: 'pending' },
    { label: 'Memory', status: 'pending' },
    { label: 'Reflection', status: 'pending' },
    { label: 'Evaluation', status: 'pending' },
    { label: 'Answer', status: 'pending' },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-3">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
            Flow Trace
          </div>
          <p className="mt-0.5 text-[10px] text-muted">
            Start a task to stream runtime events into this rail.
          </p>
        </div>
        {onStart && (
          <button
            type="button"
            onClick={onStart}
            className="inline-flex h-7 cursor-pointer items-center rounded-md border border-accent bg-accent px-3 text-[10px] font-semibold text-white transition-colors duration-200 hover:bg-blue-700"
          >
            Start
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="relative">
          <div className="absolute bottom-5 left-[79px] top-5 w-px bg-line" />
          {preview.map((item, index) => (
            <div
              key={item.label}
              className="grid grid-cols-[58px_18px_minmax(0,1fr)] items-center gap-2 px-2 py-1.5"
            >
              <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-muted">
                {index === 0 ? 'Ready' : 'Queued'}
              </span>
              <span
                className={`relative z-10 h-2.5 w-2.5 rounded-full border-2 border-white ${
                  index === 0 ? 'bg-blue-500 shadow-[0_0_0_3px_rgba(59,130,246,0.12)]' : 'bg-slate-300'
                }`}
              />
              <div className="flex items-center justify-between gap-2 rounded-md border border-line bg-panel px-2 py-1.5">
                <span className="text-xs font-semibold text-ink">{item.label}</span>
                <span className="font-mono text-[10px] text-muted">{item.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function getTone(kind: ExecutionNodeRecord['kind']): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
  if (kind === 'tool') return 'success';
  if (kind === 'rag') return 'warning';
  if (kind === 'memory') return 'neutral';
  if (kind === 'evaluation' || kind === 'reflection' || kind === 'planner') return 'info';
  return 'neutral';
}

function formatDuration(duration?: number): string {
  if (duration === undefined) return 'pending';
  return duration >= 1000 ? `${(duration / 1000).toFixed(1)}s` : `${duration}ms`;
}

function formatTime(timestamp?: number): string {
  if (!timestamp) return 'Queued';
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function shortId(value: string): string {
  return value.length > 18 ? value.slice(-18) : value;
}
