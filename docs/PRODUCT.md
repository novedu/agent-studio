# Agent Studio Product Specification

Version: 2.0

---

# Product Positioning

Agent Studio is an enterprise platform for **building, running, observing, debugging, and evaluating AI agent systems**.

Unlike traditional AI chat applications, Agent Studio is designed for engineers who need complete visibility into an agent runtime.

It provides a unified engineering workspace for understanding:

- what an agent planned
- how it executed
- which tools it used
- what knowledge it retrieved
- how memory evolved
- why a decision was made
- whether the final answer is trustworthy

Agent Studio is **runtime-first**, not chat-first.

In the v4 IDE Workspace, Chat is the primary interaction surface because it is where the user expresses the task and reads the agent result. Runtime remains the product; Chat is the editor-like surface that makes the runtime understandable.

---

# Product Vision

Modern AI applications require far more than a conversational interface.

Developers need to understand the complete runtime lifecycle of an AI agent:

Planning → Execution → Knowledge Retrieval → Evaluation → Reflection → Memory

Agent Studio provides a single engineering workspace where every runtime decision is observable, explainable, and debuggable.

The long-term vision is to become the operating system for AI agent engineering.

---

# Target Users

Primary users:

- AI Engineer
- LLM Engineer
- AI Application Developer
- Agent Platform Engineer
- AI Infrastructure Engineer

Secondary users:

- Technical Product Manager
- AI QA Engineer
- Runtime Operator

Agent Studio is **not** designed for casual consumer use.

Every interface should feel:

- Professional
- Engineering-focused
- Runtime-first
- Dense
- Calm
- Minimal
- Explainable

Design references:

- Linear
- Cursor
- Raycast
- Vercel
- OpenAI Platform
- Claude Console
- GitHub

---

# Design Principles

Every feature must follow these principles.

## Runtime First

The runtime is the product.

Everything else exists to explain the runtime.

---

## Explainability over Decoration

Visual polish should never hide engineering information.

Every UI element should help explain how the runtime behaves.

---

## Evidence Driven

Every important conclusion should be backed by evidence.

Evidence includes:

- Knowledge
- Citation
- Memory
- Trace
- Logs
- Evaluation

---

## Progressive Disclosure

Show only the information needed at the current moment.

Reveal deeper runtime details only when requested.

---

## One Runtime Context

The entire workspace revolves around a single runtime object.

Every component should describe the same object from different perspectives.

---

# Core Product Pillars

Agent Studio focuses on four engineering capabilities.

## Planning

Understand how goals become executable plans.

Includes:

- Goal
- Planner
- Plan
- Step
- Dependencies

---

## Execution

Observe how the runtime executes.

Includes:

- Workflow
- Tool Calls
- Runtime State
- Progress
- Output

---

## Evidence

Understand why the runtime produced the result.

Includes:

- Knowledge Retrieval
- Citation
- Memory
- Trace
- Logs
- Runtime Relationships

---

## Evaluation

Measure runtime quality.

Includes:

- Accuracy
- Groundedness
- Task Completion
- Completeness
- Latency
- Cost

---

# Runtime Lifecycle

Every task follows a predictable runtime lifecycle.

```text
Queued
    │
    ▼
Planning
    │
    ▼
Execution
    │
    ▼
Knowledge Retrieval
    │
    ▼
Evaluation
    │
    ▼
Reflection
    │
    ▼
Memory Update
    │
    ▼
Completed
```

Failure paths:

```text
Execution (tool fails)
      │
      ▼
Failed
      │
Step Retry (corrected args)
      │
      ▼
Resume at the failed step → continue remaining steps
```

A full task retry restarts the plan from the beginning; a step retry
re-runs only the failed step and keeps completed steps and conversation context.

or

```text
Running
      │
      ▼
Cancelled
```

---

# Runtime Object Model

Every engineering artifact is represented as a Runtime Object.

Supported runtime objects include:

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

All major UI components consume the same runtime object.

This guarantees consistency across:

- Runtime Graph
- Timeline
- Inspector
- Drawer
- Evidence
- Logs

---

# Product Rule

Every screen must allow users to answer these questions within **three seconds**.

- What is the agent doing?
- Which step is currently running?
- Why is it doing this?
- Has anything failed?
- What evidence supports this answer?
- What should I do next?

