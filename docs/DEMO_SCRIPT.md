# Agent Studio Demo Script

Use this script for demos, screen recordings, and project walkthroughs.

## Demo Goal

Show that Agent Studio is not an AI chat demo. It is an Agent Runtime Studio.

The viewer should understand:

```text
User asks a business question.
Agent plans.
Agent executes tools.
Agent retrieves knowledge.
Agent writes memory.
Agent reflects.
Agent evaluates.
Studio explains every step.
```

## Setup

Start Runtime Server:

```bash
npm run server
```

Start React Console:

```bash
npm --prefix apps/agent-console run dev
```

Open:

```text
http://127.0.0.1:5173/agent
```

Primary input:

```text
分析华东区域销售下降原因，并生成报告
```

## 3-Minute Demo

Audience: non-technical listener (recruiter or first-round screener).

### 0:00-0:30 Positioning

Say:

```text
This is an AI Agent Runtime Studio. It is designed to show how an agent plans, executes tools, retrieves knowledge, writes memory, reflects, evaluates, and produces an answer.
```

Show:

- `/agent`
- Chat as primary workspace
- Runtime Graph
- Debug Timeline
- Runtime Inspector

### 0:30-1:30 Run The Demo Task

Click:

```text
Run full demo
```

or submit:

```text
分析华东区域销售下降原因，并生成报告
```

Say:

```text
The frontend creates a real task through the Runtime Server, then subscribes to SSE. The UI is not a static animation; it reacts to runtime events.
```

Point out:

- Planner event appears
- Tool calls execute
- Knowledge chunks appear
- Memory updates
- Reflection and Evaluation complete
- Answer streams into Chat

### 1:30-2:20 Explain Synchronization

Click a Graph node or Timeline event.

Say:

```text
Raw SSE events are projected into RuntimeObjects. Chat, Graph, Timeline, Inspector, and Drawer all synchronize around the same selected RuntimeObject.
```

Show:

- selected node
- highlighted timeline item
- inspector detail
- drawer JSON / input / output

### 2:20-3:00 Close With Project Value

Say:

```text
The project demonstrates both frontend runtime visualization and backend agent infrastructure: Planner, WorkflowRunner, ToolExecutor, RAG, Memory, Reflection, Evaluation, TaskManager, and SSE.
```

## 10-Minute Demo

Audience: frontend / full-stack engineer.

### 1. Workspace Overview

Route:

```text
/agent
```

Explain:

- Chat is the product.
- Graph explains runtime dependency.
- Timeline debugs runtime flow.
- Inspector explains the selected runtime object.
- Drawer is used for deep object inspection.

### 2. Task Lifecycle

Run:

```text
分析华东区域销售下降原因，并生成报告
```

Explain:

```text
createAgentTask(input)
  -> POST /api/agent/tasks
  -> Runtime Server creates task
  -> Agent Runtime emits events
  -> EventSource subscribes to /events
  -> Zustand updates state
  -> RuntimeObject projection updates the UI
```

### 3. Frontend Architecture

Open or describe:

```text
apps/agent-console/src/
```

Focus on:

- `services/agent.ts`: API + EventSource client
- `hooks/useAgentStream.ts`: stream lifecycle
- `store/agentStore.ts`: session state and event reducer
- `features/agent-console/runtime-object-model.ts`: RuntimeObject projection
- `components/execution/`: graph, timeline, drawer
- `components/inspector/`: object-driven inspection

### 4. Agent Runtime Architecture

Explain backend modules:

```text
packages/agent-runtime/src/
├── planner
├── workflow
├── tool
├── rag
├── memory
├── reflection
├── evaluation
└── observability
```

Say:

```text
The frontend does not import runtime classes directly. It uses API contracts and SSE events, which keeps the console decoupled from the runtime implementation.
```

### 5. Tool Failure And Step Retry

Click:

```text
Tool error -> step retry
```

The server plans `querySalesData` with region `华中`, which is intentionally unsupported. Show:

