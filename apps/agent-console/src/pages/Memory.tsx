import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  ChevronRightIcon,
  LinkIcon,
  MemoryIcon,
  Panel,
  SearchIcon,
} from '@console/components/ui';
import { classNames } from '@console/components/ui/classNames';
import { useAgentStore } from '@console/store/agentStore';
import { LegacySessionNotice } from '@console/components/legacy/LegacySessionNotice';
import type { AgentEvent, MemoryRecord, Message } from '@console/types/agent';

export interface MemoryEntry extends MemoryRecord {
  taskId?: string;
  eventId?: string;
  eventTimestamp?: number;
  source?: string;
  relatedMessage?: Message;
}

export interface MemoryWrite {
  id: string;
  taskId?: string;
  timestamp: number;
  memoryType: MemoryRecord['type'] | 'mixed';
  count: number;
  items: MemoryEntry[];
}

export interface MemoryGroupSummary {
  type: MemoryRecord['type'];
  label: string;
  description: string;
  count: number;
  averageImportance?: number;
  latestUpdate?: number;
}

const memoryTypes: Array<{
  type: MemoryRecord['type'];
  label: string;
  description: string;
  tone: 'info' | 'success' | 'warning';
}> = [
  {
    type: 'working',
    label: 'Working',
    description: 'Current task context and short-lived execution notes.',
    tone: 'info',
  },
  {
    type: 'episodic',
    label: 'Episodic',
    description: 'Task summaries and run-level memories produced by the agent.',
    tone: 'warning',
  },
  {
    type: 'semantic',
    label: 'Semantic',
    description: 'Stable user preferences and reusable long-term facts.',
    tone: 'success',
  },
];

