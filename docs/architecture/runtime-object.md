# Runtime Object Model

The console projects runtime events and task state into one object. Chat, Graph, Timeline, Inspector, Drawer and Evidence all read from it.

It doesn't change the API, SSE format or Zustand store.

## Why

Selecting a node in one view should update the others. Without a shared object, each panel would build its own version of the same run.

```text
Selected Runtime Object
  -> Chat summary
  -> Graph focus
  -> Timeline span
  -> Inspector sections
  -> Drawer tabs
```

## Schema

```ts
interface RuntimeObject {
  id: string;
  type: RuntimeObjectType;

  traceId: string;
  spanId: string;
  parentId?: string;
  dependencyIds: string[];
  childIds: string[];

  title: string;
  status: ExecutionNodeStatus;
  lifecycle: RuntimeLifecycle;
  summary: string;

  input?: unknown;
  arguments?: unknown;
  output?: unknown;
  reasoning?: unknown;
  metadata?: Record<string, unknown>;
  trace?: unknown;

  duration?: number;
  startTime?: number;
  endTime?: number;
  tokenCount?: number;
  retryCount?: number;
  cost?: number;

  span: RuntimeSpan;
  sourceNode: ExecutionNodeRecord;
}
```

## Runtime Types

```text
Planner
Workflow
Tool
Knowledge
Memory
Reflection
Evaluation
Answer
```

## Lifecycle

```text
pending
running
completed
failed
cancelled
```

Lifecycle is derived from the existing execution node status.

## Span Model

Each Runtime Object owns a span projection:

```ts
interface RuntimeSpan {
  spanId: string;
  traceId: string;
  parentId?: string;
  objectId: string;
  component: string;
  type: RuntimeObjectType;
  status: ExecutionNodeStatus;
  lifecycle: RuntimeLifecycle;
  depth: number;
  startTime?: number;
  endTime?: number;
  duration?: number;
  eventCount: number;
  events: AgentEvent[];
}
```

Timeline uses the span projection to group events by object.

## Dependency Rules

The frontend derives dependencies from runtime object types:

```text
Planner
  -> Workflow
  -> Knowledge

Workflow
  -> Tool

Tool
  -> Memory
  -> Reflection

Knowledge
  -> Reflection

Memory
  -> Reflection

Reflection
  -> Evaluation

Evaluation
  -> Answer
```

These rules are a UI projection. They do not alter runtime execution.

## Where it is used

### Chat

Chat shows a short summary of the selected object.

Assistant messages show runtime summary segments:

```text
Plan -> Tool -> Knowledge -> Memory -> Reflection -> Evaluation -> Answer
```

### Runtime Graph

Graph uses RuntimeObject dependencies to explain why each object exists.

### Timeline

Timeline uses RuntimeSpan to show:

- trace id
- root span
- span count
- event count
- duration
- parent
- dependencies
- input
- output
- metadata
- trace events

### Inspector

Inspector is object-driven.

Planner, Workflow, Tool, Knowledge, Memory, Reflection, Evaluation, and Answer each expose different sections.

### Drawer

Drawer shows:

- Overview
- Input
- Output
- Reasoning
- Trace
- Metadata
- Raw JSON

## Out of scope

RuntimeObject does not:

- change the backend API
- change SSE event formats
- change the Zustand store structure
- create new Agent Runtime capabilities
- replace EventTrace or Observability

It is a frontend debugger projection for the existing runtime.
