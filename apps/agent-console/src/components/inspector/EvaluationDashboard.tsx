import type { EvaluationResult } from '../../types/agent';
import { Badge, Button, Skeleton } from '../ui';
import { InspectorEmpty } from './InspectorEmpty';

interface EvaluationDashboardProps {
  evaluation?: EvaluationResult;
  isLoading: boolean;
  runtimeDuration?: number;
  runtimeTokens?: number;
  runtimeCost?: number;
  onViewTrace?: () => void;
}

const criteria = [
  ['accuracy', 'Accuracy'],
  ['groundedness', 'Groundedness'],
  ['completeness', 'Completeness'],
  ['taskCompletion', 'Task Completion'],
] as const;

export function EvaluationDashboard({
  evaluation,
  isLoading,
  runtimeDuration,
  runtimeTokens,
  runtimeCost,
  onViewTrace,
}: EvaluationDashboardProps) {
  if (isLoading && !evaluation) return <Skeleton lines={8} />;
  if (!evaluation) {
    return <InspectorEmpty title="No evaluation yet" description="Quality metrics appear after completion." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 rounded-xl border border-line bg-panel p-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
            Overall Score
          </div>
          <div className="mt-1 text-3xl font-semibold text-ink">
            {Math.round(evaluation.score * 100)}
          </div>
          <div className="mt-0.5 text-[9px] text-muted">Rule-based heuristic, not an LLM judge</div>
        </div>
        <Badge tone={evaluation.score >= 0.8 ? 'success' : 'warning'}>
          {evaluation.score >= 0.8 ? 'Strong' : 'Review'}
        </Badge>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Metric label="Latency" value={formatDuration(runtimeDuration)} />
        <Metric label="Tokens" value={runtimeTokens ? runtimeTokens.toLocaleString() : '-'} />
        <Metric label="Cost" value={runtimeCost === undefined ? '-' : `$${runtimeCost.toFixed(4)}`} />
      </div>
      <div className="grid gap-3">
        {criteria.map(([key, label]) => {
          const value = evaluation.criteria[key];
          return (
            <div key={key}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-muted">{label}</span>
                <span className="font-mono font-medium text-ink">{Math.round(value * 100)}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-slate-700 transition-[width] duration-200"
                  style={{ width: `${value * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-dashed border-lineStrong bg-panel p-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
            Criteria Radar
          </div>
          <div className="mx-auto mt-3 flex h-20 w-20 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-xs font-semibold text-blue-700">
            Radar
          </div>
        </div>
        <div className="rounded-xl border border-dashed border-lineStrong bg-panel p-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
            Score Trend
          </div>
          <div className="mt-3 flex h-20 items-end gap-1">
            {criteria.map(([key]) => (
              <div key={key} className="flex-1 rounded-t bg-teal-200" style={{ height: `${evaluation.criteria[key] * 100}%` }} />
            ))}
          </div>
        </div>
      </div>
      <div className="space-y-2">
        {evaluation.feedback.map((item, index) => (
          <p key={`${item}_${index}`} className="rounded-md border border-line bg-panel p-2 text-xs text-muted">
            {item}
          </p>
        ))}
      </div>
      <Button variant="ghost" size="sm" onClick={onViewTrace} className="w-full">
        View related trace
      </Button>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</div>
      <div className="mt-1 truncate font-mono text-xs font-semibold text-ink">{value}</div>
    </div>
  );
}

function formatDuration(duration?: number): string {
  if (duration === undefined) return 'pending';
  return duration >= 1000 ? `${(duration / 1000).toFixed(1)}s` : `${duration}ms`;
}
