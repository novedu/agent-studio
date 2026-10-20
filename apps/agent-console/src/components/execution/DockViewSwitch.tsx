import { classNames } from '../ui/classNames';

export type DockView = 'graph' | 'timeline';

const OPTIONS: Array<{ value: DockView; label: string }> = [
  { value: 'graph', label: 'Graph' },
  { value: 'timeline', label: 'Timeline' },
];

/**
 * Switches the runtime dock between the dependency graph and the debug
 * timeline. Both views read the same runtime objects and share the same
 * selection, so switching never loses context — only the rendering changes.
 */
export function DockViewSwitch({
  value,
  onChange,
}: {
  value: DockView;
  onChange: (next: DockView) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-line bg-white p-0.5">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={classNames(
            'h-5 cursor-pointer rounded px-2 text-[10px] font-semibold transition-colors duration-200',
            value === option.value
              ? 'bg-blue-50 text-blue-700'
              : 'text-muted hover:bg-panel hover:text-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
