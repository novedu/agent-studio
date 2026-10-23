import { Panel, StatusTag } from '../ui';
import { classNames } from '../ui/classNames';
import type { ExecutionStepRow } from './execution-model';

interface ExecutionStepsProps {
  steps: ExecutionStepRow[];
  activeStepId?: string;
  onSelect: (step: ExecutionStepRow) => void;
  onStart?: () => void;
}

/**
 * Default dock view: the plan as a readable list. Status, duration and attempts
 * come first; the graph is still one click away.
 */
export function ExecutionSteps({ steps, activeStepId, onSelect, onStart }: ExecutionStepsProps) {
  return (
    <Panel
      title="Execution Steps"
      description="Plan steps, status, duration and attempts"
      className="h-full rounded-none border-0 shadow-none"
      bodyClassName="min-h-0 overflow-hidden p-0"
      actions={
        <span className="font-mono text-[10px] text-muted">
          {steps.length} step{steps.length === 1 ? '' : 's'}
        </span>
      }
    >
      {steps.length === 0 ? (
        <div className="flex h-full min-h-0 items-center justify-center p-6 text-center">
          <div>
            <div className="text-xs font-semibold text-ink">No plan yet</div>
            <p className="mt-1 text-[10px] text-muted">Start a task to see its steps and attempts here.</p>
            {onStart ? (
              <button
                type="button"
                onClick={onStart}
                className="mt-3 inline-flex h-7 cursor-pointer items-center rounded-md border border-accent bg-accent px-3 text-[10px] font-semibold text-white transition-colors duration-200 hover:bg-blue-700"
              >
                Run full demo
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="h-full min-h-0 overflow-y-auto px-3 py-2">
          <div className="space-y-1.5">
            {steps.map((step) => {
              const active = step.id === activeStepId;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => onSelect(step)}
                  className={classNames(
                    'w-full cursor-pointer rounded-lg border px-3 py-2 text-left transition-colors duration-150',
                    active
                      ? 'border-blue-200 bg-blue-50/60'
                      : 'border-line bg-white hover:border-lineStrong hover:bg-panel',
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className={classNames(
                        'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border font-mono text-[9px] font-semibold',
                        active
                          ? 'border-blue-300 bg-white text-blue-700'
                          : 'border-line bg-panel text-muted',
                      )}
                    >
                      {step.order}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <span className="truncate text-xs font-semibold text-ink">{step.description}</span>
                        <span className="shrink-0">
                          <StatusTag status={step.status === 'waiting' ? 'pending' : step.status} />
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 font-mono text-[10px] text-muted">
                        <span>{step.tool}</span>
                        {step.duration !== undefined ? <span>{formatDuration(step.duration)}</span> : null}
                        {step.attempts.length > 1 ? (
                          <span>{step.attempts.length} attempts</span>
                        ) : null}
                        {step.attempts.length > 0 ? (
                          <span className="flex items-center gap-1.5">
                            {step.attempts.map((attempt) => (
                              <span
                                key={attempt.attemptNo}
                                className={
                                  attempt.status === 'failed'
                                    ? 'text-rose-700'
                                    : attempt.status === 'success'
                                      ? 'text-emerald-700'
                                      : 'text-muted'
                                }
                              >
                                #{attempt.attemptNo} {attempt.status}
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </div>
                      {step.error ? (
                        <p
                          className={classNames(
                            'mt-1 line-clamp-2 text-[10px] leading-4',
                            step.status === 'failed' ? 'text-rose-700' : 'text-amber-700',
                          )}
                        >
                          {step.status === 'failed' ? step.error : `Recovered: ${step.error}`}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Panel>
  );
}

function formatDuration(value?: number): string {
  if (value === undefined) return '—';
  if (value < 1000) return `${value}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}
