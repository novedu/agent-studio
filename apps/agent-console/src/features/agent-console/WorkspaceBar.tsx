import { Link } from 'react-router-dom';
import { Badge, StatusTag } from '@console/components/ui';
import { classNames } from '@console/components/ui/classNames';

interface WorkspaceBarProps {
  goal?: string;
  status: string;
  modelLabel: string;
  progress: number;
  completedSteps: number;
  totalSteps: number;
  retryCount: number;
  maxRetry: number;
  duration?: number;
  failure?: {
    stepId?: string;
    tool?: string;
    message?: string;
  };
  taskId?: string | null;
  onCancel: () => void;
}

/**
 * The task-specific header: full goal, status, model, step progress and the
 * failure line live above the chat, so the first screen answers "which task,
 * how far, did it fail" without reading the graph.
 */
export function WorkspaceBar({
  goal,
  status,
  modelLabel,
  progress,
  completedSteps,
  totalSteps,
  retryCount,
  maxRetry,
  duration,
  failure,
  taskId,
  onCancel,
}: WorkspaceBarProps) {
  const displayStatus = status === 'error' ? 'failed' : status;
  const tint =
    status === 'error'
      ? 'border-rose-200 bg-rose-50/70'
      : status === 'success'
        ? 'border-emerald-200 bg-emerald-50/50'
        : 'border-line bg-white';

  return (
    <header className={classNames('shrink-0 border-b', tint)}>
      <div className="flex min-w-0 items-center gap-3 px-3 py-2">
        <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted">
          Run
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-xs font-semibold text-ink" title={goal}>
              {goal ?? 'No task yet'}
            </span>
            <StatusTag status={displayStatus} />
            <Badge tone="neutral" className="shrink-0 px-1.5 py-0.5 text-[9px]">
              {modelLabel}
            </Badge>
          </div>

          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[10px] text-muted">
            <span>
              {completedSteps}/{totalSteps} steps · {progress}%
            </span>
            <span>
              retry {retryCount}/{maxRetry}
            </span>
            <span>{formatDuration(duration)}</span>
            {failure ? (
              <span className="min-w-0 truncate text-rose-700">
                step {failure.stepId ?? '?'} · {failure.tool ?? 'tool'}
                {failure.message ? ` · ${failure.message}` : ''}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {status === 'running' ? (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-6 cursor-pointer items-center rounded-md border border-rose-300 bg-white px-2 text-[10px] font-semibold text-rose-700 transition-colors duration-200 hover:bg-rose-50"
            >
              Cancel
            </button>
          ) : null}
          {taskId && status !== 'running' && status !== 'idle' ? (
            <Link
              to={`/runs/${taskId}`}
              className="inline-flex h-6 items-center rounded-md border border-line bg-white px-2 text-[10px] font-semibold text-muted transition-colors duration-200 hover:border-blue-200 hover:text-accent"
            >
              Run detail
            </Link>
          ) : null}
        </div>
      </div>

      <div className="h-0.5 bg-line/70">
        <div
          className={classNames(
            'h-full transition-[width] duration-300',
            status === 'error' ? 'bg-rose-500' : status === 'success' ? 'bg-emerald-500' : 'bg-accent',
          )}
          style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
        />
      </div>
    </header>
  );
}

function formatDuration(value?: number): string {
  if (value === undefined) return '—';
  if (value < 1000) return `${value}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}
