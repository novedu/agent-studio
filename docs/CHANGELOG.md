# Changelog

All notable Agent Studio changes will be documented here.

## Unreleased - Density and graph fit pass

- `Runtime Graph` now fits its content for real: scale is derived from the viewport and the graph bounding box (`graph-fit.ts`), instead of the previous hard-coded 86%. The scroll area matches the scaled content, so nodes can no longer be clipped out of reach, and drag-to-pan moves the viewport instead of a CSS offset.
- Auto-fit stops as soon as the user pans or zooms, so the viewport never fights the user.
- The runtime dock grew from `clamp(340px, 44vh, 420px)` to `clamp(360px, 50vh, 460px)`.
- Idle state: five full-size signal cards collapse into one compact chip strip, reclaiming roughly 300px of vertical space.
- Inspector headline numbers: `Step` gets its own row, so long step names no longer wrap into the number row.
- Telemetry chart renders a "No events yet" hint instead of a fake 0-1 axis before the first event.
- Added a render smoke test for `ExecutionGraph` (which also surfaced a missing `Element.scrollTo` fallback for environments without it).

## Unreleased - Pinned telemetry

- The telemetry chart now sits above the inspector body instead of inside the empty state, so it stays visible after a task starts and an object gets selected.
- Added a regression assertion: the chart must render in the object-inspection view as well.

## Unreleased - Inspector density pass

- The default inspector is now three blocks: headline numbers (step / progress / eval), the telemetry chart, and two collapsed sections.
- `Runtime Context` and `Runtime Path` moved behind disclosure. Nothing was removed, only re-tiered.
- Removed duplicated fields: `Model` / `Environment` now appear only in the top bar; event and tool counts no longer repeat in the inspector footer.
- Added a regression test for the quiet default state and on-demand disclosure.

## Unreleased - Runtime telemetry

- Added a live event-rate chart to the Runtime Inspector, fed by the existing SSE event stream.
- Added `EventRateMeter` (incremental one-second buckets in a capped ring buffer) with unit tests.
- Added frame-gated painting: one store subscription, at most one paint per animation frame, paused while the tab is hidden.
- Code-split the chart so the console's first-screen chunk drops from 699 kB to 200 kB (226 kB to 56 kB gzip).
- Added `scripts/bench-event-rate.ts` and `docs/PERFORMANCE.md` with measured numbers and limitations.

## Unreleased - Documentation refinement

- Reworked the README opening: Chinese one-liner first, real console screenshot as the hero, capabilities up front.
- Moved the animated diagram out of the first screen into the screenshot section, labeled as a diagram rather than a product recording.
- Removed self-referential "built for interviews" framing from README, package.json, and docs.
- Moved internal interview notes out of the repository and removed superseded archive specifications.
- Recompressed the demo GIF (2.6 MB to about 52 KB).

## Agent Studio 2.0

Status: completed.

Implemented:

- Established `/agent` as the demo center.
- Added demo-ready task entry for `分析华东销售下降原因，并生成报告`.
- Connected the Agent Workspace to real SSE task execution.
- Added RuntimeObject-driven synchronization across Chat, Graph, Timeline, Inspector, and Drawer.
- Added Chat Runtime Summary with Plan, Tool, Knowledge, Memory, Reflection, Evaluation, and Answer segments.
- Added compact Runtime Graph idle preview.
- Added Debug Timeline filter and search interactions.
- Added object-driven Runtime Inspector templates.
- Added true Stop and Regenerate chat controls.
- Validated lint, test, build, POST task creation, SSE event flow, and task status query.

Planning update:

- Added a demo-first roadmap that prioritizes `/agent` over broad enterprise platform work.
- Deferred RBAC, SSO, audit, billing, deployment, and team workspace to Agent Studio 3.0.
- Defined Phase 2 as Runtime Deepening instead of expanding placeholder pages first.

## Phase 2: Runtime Deepening

Status: completed.

Implemented:

- Added frontend RuntimeObject schema fields for trace, span, parent, dependency, child, lifecycle, token, retry, and cost projection.
- Added RuntimeSpan projection for Timeline and Drawer.
- Added Debug Timeline trace summary and span relationship details.
- Added Timeline search coverage for trace id, span id, parent id, and dependency ids.
- Added dependency context sections to Runtime Inspector.
- Added Planner and Workflow-specific Inspector templates.
- Added Drawer trace and metadata tabs with dependency information.
- Added UI-level SSE demo playback pacing with an environment opt-out.
- Added `docs/architecture/runtime-object.md`.

## Phase 3: Dashboard Productization

Status: implemented.

Implemented:

- Added `docs/archive/phases/PHASE3_DASHBOARD.md`.
- Rebuilt `/dashboard` as a runtime overview instead of a placeholder.
- Added typed task history API adapter for `GET /api/agent/tasks`.
- Added typed retry adapter for `POST /api/agent/tasks/:taskId/retry`.
- Added Runtime Overview header with server connection state, environment, and model.
- Added Current Runtime spotlight linked to Agent Workspace.
- Added truthful task metrics from runtime task history.
- Added Recent Tasks panel with status, progress, retry count, current step, and error display.
- Added Failure Review panel with real retry action when retry is available.
- Added Runtime Signals panel for current-session events, tools, knowledge, memory, and evaluation.
- Avoided fabricated historical evaluation, token, cost, and latency metrics.

## Phase 4: Knowledge Platform

Status: implemented.

Implemented:

