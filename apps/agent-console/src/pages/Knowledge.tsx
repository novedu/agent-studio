import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  ChevronRightIcon,
  KnowledgeIcon,
  LinkIcon,
  Panel,
  SearchIcon,
} from '@console/components/ui';
import { classNames } from '@console/components/ui/classNames';
import { useAgentStore } from '@console/store/agentStore';
import { LegacySessionNotice } from '@console/components/legacy/LegacySessionNotice';
import type { AgentEvent, CitationRecord } from '@console/types/agent';

export interface KnowledgeChunk {
  id: string;
  source: string;
  content: string;
  chunk: string;
  score?: number;
  category?: string;
  updatedAt?: string;
  query?: string;
  eventId?: string;
  retrievalDuration?: number;
  matchedKeywords?: string[];
}

export interface RetrievalRun {
  id: string;
  query: string;
  timestamp: number;
  duration?: number;
  documentCount: number;
  logs: string[];
}

export function Knowledge() {
  const citations = useAgentStore((state) => state.citations);
  const events = useAgentStore((state) => state.events);
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string>();

  const retrievalRuns = useMemo(() => buildRetrievalRuns(events), [events]);
  const chunks = useMemo(() => buildKnowledgeChunks(citations, events), [citations, events]);
  const sources = useMemo(() => buildSourceSummaries(chunks), [chunks]);
  const filteredChunks = useMemo(
    () => filterChunks(chunks, query, sourceFilter),
    [chunks, query, sourceFilter],
  );
  const selectedChunk =
    filteredChunks.find((chunk) => chunk.id === selectedId) ??
    filteredChunks[0] ??
    chunks[0];
  const averageScore =
    chunks.length > 0
      ? chunks.reduce((sum, chunk) => sum + (chunk.score ?? 0), 0) / chunks.length
      : undefined;

  return (
    <section className="h-full overflow-y-auto bg-[var(--studio-bg)]">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-4 p-4 lg:p-6">
        <LegacySessionNotice view="Knowledge evidence" />

        <KnowledgeHeader chunkCount={chunks.length} runCount={retrievalRuns.length} />

        {chunks.length === 0 ? (
          <KnowledgeEmptyState />
        ) : (
          <>
            <KnowledgeMetricStrip
              sourceCount={sources.length}
              chunkCount={chunks.length}
              runCount={retrievalRuns.length}
              averageScore={averageScore}
            />

            <div className="grid min-h-[620px] min-w-0 gap-4 xl:grid-cols-[300px_minmax(0,1fr)_380px]">
              <RetrievalRunsPanel runs={retrievalRuns} sources={sources} />
              <ChunkExplorer
                chunks={filteredChunks}
                selectedId={selectedChunk?.id}
                query={query}
                sourceFilter={sourceFilter}
                sources={sources}
                onQueryChange={setQuery}
                onSourceFilterChange={setSourceFilter}
                onSelect={setSelectedId}
              />
              <KnowledgeDetailPanel chunk={selectedChunk} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function KnowledgeHeader({
  chunkCount,
  runCount,
}: {
  chunkCount: number;
  runCount: number;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
            Knowledge Platform
          </div>
          <Badge tone={chunkCount ? 'warning' : 'neutral'}>
            {chunkCount ? `${chunkCount} chunks` : 'No current evidence'}
          </Badge>
        </div>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-ink">Knowledge Center</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Inspect RAG retrieval, citation chunks, source scores, and answer evidence from the current Agent run.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[10px] text-muted">
          <span>current session only</span>
          <span className="text-lineStrong">·</span>
          <span>{runCount} retrieval runs</span>
          <span className="text-lineStrong">·</span>
          <span>no upload pipeline in this phase</span>
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

function KnowledgeMetricStrip({
  sourceCount,
  chunkCount,
  runCount,
  averageScore,
}: {
  sourceCount: number;
  chunkCount: number;
  runCount: number;
  averageScore?: number;
}) {
  const metrics = [
    { label: 'Sources', value: sourceCount, detail: 'unique docs', tone: 'neutral' as const },
    { label: 'Chunks', value: chunkCount, detail: 'retrieved', tone: 'warning' as const },
    { label: 'Retriever runs', value: runCount, detail: 'current session', tone: 'info' as const },
    {
      label: 'Average score',
      value: averageScore === undefined ? '-' : averageScore.toFixed(2),
      detail: 'retriever rank',
      tone: averageScore === undefined ? 'neutral' as const : 'success' as const,
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

function RetrievalRunsPanel({
  runs,
  sources,
}: {
  runs: RetrievalRun[];
  sources: SourceSummary[];
}) {
  return (
    <div className="grid min-h-0 gap-4 xl:grid-rows-[minmax(0,1fr)_280px]">
      <Panel
        title="Retriever Runs"
        description="RAG query and retrieval trace"
        actions={<Badge>{runs.length}</Badge>}
        bodyClassName="min-h-0 overflow-y-auto p-0"
      >
        {runs.length === 0 ? (
          <SmallEmpty title="No retrieval run" description="Run a task that calls searchKnowledge." />
        ) : (
          <div className="divide-y divide-line">
            {runs.map((run) => (
              <article key={run.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-ink">{run.query}</div>
                    <div className="mt-1 font-mono text-[10px] text-muted">
                      {formatTime(run.timestamp)} · {run.duration ?? 0}ms
                    </div>
                  </div>
                  <Badge tone="warning">{run.documentCount} docs</Badge>
                </div>
                {run.logs.length > 0 && (
                  <div className="mt-3 rounded-lg border border-line bg-slate-950 px-3 py-2 font-mono text-[10px] leading-5 text-slate-100">
                    {run.logs.slice(0, 4).map((log) => (
                      <div key={log} className="truncate">
                        {log}
                      </div>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title="Sources"
        description="Document-level evidence"
        actions={<Badge>{sources.length}</Badge>}
        bodyClassName="min-h-0 overflow-y-auto p-0"
      >
        {sources.length === 0 ? (
          <SmallEmpty title="No sources" description="Retrieved documents will appear here." />
        ) : (
          <div className="divide-y divide-line">
            {sources.map((source) => (
              <article key={source.source} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-ink">{source.source}</div>
                    <div className="mt-1 text-[10px] text-muted">
                      {source.category ?? 'Uncategorized'} · {source.updatedAt ?? 'no date'}
                    </div>
                  </div>
                  <Badge tone="warning">{source.chunkCount}</Badge>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-amber-500"
                    style={{ width: `${Math.min(100, source.maxScore * 20)}%` }}
                  />
                </div>
                <div className="mt-1 font-mono text-[10px] text-muted">
                  max score {source.maxScore.toFixed(2)}
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function ChunkExplorer({
  chunks,
  selectedId,
  query,
  sourceFilter,
  sources,
  onQueryChange,
  onSourceFilterChange,
  onSelect,
}: {
  chunks: KnowledgeChunk[];
  selectedId?: string;
  query: string;
  sourceFilter: string;
  sources: SourceSummary[];
  onQueryChange: (value: string) => void;
  onSourceFilterChange: (value: string) => void;
  onSelect: (id: string) => void;
}) {
  return (
    <Panel
      title="Chunk Explorer"
      description="Search retrieved evidence chunks"
      actions={<Badge>{chunks.length} visible</Badge>}
      bodyClassName="min-h-0 overflow-hidden p-0"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-white p-3">
        <label className="flex h-9 min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-line bg-panel px-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/10">
          <SearchIcon className="h-3.5 w-3.5 text-muted" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search source, content, keyword..."
            className="min-w-0 flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-muted"
          />
        </label>
        <select
          value={sourceFilter}
          onChange={(event) => onSourceFilterChange(event.target.value)}
          className="h-9 cursor-pointer rounded-lg border border-line bg-white px-3 text-xs font-medium text-muted outline-none transition-colors duration-200 hover:bg-panel focus:border-accent"
        >
          <option value="all">All sources</option>
          {sources.map((source) => (
            <option key={source.source} value={source.source}>
              {source.source}
            </option>
          ))}
        </select>
      </div>

      <div className="h-full min-h-0 overflow-y-auto">
        {chunks.length === 0 ? (
          <SmallEmpty title="No matching chunks" description="Adjust the query or source filter." />
        ) : (
          <div className="divide-y divide-line">
            {chunks.map((chunk) => (
              <button
                key={chunk.id}
                type="button"
                onClick={() => onSelect(chunk.id)}
                className={classNames(
                  'block w-full cursor-pointer p-4 text-left transition-colors duration-200 hover:bg-amber-50/50',
                  chunk.id === selectedId ? 'bg-amber-50/70' : 'bg-white',
                )}
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="truncate text-xs font-semibold text-ink">{chunk.source}</span>
                      <Badge tone="warning">chunk {chunk.chunk}</Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[10px] text-muted">
                      <span>score {chunk.score?.toFixed(2) ?? '-'}</span>
                      {chunk.retrievalDuration !== undefined && <span>{chunk.retrievalDuration}ms</span>}
                      {chunk.query && <span className="truncate">query {chunk.query}</span>}
                    </div>
                  </div>
                  <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-300" />
                </div>
                <p className="mt-3 line-clamp-3 rounded-lg border border-line bg-panel p-3 text-xs leading-5 text-muted">
                  {chunk.content}
                </p>
                {chunk.matchedKeywords && chunk.matchedKeywords.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {chunk.matchedKeywords.slice(0, 6).map((keyword) => (
                      <span
                        key={keyword}
                        className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-mono text-[9px] text-amber-700"
                      >
                        {keyword}
                      </span>
                    ))}
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

function KnowledgeDetailPanel({ chunk }: { chunk?: KnowledgeChunk }) {
  return (
    <Panel
      title="Citation Detail"
      description="Evidence used by the runtime answer"
      actions={chunk ? <Badge tone="warning">selected</Badge> : <Badge>empty</Badge>}
      bodyClassName="min-h-0 overflow-y-auto p-0"
    >
      {!chunk ? (
        <SmallEmpty title="No chunk selected" description="Select a retrieved chunk to inspect source evidence." />
      ) : (
        <div className="space-y-4 p-4">
          <section className="rounded-xl border border-line bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                  Source
                </div>
                <h2 className="mt-1 truncate text-sm font-semibold text-ink">{chunk.source}</h2>
                <p className="mt-1 text-xs text-muted">
                  {chunk.category ?? 'Uncategorized'} · {chunk.updatedAt ?? 'no update date'}
                </p>
              </div>
              <Badge tone="warning">score {chunk.score?.toFixed(2) ?? '-'}</Badge>
            </div>
          </section>

          <section className="rounded-xl border border-line bg-slate-950 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                Chunk Content
              </div>
              <span className="font-mono text-[10px] text-slate-400">chunk {chunk.chunk}</span>
            </div>
            <pre className="whitespace-pre-wrap font-mono text-xs leading-6 text-slate-100">
              {chunk.content}
            </pre>
          </section>

          <section className="rounded-xl border border-line bg-white p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
              Retrieval Metadata
            </div>
            <dl className="mt-3 space-y-2 text-xs">
              <DetailRow label="Query" value={chunk.query ?? '-'} />
              <DetailRow label="Event" value={chunk.eventId ?? '-'} />
              <DetailRow label="Duration" value={chunk.retrievalDuration === undefined ? '-' : `${chunk.retrievalDuration}ms`} />
              <DetailRow label="Keywords" value={chunk.matchedKeywords?.join(', ') ?? '-'} />
            </dl>
          </section>

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

function KnowledgeEmptyState() {
  return (
    <Card className="border-dashed border-lineStrong p-8">
      <div className="mx-auto max-w-xl text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-700">
          <KnowledgeIcon className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-base font-semibold text-ink">No retrieved knowledge yet</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Run the sales decline demo in Agent Workspace. When the runtime calls searchKnowledge,
          retrieved chunks, scores, and citation evidence will appear here.
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

interface SourceSummary {
  source: string;
  chunkCount: number;
  maxScore: number;
  category?: string;
  updatedAt?: string;
}

// This pure adapter is exported for focused data-projection tests.
// eslint-disable-next-line react-refresh/only-export-components
export function buildRetrievalRuns(events: AgentEvent[]): RetrievalRun[] {
  const ragRuns = events
    .filter((event) => event.type === 'rag_retrieve')
    .map((event) => {
      const payload = event.payload as {
        query?: unknown;
        duration?: unknown;
        documents?: unknown;
      };
      const documents = Array.isArray(payload.documents) ? payload.documents : [];
      return {
        id: event.id,
        query: typeof payload.query === 'string' ? payload.query : 'unknown query',
        timestamp: event.timestamp,
        duration: typeof payload.duration === 'number' ? payload.duration : undefined,
        documentCount: documents.length,
        logs: findToolLogs(events, event.timestamp),
      };
    });

  return ragRuns.reverse();
}

// This pure adapter is exported for focused data-projection tests.
// eslint-disable-next-line react-refresh/only-export-components
export function buildKnowledgeChunks(
  citations: CitationRecord[],
  events: AgentEvent[],
): KnowledgeChunk[] {
  const fromRagEvents = events.flatMap((event) => {
    if (event.type !== 'rag_retrieve') return [];
    const payload = event.payload as {
      query?: unknown;
      duration?: unknown;
      documents?: unknown;
    };
    if (!Array.isArray(payload.documents)) return [];

    return payload.documents.map((document, index) => {
      const item = document as {
        id?: unknown;
        content?: unknown;
        metadata?: Record<string, unknown>;
        score?: unknown;
        matchedKeywords?: unknown;
      };
      return {
        id: typeof item.id === 'string' ? item.id : `${event.id}_doc_${index + 1}`,
        source:
          typeof item.metadata?.title === 'string'
            ? item.metadata.title
            : typeof item.id === 'string'
              ? item.id
              : 'Knowledge Document',
        content: typeof item.content === 'string' ? item.content : '',
        chunk: String(index + 1),
        score: typeof item.score === 'number' ? item.score : undefined,
        category: typeof item.metadata?.category === 'string' ? item.metadata.category : undefined,
        updatedAt: typeof item.metadata?.updatedAt === 'string' ? item.metadata.updatedAt : undefined,
        query: typeof payload.query === 'string' ? payload.query : undefined,
        eventId: event.id,
        retrievalDuration: typeof payload.duration === 'number' ? payload.duration : undefined,
        matchedKeywords: Array.isArray(item.matchedKeywords)
          ? item.matchedKeywords.filter((value): value is string => typeof value === 'string')
          : undefined,
      } satisfies KnowledgeChunk;
    });
  });

  if (fromRagEvents.length > 0) return dedupeChunks(fromRagEvents);

  return citations.map((citation) => ({
    id: citation.id,
    source: citation.source,
    content: citation.content,
    chunk: String(citation.chunk ?? '-'),
    score: citation.score,
  }));
}

// This pure adapter is exported for focused data-projection tests.
// eslint-disable-next-line react-refresh/only-export-components
export function buildSourceSummaries(chunks: KnowledgeChunk[]): SourceSummary[] {
  const map = new Map<string, SourceSummary>();
  chunks.forEach((chunk) => {
    const current = map.get(chunk.source) ?? {
      source: chunk.source,
      chunkCount: 0,
      maxScore: 0,
      category: chunk.category,
      updatedAt: chunk.updatedAt,
    };
    current.chunkCount += 1;
    current.maxScore = Math.max(current.maxScore, chunk.score ?? 0);
    current.category = current.category ?? chunk.category;
    current.updatedAt = current.updatedAt ?? chunk.updatedAt;
    map.set(chunk.source, current);
  });
  return Array.from(map.values()).sort((a, b) => b.maxScore - a.maxScore);
}

// This pure adapter is exported for focused data-projection tests.
// eslint-disable-next-line react-refresh/only-export-components
export function filterChunks(
  chunks: KnowledgeChunk[],
  query: string,
  sourceFilter: string,
): KnowledgeChunk[] {
  const normalizedQuery = query.trim().toLowerCase();
  return chunks.filter((chunk) => {
    const sourceMatch = sourceFilter === 'all' || chunk.source === sourceFilter;
    const queryMatch =
      !normalizedQuery ||
      [
        chunk.source,
        chunk.content,
        chunk.query ?? '',
        chunk.category ?? '',
        ...(chunk.matchedKeywords ?? []),
      ].some((value) => value.toLowerCase().includes(normalizedQuery));
    return sourceMatch && queryMatch;
  });
}

function findToolLogs(events: AgentEvent[], timestamp: number): string[] {
  const toolEvent = [...events]
    .reverse()
    .find((event) => event.type === 'tool_success' && event.timestamp <= timestamp);
  const payload = toolEvent?.payload as
    | {
        toolName?: unknown;
        result?: { data?: { logs?: unknown } };
      }
    | undefined;
  if (payload?.toolName !== 'searchKnowledge') return [];
  const logs = payload.result?.data?.logs;
  return Array.isArray(logs) ? logs.filter((log): log is string => typeof log === 'string') : [];
}

function dedupeChunks(chunks: KnowledgeChunk[]): KnowledgeChunk[] {
  const map = new Map<string, KnowledgeChunk>();
  chunks.forEach((chunk) => {
    map.set(`${chunk.id}:${chunk.eventId ?? ''}`, chunk);
  });
  return Array.from(map.values());
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp));
}
