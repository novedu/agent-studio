# Screenshots

These screenshots document the primary demo task:

```text
分析华东区域销售下降原因，并生成报告
```

The sequence is intended to show the full Agent Runtime lifecycle, not static UI states:

```text
Planning -> Tool Call -> Knowledge Retrieval -> Memory Update -> Reflection -> Evaluation -> Final Answer
```

| File | Stage | What it demonstrates |
| --- | --- | --- |
| `01-agent-idle.jpg` | Idle Runtime Console | Ready state before the demo task starts, with quick entry and runtime overview. |
| `02-agent-running.jpg` | Running Agent Task | The task is active and the UI follows the current runtime object. |
| `03-tool-call.jpg` | Tool Call | Tool execution, retry path, arguments, and result context. |
| `04-knowledge-retrieval.jpg` | Knowledge Retrieval | RAG evidence, source chunks, score, and citation context. |
| `05-debug-timeline.jpg` | Debug Timeline | Runtime spans, duration, component, status, retry, token, and trace context. |
| `06-inspector.jpg` | Runtime Inspector | Selected runtime object details across output, evidence, dependencies, and trace spans. |
| `07-evaluation.jpg` | Evaluation | Completed evaluation score, criteria, feedback, and quality review. |
