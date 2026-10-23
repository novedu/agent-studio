import ReactMarkdown from 'react-markdown';
import { useMemo, useState, type ReactNode } from 'react';
import { Badge, JsonViewer } from '../ui';
import { classNames } from '../ui/classNames';
import type { RuntimeObject } from '../../features/agent-console/runtime-object-model';

interface StepDetailProps {
  object: RuntimeObject;
}

type StepTab = 'overview' | 'input' | 'output' | 'reasoning' | 'trace' | 'metadata' | 'raw';

const tabs: Array<{ id: StepTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'input', label: 'Input' },
  { id: 'output', label: 'Output' },
  { id: 'reasoning', label: 'Reasoning' },
  { id: 'trace', label: 'Events' },
  { id: 'metadata', label: 'Metadata' },
  { id: 'raw', label: 'Raw JSON' },
];

export function StepDetail({ object }: StepDetailProps) {
  const [activeTab, setActiveTab] = useState<StepTab>('overview');
  const raw = useMemo(
    () => ({
      id: object.id,
      type: object.type,
      traceId: object.traceId,
      spanId: object.spanId,
      parentId: object.parentId,
      dependencyIds: object.dependencyIds,
      childIds: object.childIds,
      lifecycle: object.lifecycle,
      title: object.title,
      summary: object.summary,
      status: object.status,
      duration: object.duration,
      startTime: object.startTime,
      endTime: object.endTime,
      input: object.input,
      arguments: object.arguments,
      output: object.output,
      reasoning: object.reasoning,
      metadata: object.metadata,
      trace: object.trace,
      span: object.span,
      tokenCount: object.tokenCount,
      retryCount: object.retryCount,
      cost: object.cost,
    }),
    [object],
  );

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={classNames(
              'h-9 cursor-pointer rounded-lg border px-3 text-xs font-semibold transition-colors duration-200',
              activeTab === tab.id
                ? 'border-accent bg-blue-50 text-accent'
                : 'border-line bg-white text-muted hover:border-lineStrong hover:text-ink',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && <Overview object={object} />}
      {activeTab === 'input' && (
        <JsonViewer title="Input" value={{ input: object.input, arguments: object.arguments }} />
      )}
      {activeTab === 'output' && <SmartBlock title="Output" value={object.output} />}
      {activeTab === 'reasoning' && <SmartBlock title="Reasoning Summary" value={getReasoning(object)} />}
      {activeTab === 'trace' && (
        <JsonViewer
          title="Runtime Events"
          value={{
            traceId: object.traceId,
            spanId: object.spanId,
            parentId: object.parentId,
            lifecycle: object.lifecycle,
            span: object.span,
            events: object.trace,
          }}
        />
      )}
      {activeTab === 'metadata' && (
        <JsonViewer
          title="Metadata"
          value={{
            metadata: object.metadata,
            dependencies: {
              parentId: object.parentId,
              dependencyIds: object.dependencyIds,
              childIds: object.childIds,
            },
          }}
        />
      )}
      {activeTab === 'raw' && <JsonViewer title="Raw Runtime Object" value={raw} />}
    </div>
  );
}

function Overview({ object }: { object: RuntimeObject }) {
  const node = object.sourceNode;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Focused Runtime Object
            </div>
            <h3 className="mt-2 truncate text-lg font-semibold text-ink">{object.title}</h3>
            <p className="mt-1 text-sm leading-6 text-muted">{object.summary}</p>
          </div>
          <Badge tone={object.status === 'failed' ? 'danger' : object.status === 'success' ? 'success' : 'info'}>
            {object.status}
          </Badge>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-xs">
        <Detail label="Component" value={object.title} />
        <Detail label="Type" value={object.type} />
        <Detail label="Lifecycle" value={object.lifecycle} />
        <Detail label="Duration" value={formatDuration(object.duration)} />
        <Detail label="Retry" value={String(object.retryCount ?? 0)} />
        <Detail label="Tokens" value={String(object.tokenCount ?? 0)} />
        <Detail label="Source Kind" value={node.kind} />
        <Detail label="Trace ID" value={shortId(object.traceId)} />
        <Detail label="Span ID" value={shortId(object.spanId)} />
        <Detail label="Parent" value={object.parentId ?? '-'} />
        <Detail label="Dependencies" value={object.dependencyIds.length ? object.dependencyIds.join(', ') : '-'} />
        <Detail label="Start" value={formatTime(object.startTime)} />
        <Detail label="End" value={formatTime(object.endTime)} />
      </dl>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-white p-3">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</dt>
      <dd className="mt-1 truncate font-medium text-ink">{value}</dd>
    </div>
  );
}

function SmartBlock({ title, value }: { title: string; value: unknown }) {
  if (typeof value === 'string' && value.trim()) {
    return (
      <section className="overflow-hidden rounded-lg border border-line bg-white">
        <header className="flex min-h-10 items-center border-b border-line px-3 text-xs font-semibold text-ink">
          {title}
        </header>
        <div className="prose prose-sm max-w-none p-4 prose-p:my-2 prose-pre:rounded-md prose-pre:bg-slate-950 prose-pre:text-slate-100">
          <ReactMarkdown>{value}</ReactMarkdown>
        </div>
      </section>
    );
  }

  return <JsonViewer title={title} value={value} />;
}

function getReasoning(object: RuntimeObject): unknown {
  if (object.reasoning) return object.reasoning;
  if (object.type === 'reflection') return object.output;
  if (object.type === 'evaluation') return object.metadata;
  if (object.type === 'tool') return object.trace;
  return 'No reasoning payload captured for this runtime object.';
}

function formatDuration(duration?: number): string {
  if (duration === undefined) return 'pending';
  return duration >= 1000 ? `${(duration / 1000).toFixed(1)}s` : `${duration}ms`;
}

function formatTime(timestamp?: number): string {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleTimeString();
}

function shortId(value: string): string {
  return value.length > 18 ? value.slice(-18) : value;
}
