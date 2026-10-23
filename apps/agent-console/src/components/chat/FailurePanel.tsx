import { useEffect, useState } from 'react';
import { Badge } from '../ui';
import type { ToolCallRecord } from '../../types/agent';

interface FailurePanelProps {
  tool: ToolCallRecord;
  onRetry: (args: Record<string, unknown>) => void;
  disabled?: boolean;
}

/**
 * Failure is an actionable state, not just a red banner: the user sees which
 * step failed, edits the tool arguments, and re-runs only that step.
 */
export function FailurePanel({ tool, onRetry, disabled }: FailurePanelProps) {
  const [draft, setDraft] = useState(() => serializeArgs(tool.args));
  const [error, setError] = useState<string>();

  useEffect(() => {
    setDraft(serializeArgs(tool.args));
    setError(undefined);
  }, [tool.id, tool.args]);

  const message = readErrorMessage(tool.result) ?? '工具执行失败';

  function handleRetry() {
    try {
      const parsed = JSON.parse(draft) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('参数必须是一个 JSON 对象');
      }
      setError(undefined);
      onRetry(parsed as Record<string, unknown>);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : '';
      setError(detail ? `参数不是合法的 JSON：${detail}` : '参数不是合法的 JSON');
    }
  }

  return (
    <div className="mb-1 rounded-lg border border-rose-200 bg-rose-50/70 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-rose-800">
            这一步失败了 · {tool.name}
          </div>
          <p className="mt-1 text-[11px] leading-5 text-rose-700">{message}</p>
        </div>
        <Badge tone="danger" className="shrink-0 px-1.5 py-0.5 text-[10px]">
          第 {tool.attemptNo ?? 1} 次尝试
        </Badge>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-rose-700/70">
          工具参数
        </span>
        <button
          type="button"
          onClick={() => {
            setDraft(serializeArgs(tool.args));
            setError(undefined);
          }}
          className="text-[10px] font-medium text-rose-700/80 hover:text-rose-900"
        >
          恢复原始参数
        </button>
      </div>
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        disabled={disabled}
        rows={3}
        spellCheck={false}
        className="mt-1 w-full resize-y rounded-md border border-rose-200 bg-white p-2 font-mono text-[11px] leading-5 text-ink outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 disabled:opacity-60"
      />
      {error ? <p className="mt-1 text-[10px] text-rose-700">{error}</p> : null}

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[10px] leading-4 text-rose-700/80">
          只重跑这一步，已完成的步骤不会重复执行。
        </p>
        <button
          type="button"
          onClick={handleRetry}
          disabled={disabled}
          className="inline-flex h-6 shrink-0 cursor-pointer items-center rounded-md border border-rose-500 bg-rose-500 px-2.5 text-[10px] font-semibold text-white transition-colors duration-200 hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          重试此步
        </button>
      </div>
    </div>
  );
}

function serializeArgs(args: Record<string, unknown> | undefined): string {
  try {
    return JSON.stringify(args ?? {}, null, 2);
  } catch {
    return '{}';
  }
}

function readErrorMessage(result: unknown): string | undefined {
  if (typeof result === 'string') return result;
  if (result && typeof result === 'object') {
    const record = result as { message?: unknown; error?: unknown };
    if (typeof record.message === 'string') return record.message;
    if (typeof record.error === 'string') return record.error;
    if (record.error && typeof record.error === 'object') {
      const nested = record.error as { message?: unknown };
      if (typeof nested.message === 'string') return nested.message;
    }
  }
  return undefined;
}
