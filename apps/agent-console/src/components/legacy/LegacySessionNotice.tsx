import { Link } from 'react-router-dom';

/**
 * Knowledge / Memory / Evaluation used to be top-level destinations. They are
 * now run-scoped; this notice keeps old deep links honest instead of silently
 * showing a "current session" view that looks global.
 */
export function LegacySessionNotice({ view }: { view: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
      <span>
        {view} is now reviewed inside a specific run. Open a run to see Evidence / Memory / Quality in context.
      </span>
      <Link to="/runs" className="shrink-0 font-semibold underline underline-offset-2">
        Browse runs
      </Link>
    </div>
  );
}