export function Memory() {
  const memory = useAgentStore((state) => state.memory);
  const events = useAgentStore((state) => state.events);
  const messages = useAgentStore((state) => state.messages);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<MemoryRecord['type'] | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string>();

  const entries = useMemo(() => buildMemoryEntries(memory, events, messages), [memory, events, messages]);
  const writes = useMemo(() => buildMemoryWrites(events, messages), [events, messages]);
  const groups = useMemo(() => buildGroupSummaries(entries), [entries]);
  const filteredEntries = useMemo(
    () => filterEntries(entries, query, typeFilter),
    [entries, query, typeFilter],
  );
  const selectedEntry =
    filteredEntries.find((entry) => entry.id === selectedId) ??
    filteredEntries[0] ??
    entries[0];
  const latestUpdate = entries.reduce<number | undefined>(
    (latest, entry) => (latest === undefined ? entry.updatedAt : Math.max(latest, entry.updatedAt)),
    undefined,
  );
  const averageImportance =
    entries.length > 0
      ? entries.reduce((sum, entry) => sum + entry.importance, 0) / entries.length
      : undefined;

  return (
    <section className="h-full overflow-y-auto bg-[var(--studio-bg)]">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-4 p-4 lg:p-6">
        <LegacySessionNotice view="Memory writes" />

        <MemoryHeader memoryCount={entries.length} writeCount={writes.length} />

        {entries.length === 0 ? (
          <MemoryEmptyState />
        ) : (
          <>
            <MemoryMetricStrip
              total={entries.length}
              writes={writes.length}
              averageImportance={averageImportance}
              latestUpdate={latestUpdate}
            />

            <div className="grid min-h-[650px] min-w-0 gap-4 xl:grid-cols-[310px_minmax(0,1fr)_390px]">
              <MemoryActivityPanel writes={writes} groups={groups} />
              <MemoryExplorerPanel
                entries={filteredEntries}
                selectedId={selectedEntry?.id}
                query={query}
                typeFilter={typeFilter}
                onQueryChange={setQuery}
                onTypeFilterChange={setTypeFilter}
                onSelect={setSelectedId}
              />
              <MemoryDetailPanel entry={selectedEntry} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function MemoryHeader({ memoryCount, writeCount }: { memoryCount: number; writeCount: number }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
            Memory Platform
          </div>
          <Badge tone={memoryCount ? 'info' : 'neutral'}>
            {memoryCount ? `${memoryCount} records` : 'No current memory'}
          </Badge>
        </div>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-ink">Memory Center</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Inspect working, episodic, and semantic memory writes from the current Agent run.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[10px] text-muted">
          <span>current session only</span>
          <span className="text-lineStrong">·</span>
          <span>{writeCount} memory write events</span>
          <span className="text-lineStrong">·</span>
          <span>no persistent memory database in this phase</span>
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

function MemoryMetricStrip({
  total,
  writes,
  averageImportance,
  latestUpdate,
}: {
  total: number;
  writes: number;
  averageImportance?: number;
  latestUpdate?: number;
}) {
  const metrics = [
    { label: 'Memory records', value: total, detail: 'current session', tone: 'info' as const },
    { label: 'Write events', value: writes, detail: 'memory_update', tone: 'neutral' as const },
    {
      label: 'Avg importance',
      value: averageImportance === undefined ? '-' : averageImportance.toFixed(2),
      detail: 'runtime score',
      tone: averageImportance === undefined ? 'neutral' as const : 'success' as const,
    },
    {
      label: 'Latest update',
      value: latestUpdate === undefined ? '-' : formatTime(latestUpdate),
      detail: 'local time',
      tone: 'warning' as const,
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

function MemoryActivityPanel({
  writes,
  groups,
}: {
  writes: MemoryWrite[];
  groups: MemoryGroupSummary[];
}) {
  return (
    <div className="grid min-h-0 gap-4 xl:grid-rows-[minmax(0,1fr)_280px]">
      <Panel
        title="Memory Timeline"
        description="Write events emitted by runtime"
        actions={<Badge>{writes.length}</Badge>}
        bodyClassName="min-h-0 overflow-y-auto p-0"
      >
        {writes.length === 0 ? (
          <SmallEmpty title="No writes" description="Memory updates will appear after a task writes context." />
        ) : (
          <div className="divide-y divide-line">
            {writes.map((write) => (
              <article key={write.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-blue-500" />
                      <div className="text-xs font-semibold text-ink">{formatTime(write.timestamp)}</div>
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-muted">
                      {write.taskId ?? 'session'} · {write.id}
                    </div>
                  </div>
                  <Badge tone={write.memoryType === 'mixed' ? 'neutral' : getMemoryTone(write.memoryType)}>
                    {write.count} records
                  </Badge>
                </div>
                <div className="mt-3 space-y-2">
                  {write.items.slice(0, 3).map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-line bg-panel px-3 py-2 text-[11px] leading-5 text-muted"
                    >
                      <span className="font-semibold text-ink">{getMemoryLabel(item.type)}:</span>{' '}
                      {item.content}
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title="Memory Map"
        description="Type distribution and write density"
        actions={<Badge>{groups.reduce((sum, group) => sum + group.count, 0)}</Badge>}
        bodyClassName="min-h-0 overflow-y-auto p-0"
      >
        <div className="space-y-3 p-3">
          {groups.map((group) => (
            <article key={group.type} className="rounded-xl border border-line bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-ink">{group.label}</div>
                  <p className="mt-1 text-[11px] leading-4 text-muted">{group.description}</p>
                </div>
                <Badge tone={getMemoryTone(group.type)}>{group.count}</Badge>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={classNames(
                    'h-full rounded-full',
                    group.type === 'working' && 'bg-blue-500',
                    group.type === 'episodic' && 'bg-amber-500',
                    group.type === 'semantic' && 'bg-emerald-500',
                  )}
                  style={{ width: `${Math.min(100, group.count * 34)}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 font-mono text-[10px] text-muted">
                <span>avg {group.averageImportance?.toFixed(2) ?? '-'}</span>
                <span>{group.latestUpdate ? formatTime(group.latestUpdate) : 'no update'}</span>
              </div>
            </article>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function MemoryExplorerPanel({
  entries,
  selectedId,
  query,
  typeFilter,
  onQueryChange,
  onTypeFilterChange,
  onSelect,
}: {
  entries: MemoryEntry[];
  selectedId?: string;
  query: string;
  typeFilter: MemoryRecord['type'] | 'all';
  onQueryChange: (value: string) => void;
  onTypeFilterChange: (value: MemoryRecord['type'] | 'all') => void;
  onSelect: (id: string) => void;
}) {
  return (
    <Panel
      title="Memory Explorer"
      description="Search and inspect runtime memory"
      actions={<Badge>{entries.length} visible</Badge>}
      bodyClassName="min-h-0 overflow-hidden p-0"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-white p-3">
        <label className="flex h-9 min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-line bg-panel px-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/10">
          <SearchIcon className="h-3.5 w-3.5 text-muted" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search memory content, task, source..."
            className="min-w-0 flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-muted"
          />
        </label>
        <select
          value={typeFilter}
          onChange={(event) => onTypeFilterChange(event.target.value as MemoryRecord['type'] | 'all')}
          className="h-9 cursor-pointer rounded-lg border border-line bg-white px-3 text-xs font-medium text-muted outline-none transition-colors duration-200 hover:bg-panel focus:border-accent"
        >
          <option value="all">All memory</option>
          {memoryTypes.map((type) => (
            <option key={type.type} value={type.type}>
              {type.label}
            </option>
          ))}
        </select>
      </div>

      <div className="h-full min-h-0 overflow-y-auto">
        {entries.length === 0 ? (
          <SmallEmpty title="No matching memory" description="Adjust the query or memory type filter." />
        ) : (
          <div className="divide-y divide-line">
            {entries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => onSelect(entry.id)}
                className={classNames(
                  'block w-full cursor-pointer p-4 text-left transition-colors duration-200 hover:bg-blue-50/50',
                  entry.id === selectedId ? 'bg-blue-50/70' : 'bg-white',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-xs font-semibold text-ink">{getMemoryLabel(entry.type)}</span>
                      <Badge tone={getMemoryTone(entry.type)}>{entry.type}</Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[10px] text-muted">
                      <span>importance {entry.importance.toFixed(2)}</span>
                      <span>{formatTime(entry.updatedAt)}</span>
                      {entry.taskId && <span className="truncate">task {entry.taskId}</span>}
                    </div>
                  </div>
                  <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-300" />
                </div>
                <p className="mt-3 line-clamp-3 rounded-lg border border-line bg-panel p-3 text-xs leading-5 text-muted">
                  {entry.content}
                </p>
                {entry.relatedMessage && (
                  <div className="mt-2 rounded-md border border-blue-100 bg-blue-50 px-2 py-1.5 text-[10px] text-blue-700">
                    related message · {entry.relatedMessage.role}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

function MemoryDetailPanel({ entry }: { entry?: MemoryEntry }) {
  return (
    <Panel
      title="Memory Detail"
      description="Record, evidence, and runtime metadata"
      actions={entry ? <Badge tone={getMemoryTone(entry.type)}>selected</Badge> : <Badge>empty</Badge>}
      bodyClassName="min-h-0 overflow-y-auto p-0"
    >
      {!entry ? (
        <SmallEmpty title="No memory selected" description="Select a memory record to inspect write context." />
      ) : (
        <div className="space-y-4 p-4">
          <section className="rounded-xl border border-line bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                  Memory Type
                </div>
                <h2 className="mt-1 truncate text-sm font-semibold text-ink">{getMemoryLabel(entry.type)}</h2>
                <p className="mt-1 text-xs text-muted">{getMemoryDescription(entry.type)}</p>
              </div>
              <Badge tone={getMemoryTone(entry.type)}>importance {entry.importance.toFixed(2)}</Badge>
            </div>
          </section>

          <section className="rounded-xl border border-line bg-slate-950 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                Memory Content
              </div>
              <span className="font-mono text-[10px] text-slate-400">{entry.id}</span>
            </div>
            <pre className="whitespace-pre-wrap font-mono text-xs leading-6 text-slate-100">
              {entry.content}
            </pre>
          </section>

          <section className="rounded-xl border border-line bg-white p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
              Write Metadata
            </div>
            <dl className="mt-3 space-y-2 text-xs">
              <DetailRow label="Task" value={entry.taskId ?? '-'} />
              <DetailRow label="Event" value={entry.eventId ?? '-'} />
              <DetailRow label="Updated" value={formatDateTime(entry.updatedAt)} />
              <DetailRow label="Source" value={entry.source ?? 'memory_update'} />
            </dl>
          </section>

          {entry.relatedMessage && (
            <section className="rounded-xl border border-line bg-white p-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                Related Message
              </div>
              <div className="mt-3 rounded-lg border border-line bg-panel p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <Badge>{entry.relatedMessage.role}</Badge>
                  <span className="font-mono text-[10px] text-muted">
                    {formatTime(entry.relatedMessage.createdAt)}
                  </span>
                </div>
                <p className="line-clamp-5 text-xs leading-5 text-muted">{entry.relatedMessage.content}</p>
              </div>
            </section>
          )}

          <Link to="/agent" className="inline-flex">
            <Button size="sm" variant="secondary">
              <LinkIcon className="h-3.5 w-3.5" />
              Inspect in Agent Workspace
            </Button>
          </Link>
        </div>
      )}
    </Panel>
  );
}

function MemoryEmptyState() {
  return (
    <Card className="border-dashed border-lineStrong p-8">
      <div className="mx-auto max-w-xl text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-700">
          <MemoryIcon className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-base font-semibold text-ink">No memory records yet</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Run the sales decline demo in Agent Workspace. When the runtime saves task context,
          working, episodic, and semantic memory records will appear here.
        </p>
        <Link to="/agent" className="mt-5 inline-flex">
          <Button variant="primary" size="sm">
            Open Agent Workspace
          </Button>
        </Link>
      </div>
    </Card>
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-t border-line pt-2 first:border-t-0 first:pt-0">
      <dt className="text-muted">{label}</dt>
      <dd className="max-w-[220px] truncate text-right font-mono text-ink">{value}</dd>
    </div>
  );
}

// This pure adapter is exported for focused data-projection tests.
// eslint-disable-next-line react-refresh/only-export-components
export function buildMemoryEntries(
  memory: MemoryRecord[],
  events: AgentEvent[],
  messages: Message[],
): MemoryEntry[] {
  const fromEvents = events.flatMap((event) => {
    if (event.type !== 'memory_update') return [];
    return extractMemoryItems(event).map((item) => ({
      ...item,
      taskId: event.taskId,
      eventId: event.id,
      eventTimestamp: event.timestamp,
      source: 'memory_update',
      relatedMessage: findRelatedMessage(item, messages),
    }));
  });

  const entries = fromEvents.length > 0
    ? fromEvents
    : memory.map((item) => ({
        ...item,
        source: 'store.memory',
        relatedMessage: findRelatedMessage(item, messages),
      }));

  return dedupeMemory(entries).sort((a, b) => b.updatedAt - a.updatedAt);
}

// This pure adapter is exported for focused data-projection tests.
// eslint-disable-next-line react-refresh/only-export-components
export function buildMemoryWrites(events: AgentEvent[], messages: Message[]): MemoryWrite[] {
  return events
    .filter((event) => event.type === 'memory_update')
    .map((event) => {
      const items = extractMemoryItems(event).map((item) => ({
        ...item,
        taskId: event.taskId,
        eventId: event.id,
        eventTimestamp: event.timestamp,
        source: 'memory_update',
        relatedMessage: findRelatedMessage(item, messages),
      }));
      const itemTypes = new Set(items.map((item) => item.type));
      const memoryType: MemoryWrite['memoryType'] =
        itemTypes.size === 1 ? items[0]?.type ?? normalizeMemoryType(undefined) : 'mixed';
      return {
        id: event.id,
        taskId: event.taskId,
        timestamp: event.timestamp,
        memoryType,
        count: items.length,
        items,
      };
    })
    .reverse();
}

// This pure adapter is exported for focused data-projection tests.
// eslint-disable-next-line react-refresh/only-export-components
export function buildGroupSummaries(entries: MemoryEntry[]): MemoryGroupSummary[] {
  return memoryTypes.map((type) => {
    const items = entries.filter((entry) => entry.type === type.type);
    return {
      type: type.type,
      label: type.label,
      description: type.description,
      count: items.length,
      averageImportance:
        items.length > 0
          ? items.reduce((sum, item) => sum + item.importance, 0) / items.length
          : undefined,
      latestUpdate:
        items.length > 0
          ? items.reduce((latest, item) => Math.max(latest, item.updatedAt), 0)
          : undefined,
    };
  });
}

// This pure adapter is exported for focused data-projection tests.
// eslint-disable-next-line react-refresh/only-export-components
export function filterEntries(
  entries: MemoryEntry[],
  query: string,
  typeFilter: MemoryRecord['type'] | 'all',
): MemoryEntry[] {
  const normalizedQuery = query.trim().toLowerCase();
  return entries.filter((entry) => {
    const typeMatch = typeFilter === 'all' || entry.type === typeFilter;
    const queryMatch =
      !normalizedQuery ||
      [
        entry.id,
        entry.type,
        entry.content,
        entry.taskId ?? '',
        entry.eventId ?? '',
        entry.relatedMessage?.content ?? '',
      ].some((value) => value.toLowerCase().includes(normalizedQuery));
    return typeMatch && queryMatch;
  });
}

function extractMemoryItems(event: AgentEvent): MemoryRecord[] {
  const payload = event.payload as { memoryType?: unknown; items?: unknown };
  if (!Array.isArray(payload.items)) return [];
  const fallbackType = normalizeMemoryType(payload.memoryType);

  return payload.items.map((item, index) => {
    const record = item as {
      id?: unknown;
      type?: unknown;
      content?: unknown;
      importance?: unknown;
    };
    return {
      id: typeof record.id === 'string' ? record.id : `${event.id}_memory_${index + 1}`,
      type: normalizeMemoryType(record.type, fallbackType),
      content: typeof record.content === 'string' ? record.content : '',
      importance: typeof record.importance === 'number' ? record.importance : 0.5,
      updatedAt: event.timestamp,
    };
  });
}

function dedupeMemory(entries: MemoryEntry[]): MemoryEntry[] {
  const map = new Map<string, MemoryEntry>();
  entries.forEach((entry) => {
    map.set(`${entry.id}:${entry.eventId ?? ''}`, entry);
  });
  return Array.from(map.values());
}

function findRelatedMessage(memory: MemoryRecord, messages: Message[]): Message | undefined {
  const normalized = memory.content.toLowerCase();
  return [...messages]
    .reverse()
    .find((message) => {
      const content = message.content.toLowerCase();
      if (!content) return false;
      return normalized.includes(content.slice(0, 16)) || content.includes(normalized.slice(0, 24));
    });
}

function normalizeMemoryType(
  value: unknown,
  fallback: MemoryRecord['type'] = 'episodic',
): MemoryRecord['type'] {
  if (value === 'working' || value === 'episodic' || value === 'semantic') return value;
  return fallback;
}

function getMemoryLabel(type: MemoryRecord['type']): string {
  return memoryTypes.find((item) => item.type === type)?.label ?? type;
}

function getMemoryDescription(type: MemoryRecord['type']): string {
  return memoryTypes.find((item) => item.type === type)?.description ?? 'Runtime memory record.';
}

function getMemoryTone(type: MemoryRecord['type']): 'info' | 'success' | 'warning' {
  return memoryTypes.find((item) => item.type === type)?.tone ?? 'warning';
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp));
}

function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp));
}
