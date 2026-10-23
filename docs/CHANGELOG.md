# Changelog

## 2026-10

- Replaced the front-end failure replay with a real server-side tool error. The failed step can be retried with corrected arguments without re-running completed steps.
- Added Run / Step / Attempt records. Each attempt keeps its arguments, status, duration and error.
- Persisted tasks and events to `.data/`; added `/runs` and a read-only run detail page.
- Converged navigation to Agent and Runs. Knowledge, Memory and Quality now live in run detail tabs.
- Added a task header with goal, status, model, step progress, failure line and a run detail link.
- Made Execution Steps the default dock view. Graph and Timeline remain available.
- Removed the high-risk `slow_query` tool from the production registry. The permission and risk guardrails are still tested with a test-only tool.
- Added per-run provider/model identity to `/health` and task snapshots.
- Labeled evaluation as rule-based, not an LLM judge.
- Rewrote the README and removed generated product, design, UX and roadmap documents. Replaced the old screenshots and demo GIF.
