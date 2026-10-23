# Agent Studio UX Specification

## Scope

This document defines how users move through Agent Studio, how screens change state, and how runtime objects synchronize across the workspace.

## Navigation Principle

Default entry:

```text
/agent
```

Navigation priority:

1. Agent Workspace (live task)
2. Runs (persisted history → Run Detail)

Sidebar footer:

- About & limits (`/settings`)
- Documentation (GitHub README)

Knowledge, Memory and Evaluation are no longer top-level destinations: they are tabs in a specific run (`/runs/:taskId` → Evidence / Memory / Quality). Workflow redirects to Agent because it duplicated the plan/graph. The legacy `/knowledge`, `/memory` and `/evaluation` deep links still render with a deprecation notice.

## Screen Blueprint

### Agent Workspace

Purpose: run, observe, and debug one runtime task.

Contains:

- Chat
- Runtime Header
- Runtime Graph
- Timeline
- Inspector
- Evidence Navigation

### Runs

Purpose: persisted run history and entry point to Run Detail.

Contains:

- Current Runtime spotlight (live session)
- Recent Tasks (persisted, opens `/runs/:taskId`)
- Failure Review (failed/cancelled runs)
- Totals: total / completed / failed / running

Model, token and cost figures are only shown when the runtime actually reports them; there is no invented usage data.
- Latency

### Knowledge Center

Purpose: inspect knowledge sources and retrieved evidence.

Contains:

- Documents
- Chunks
- Retriever
- Embedding status
- Citation search

### Memory Center

Purpose: inspect working, semantic, and episodic memory.

Contains:

- Working Memory
- Semantic Memory
- Episodic Memory
- Memory Timeline
- Memory Graph

### Evaluation Center

Purpose: review quality, regressions, and comparisons.

Contains:

- Leaderboard
- Score trend
- Evaluation history
- Dataset
- Regression review

### Workflow Builder

Purpose: future workflow authoring.

Contains:

- Planner graph
- Workflow graph
- Node and edge editing
- Branch / loop preview

### Settings

Purpose: engineering configuration.

Contains:

- Model provider
- Environment
- Runtime config
- Feature flags

## Runtime State Model

Every runtime interaction is driven by one selected runtime object.

```text
SelectedRuntimeObject
```

Possible values:

- Planner
- Workflow
- Tool
- Knowledge
- Memory
- Reflection
- Evaluation
- Answer
- Trace
- Log

Any click in Graph, Timeline, Inspector, Drawer, Knowledge, Memory, Evaluation, Trace, or Logs must update this object.

## Workspace Flow

Workspace order:

```text
Chat
↓
Runtime Graph
↓
Debug Timeline
↓
Evidence
```

Chat is always primary.
Execution explains runtime behavior.
Evidence supports interpretation and debugging.

## v4 IDE Workspace Rules

The Agent Workspace must feel like an IDE runtime surface, not a dashboard.

Core regions:

- Task Workspace: primary editor-like surface
- Runtime Graph: compact dependency canvas
- Debug Timeline: docked runtime trace
- Inspector: selected runtime object details

Interaction priority:

```text
Chat drives the task
Graph explains dependencies
Timeline proves execution order
Inspector explains the selected runtime object
```

Idle state should still communicate runtime readiness. Do not show large empty canvases.

## Runtime UX States

### Idle

Goal: help the user start a task.

Visible:

- Welcome
- Quick Start
- Templates
- Recent Tasks

Hidden or de-emphasized:

- Runtime Graph
- Timeline
- Detailed Inspector content

### Running

Goal: show active execution.

Visible:

- Streaming answer
- Current step
- Runtime Graph
- Timeline
- Inspector

### Completed

Goal: review the result.

Visible:

- Final answer
- Evidence
- Evaluation
- Trace
- Export

### Failed

Goal: debug and recover.

Visible:

- Failed step
- Logs
- Trace
- Retry
- Diagnostics

## Interaction Rules

- Timeline click updates the selected runtime object and highlights the matching graph node.
- Graph click updates the selected runtime object and opens the drawer when needed.
- Citation click scrolls and highlights the matching knowledge chunk.
- Memory click highlights the related chat message.
- Evaluation click opens the trace or the relevant runtime object.
- Trace click should synchronize graph, timeline, drawer, and inspector.

## Evidence Navigation

Navigation must feel like a linked runtime debugger, not separate panels.

```text
Citation → Knowledge chunk
Memory → Chat message
Evaluation → Runtime event
Trace → Graph / Timeline / Drawer
```

## Loading and Empty States

Idle and loading states must be intentional.

- Never show generic "Loading..." text alone.
- Use skeletons for panels.
- Use welcome / quick start content for idle.
- Avoid empty shells with no action.

## Accessibility

Required:

- Keyboard navigation
- Visible focus state
- ESC close behavior for modal surfaces
- ARIA labels
- Reduced motion support
- Predictable tab order

## Responsive Behavior

Supported breakpoints:

```text
1024 / 1200 / 1440 / 1600 / 1920
```

Rules:

- No overlapping panels
- No page-level scroll
- No chat collapse
- No double scroll regions
- Graph and timeline must remain legible