If the interface cannot answer these questions, the design has failed.

---

# Information Architecture

Default route:

```text
/agent
```

Primary navigation:

```text
Agent Workspace   (live run)
Runs              (persisted history → Run Detail)
```

Sidebar footer:

```text
About & limits
Documentation
```

Run Detail tabs:

```text
Overview
Evidence
Memory
Quality
Events
```

Agent Workspace is always the primary entry.

Runs is the history surface, not the main experience. Knowledge, Memory and
Evaluation are run-scoped tabs now; the standalone routes are legacy deep links
with a deprecation notice. Workflow redirects to Agent because it duplicated the
plan and graph.

> P1-2 update: the later "Knowledge / Memory / Evaluation / Workflow / Settings"
> sections describe the legacy standalone pages. Their current home is the Run
> Detail tabs (Evidence / Memory / Quality), and Settings is labelled
> "About & Limits" in the sidebar footer.

---

# Screen Blueprint

## Agent Workspace

Purpose:

Execute and debug AI agent runtime tasks.

Contains:

- Chat Workspace
- Runtime Header
- Runtime Dependency Graph
- Debug Timeline
- Runtime Inspector
- Evidence Navigation

---

## Runs

Purpose:

Persisted run history and entry point to Run Detail.

Contains:

- Current Runtime spotlight (live session)
- Recent Tasks (opens `/runs/:taskId`)
- Failure Review
- Total / completed / failed / running counts

## Run Detail

Purpose:

Review one persisted run without the live console.

Tabs:

- Overview (goal, final answer, steps, attempts)
- Evidence (RAG documents and scores)
- Memory (working / episodic / semantic writes)
- Quality (rule-based score, criteria, feedback)
- Events (full event stream)

---

## Knowledge Workspace

Purpose:

Manage retrieval knowledge.

Contains:

- Knowledge Sources
- Documents
- Chunks
- Embedding Status
- Retriever Configuration
- Citation Records
- Search

---

## Memory Workspace

Purpose:

Observe runtime memory.

Contains:

- Working Memory
- Semantic Memory
- Episodic Memory
- Memory Timeline
- Memory Graph
- Related Tasks

---

## Evaluation Workspace

Purpose:

Measure runtime quality.

Contains:

- Evaluation History
- Score Trend
- Leaderboard
- Dataset
- Failed Cases
- Regression Review

---

## Workflow Workspace

Purpose:

Visual workflow authoring.

Contains:

- Planner Graph
- Workflow Graph
- Task Chain
- Sub Agent
- Templates
- Execution Preview

---

## Settings

Purpose:

Engineering configuration.

Contains:

- Model Provider
- Runtime Config
- Environment
- API Endpoint
- Feature Flags
- Team Configuration

---

# User Journey

```text
Open Agent Workspace

↓

Select Model / Environment

↓

Start Task

↓

Planner Generates Plan

↓

Workflow Executes

↓

Tool Calls

↓

Knowledge Retrieval

↓

Memory Update

↓

Reflection

↓

Evaluation

↓

Inspect Runtime Object

↓

Retry / Export / Continue
```

---

# Non Goals

Agent Studio is not:

- a chatbot product
- a workflow automation platform
- a low-code platform
- a business dashboard
- a reporting system
- a consumer AI assistant

These capabilities are intentionally out of scope.

---

# Version Direction

## Version 2.0

Focus:

Runtime Workspace

Deliver:

- Runtime Graph
- Timeline
- Inspector
- Evidence Navigation
- Evaluation
- Runtime Debugging

---

## Version 2.5

Expand:

- Knowledge Workspace
- Memory Workspace
- Evaluation Workspace

---

## Version 3.0

Introduce:

- Workflow Builder
- Multi-Agent Collaboration
- Team Workspace
- Dataset Management
- Experiment Tracking
- Enterprise Features

---

# Success Metrics

A successful Agent Studio enables engineers to:

- understand runtime state within three seconds
- locate failures within thirty seconds
- inspect evidence without leaving the workspace
- debug failed tasks in a single workflow
- evaluate answer quality immediately after execution
- iterate rapidly with confidence

Success is measured by engineering efficiency rather than conversational quality.
