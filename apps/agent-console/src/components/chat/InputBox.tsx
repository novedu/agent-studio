import { FormEvent, useRef, useState, type KeyboardEvent } from 'react';
import { PlayIcon, StopIcon } from '@console/components/ui';
import { useRuntimeModelLabel } from '../../features/agent-console/runtime-overview';
import { useAgentStore } from '../../store/agentStore';

interface InputBoxProps {
  disabled?: boolean;
  onSubmit: (value: string) => void;
  onStop?: () => void;
  onRegenerate?: () => void;
}

export function InputBox({ disabled, onSubmit, onStop, onRegenerate }: InputBoxProps) {
  const runtimeProvider = useAgentStore((state) => state.runtimeProvider);
  const modelLabel = useRuntimeModelLabel();
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  function submit() {
    const nextValue = value.trim();
    if (!nextValue || disabled) return;
    onSubmit(nextValue);
    setValue('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter breaks the line. `isComposing` keeps Chinese IME
    // candidate selection from submitting the message mid-word.
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submit();
  }

  function handleChange(next: string) {
    setValue(next);
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-line bg-white">
      <div className="px-3 pt-2 pb-1.5">
        <div className="flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1.5 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/10">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => handleChange(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            rows={1}
            placeholder="Ask the agent anything...  (Enter 发送 / Shift+Enter 换行)"
            className="min-h-5 max-h-[120px] flex-1 resize-none bg-transparent text-xs outline-none placeholder:text-muted"
          />
          {disabled ? (
            <button
              type="button"
              onClick={onStop}
              className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md bg-rose-500 text-white transition-colors duration-200 hover:bg-rose-600"
              aria-label="Stop generation"
            >
              <StopIcon className="h-3 w-3" />
            </button>
          ) : (
            <>
              {onRegenerate && (
                <button
                  type="button"
                  onClick={onRegenerate}
                  className="hidden h-6 cursor-pointer items-center rounded-md border border-line bg-white px-2 text-[10px] font-semibold text-muted transition-colors duration-200 hover:border-blue-200 hover:bg-blue-50 hover:text-accent sm:inline-flex"
                >
                  Regenerate
                </button>
              )}
              <button
                type="submit"
                className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md bg-accent text-white transition-colors duration-200 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!value.trim()}
                aria-label="Send task"
              >
                <PlayIcon className="h-3 w-3" />
              </button>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between px-3 pb-2">
        <div className="flex items-center gap-1.5 text-[9px] text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span>Real SSE runtime</span>
          {runtimeProvider === 'mock' ? (
            <span
              title="No model API key configured - answers are rendered from local templates"
              className="rounded bg-amber-100 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] text-amber-700"
            >
              Mock
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-muted">Model</span>
          <span className="inline-flex h-5 items-center gap-1 rounded border border-line bg-white px-1.5 text-[10px] font-medium text-ink">
            <span>{modelLabel}</span>
          </span>
        </div>
      </div>
    </form>
  );
}
