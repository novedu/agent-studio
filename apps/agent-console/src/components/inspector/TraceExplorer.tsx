import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import type { AgentEvent } from '../../types/agent';
import { Badge, Skeleton } from '../ui';
import { classNames } from '../ui/classNames';
import { InspectorEmpty } from './InspectorEmpty';

interface TraceExplorerProps {
  events: AgentEvent[];
  isLoading: boolean;
  highlightedTraceId?: string;
  onSelectEvent?: (event: AgentEvent) => void;
}

export function TraceExplorer({
  events,
  isLoading,
  highlightedTraceId,
  onSelectEvent,
}: TraceExplorerProps) {
  const [expandedId, setExpandedId] = useState<string>();
  const highlightedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlightedTraceId) setExpandedId(highlightedTraceId);
    window.setTimeout(() => {
      highlightedRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 80);
  }, [highlightedTraceId]);

  if (isLoading && events.length === 0) return <Skeleton lines={7} />;
  if (events.length === 0) {
    return <InspectorEmpty title="No events captured" description="Runtime events appear as they arrive." />;
  }

  return (
    <div className="space-y-1">
      {events.slice(-20).map((event, index, list) => {
        const isExpanded = expandedId === event.id;
        const payload = toRecord(event.payload);
        return (
          <div
            key={event.id}
            ref={event.id === highlightedTraceId ? highlightedRef : undefined}
            className={classNames(
              'relative rounded-md pl-5 transition-colors duration-200',
              event.id === highlightedTraceId && 'bg-blue-50',
            )}
          >
            {index < list.length - 1 && (
              <span className="absolute bottom-0 left-1.5 top-5 w-px bg-lineStrong" />
            )}
            <span className="absolute left-0 top-2 h-3 w-3 rounded-full border-2 border-blue-400 bg-white" />
            <button
              type="button"
              onClick={() => {
                setExpandedId(isExpanded ? undefined : event.id);
                onSelectEvent?.(event);
              }}
              className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left transition-colors duration-200 hover:bg-panel"
            >
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold text-ink">{event.type}</div>
                <div className="mt-0.5 text-[10px] text-muted">{formatTime(event.timestamp)}</div>
              </div>
              <Badge tone={getEventTone(event.type)}>{index + 1}</Badge>
            </button>
            {isExpanded && (
              <motion.pre
                className="mb-2 max-h-40 overflow-auto rounded-md bg-slate-950 p-2 text-[10px] leading-5 text-slate-100"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                transition={{ duration: 0.18 }}
              >
                {JSON.stringify({ id: event.id, type: event.type, payload }, null, 2)}
              </motion.pre>
            )}
          </div>
        );
      })}
    </div>
  );
}

function getEventTone(type: string): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
  if (type.includes('error') || type.includes('failed')) return 'danger';
  if (type.includes('tool')) return 'warning';
  if (type.includes('complete') || type.includes('success')) return 'success';
  return 'info';
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