- Added `docs/archive/phases/PHASE4_KNOWLEDGE.md`.
- Replaced `/knowledge` placeholder with a real Knowledge Center.
- Added current-session RAG retrieval run view.
- Added source summary panel.
- Added searchable and filterable chunk explorer.
- Added citation detail panel with source, score, chunk content, query, event id, duration, and matched keywords.
- Derived Knowledge data from existing `citations` and `rag_retrieve` / `searchKnowledge` events without changing Store or backend contracts.
- Added Agent Workspace navigation for evidence inspection.
- Avoided fake upload, embedding, vector DB, and historical citation features.

## Phase 5: Memory Platform

Status: implemented.

Implemented:

- Added `docs/archive/phases/PHASE5_MEMORY.md`.
- Replaced `/memory` placeholder with a real Memory Center.
- Added current-session memory write timeline.
- Added Working, Episodic, and Semantic memory grouping.
- Added searchable and filterable Memory Explorer.
- Added Memory Detail panel with memory type, content, importance, task id, event id, update time, and related message when detectable.
- Derived Memory data from existing `memory`, `messages`, and `memory_update` events without changing Store or backend contracts.
- Added Agent Workspace navigation for runtime inspection.
- Avoided fake persistent memory database, memory editing, vector search, and cross-task history features.

## Phase 6: Evaluation Platform

Status: implemented.

Implemented:

- Added `docs/archive/phases/PHASE6_EVALUATION.md`.
- Replaced `/evaluation` placeholder with a real Evaluation Center.
- Added current-run quality scorecard.
- Added criteria breakdown for completeness, accuracy, groundedness, and task completion.
- Added feedback review panel with runtime context.
- Added evaluator lifecycle trace from `evaluation_start` and `evaluation_complete` events.
- Added regression readiness panel that clearly marks history-backed analytics as future work.
- Derived Evaluation data from existing `evaluation`, `events`, `messages`, `tools`, `citations`, and `memory` without changing Store or backend contracts.
- Avoided fake historical trends, leaderboards, datasets, and compare-runs.

## Phase 7: Workflow Builder

Status: implemented.

Implemented:

- Added `docs/archive/phases/PHASE7_WORKFLOW.md`.
- Replaced `/workflow` placeholder with a real Workflow Center.
- Added read-only Planner dependency graph.
- Added Step Explorer for Planner steps.
- Added step-to-runtime-object mapping.
- Added Workflow Detail with Planner goal, selected step, step definition JSON, and runtime mapping JSON.
- Added Workflow Events panel from current runtime events.
- Derived Workflow data from existing `plan`, `workflow`, `events`, `tools`, `citations`, `evaluation`, and `messages` without changing Store or backend contracts.
- Avoided fake drag-and-drop editing, workflow persistence, branch editing, loop editing, and deployment features.

## Phase 8: Enterprise Platform

Status: implemented as enterprise readiness surface.

Implemented:

- Added `docs/archive/phases/PHASE8_ENTERPRISE.md`.
- Replaced `/settings` placeholder with a real enterprise readiness Settings page.
- Added runtime connection inspection from frontend environment configuration.
- Added SSE contract view for supported Agent Server events.
- Added current session signal summary.
- Added enterprise readiness matrix for available, partial, and planned capabilities.
- Added security boundary section to prevent over-claiming RBAC, SSO, audit, deployment, or secret management.
- Derived Settings data from existing frontend configuration and Zustand state without changing Store or backend contracts.
- Avoided fake identity, role, audit, API key, deployment, billing, and monitoring features.

## Demo Polish

Status: implemented.

Implemented:

- Added root `README.md` with product positioning, architecture, routes, demo flow, setup, verification, and capability boundaries.
- Added `docs/DEMO_SCRIPT.md` for demo recordings and walkthroughs.
- Clarified that Agent Studio is an Enterprise Agent Runtime Studio MVP, not a fully production-ready enterprise AI platform.

## Milestone 3: Engineering Quality

Status: implemented.

Implemented:

- Added focused tests for RuntimeObject relationships and lifecycle projection.
- Added Event Projection coverage for RAG citations, memory updates, tool failure, and retry state.
- Added Knowledge and Memory derived-view tests.
- Added Timeline execution-model tests for retry recovery, status, and progress.
- Added server-rendered Runtime Inspector coverage for object-specific sections.
- Added `GET /health` verification and Settings connectivity detection.
- Added `npm run dev:all` with graceful shutdown for the Runtime Server and React Console.
- Added route-level code splitting to remove the initial Vite chunk warning.
- Added root `CHANGELOG.md`, `CONTRIBUTING.md`, and `LICENSE` entry points.

## Agent Studio 2.1

Planned:

- Knowledge Center
- Document viewer
- Chunk viewer
- Retriever inspection
- Embedding status
- Citation search

## Agent Studio 2.2

Planned:

- Memory Center
- Working Memory
- Semantic Memory
- Episodic Memory
- Memory Timeline
- Memory Graph

## Agent Studio 2.3

Planned:

- Evaluation Center
- Leaderboard
- Evaluation History
- Score Trend
- Dataset
- Regression review
- Failure analysis

## Agent Studio 2.4

Planned:

- Workflow Builder
- Planner Graph
- Workflow Graph
- Node and edge model
- Branch and loop visualization

## Agent Studio 3.0

Planned:

- Enterprise AI Platform
- MCP
- Deployment
- Model Provider
- Prompt Experiment
- Team, permission, audit