- the real `tool_error` and the failed step in the graph
- the failure panel: tool name, error message, args, attempt number
- edit `region` from `华中` to `华东` and click `重试此步`
- the runtime resumes at step 1, re-runs only that step, then continues steps 2–4
- Inspector shows two attempts (failed #1, success #2)

Say:

```text
This is a real failure path: the task fails on the server, the console explains which step failed, and the retry API re-runs that step with corrected arguments. Earlier steps are not repeated.
```

### 6. Supporting Pages

Briefly show:

- `/runs`: persisted run history (all runs, failures, totals)
- `/runs/:taskId`: Overview / Evidence / Memory / Quality / Events for one run
- `/settings`: About & limits (runtime boundary and readiness)
- Legacy `/knowledge`, `/memory`, `/evaluation`: old deep links with a migration notice
- `/workflow`: redirects to `/agent` (it duplicated the plan/graph)

Keep the message clear:

```text
The strongest page is /agent. Other pages support the broader product story and are intentionally scoped.
```

## 30-Minute Demo

Audience: senior frontend, AI platform, or agent infrastructure engineer.

### 0-5 Minutes: Product Positioning

Explain:

- why chat alone is not enough for agents
- why agent developers need observability
- why RuntimeObject exists
- why the project avoids fake RBAC / billing / SaaS features

Key statement:

```text
The project is optimized for explainability: one advanced page, real runtime capability, clear architecture, and honest boundaries.
```

### 5-12 Minutes: Live Runtime Walkthrough

Run the primary task.

Trace the UI:

```text
Chat -> Graph -> Timeline -> Inspector -> Drawer -> Final Answer
```

For each runtime phase, explain:

- What event arrived?
- How did Zustand update?
- Which RuntimeObject changed?
- Which UI surfaces reacted?
- What would an engineer debug here?

### 12-18 Minutes: Backend Runtime Walkthrough

Explain:

```text
Runtime Server
  -> TaskManager
  -> AgentRuntimeAdapter
  -> Agent
  -> Planner
  -> WorkflowRunner
  -> ToolExecutor
  -> RAG
  -> Memory
  -> Reflection
  -> Evaluation
  -> SSE event stream
```

Focus on the details that matter:

- task lifecycle
- cancel / retry
- event contract
- tool registry
- memory categories
- evaluation result shape
- trace and metrics primitives

### 18-24 Minutes: Frontend Runtime Visualization

Explain:

```text
Raw AgentEvent[] is too low-level for UI.
RuntimeObject is the frontend projection layer.
```

Show:

- Graph node selection
- Timeline event expansion
- Drawer tabs
- Inspector context mode
- Evidence navigation

Say:

```text
The important design decision is not just drawing a graph. It is making every surface point to the same selected runtime object.
```

### 24-28 Minutes: Tool Failure And Step Retry

Run:

```text
Tool error -> step retry
```

Explain:

- why failure cases matter for agent tooling
- how `tool_error`, `state_update`, and `task_retry` become visible
- how a step retry resumes the plan without re-running completed steps
- how attempts are recorded (`attemptNo`, args, error) and shown in the Inspector
- why this helps an engineer trust the runtime

### 28-30 Minutes: Roadmap And Boundaries

Say:

```text
Next useful steps are runtime deepening, richer event tree search, Knowledge Platform, Memory Platform, and Evaluation history. I would not add billing, RBAC, SSO, or multi-tenant features unless the target role requires enterprise SaaS.
```

## Q&A

### Why not just build a chat UI?

Because agent work is not only answering. It includes planning, tool execution, retrieval, memory, reflection, and evaluation. The UI must expose that lifecycle.

### What is the strongest technical point?

The RuntimeObject projection layer. It converts streamed runtime events into a shared object model for Graph, Timeline, Inspector, Drawer, Evidence, Memory, and Evaluation.

### What is real versus mocked?

Real:

- Runtime Server
- task creation
- EventSource streaming
- Planner
- tool calls
- local RAG retrieval
- memory writes
- reflection
- evaluation
- runtime UI synchronization

Scoped / future:

- persistent vector database
- persistent memory database
- historical evaluation dataset
- editable workflow deployment
- enterprise RBAC / SSO / audit

### What would you improve next?

For job-search impact:

1. richer event tree search / filters
2. better Knowledge chunk drill-down
3. memory graph
4. evaluation history comparison
5. short screen-recorded demo video

## Demo Checklist

Before recording:

- Runtime Server is running on `3001`.
- React Console is running on `5173`.
- `/agent` opens in Idle state.
- `Run full demo` completes successfully.
- `Tool error -> step retry` shows a real failure, then completes after editing the region.
- Graph node click opens Drawer.
- Timeline click updates Inspector.
- Evaluation page shows score and feedback.
- README screenshots are current.
