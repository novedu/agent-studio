# 架构

项目分三层：控制台、Runtime Server、Agent Runtime。控制台负责界面和交互，服务端负责任务和事件，runtime 负责计划与执行。

```text
apps/agent-console      React + Vite + Zustand
        |
        | POST /api/agent/tasks, SSE
        v
apps/runtime-server     Node HTTP server, TaskManager, SSE
        |
        v
packages/agent-runtime  Planner, Workflow, Tool, RAG, Memory, Evaluation
```

## 控制台

`apps/agent-console` 是产品界面：

- 创建任务，订阅 SSE。
- 用 Zustand 保存当前会话的任务、计划、工具调用、事件和评测。
- 把事件投影成 Runtime Object，供 Chat、Steps、Graph、Timeline、Inspector 渲染。
- 不包含 Agent 的计划和执行逻辑。

页面只有两个主入口：`/agent` 和 `/runs`。单次运行的详情在 `/runs/:runId`。

## Runtime Server

`apps/runtime-server` 做四件事：

- 提供任务接口：创建、列表、详情、历史、事件、取消、整任务重试、步骤重试。
- 用 `TaskManager` 管理任务生命周期和 Run / Step / Attempt 快照。
- 把 runtime 发出的事件转成服务端事件，写入任务快照和 JSONL，同时通过 SSE 推送。
- 提供 `/health`，返回当前 provider 和 model。

服务端不保存 UI 状态。页面停在哪个 tab、选中哪个节点，都由前端自己管。

## Agent Runtime

`packages/agent-runtime` 与 UI 无关，可以单独跑测试：

- `planner`：把用户目标转成计划，并校验计划和工具参数。
- `workflow`：按计划顺序执行步骤，支持从指定步骤恢复。
- `tool`：工具注册、参数校验、超时、错误归一化、权限和风险检查。
- `rag`：关键词检索，返回文档片段和分数。
- `memory`：三层记忆，当前只存在进程内。
- `reflection` / `evaluation`：运行后的检查和规则评分。
- `llm`：OpenAI 兼容 provider；没有 Key 时用 Mock。

## 事件流

```text
用户提交任务
  -> 控制台 POST /api/agent/tasks
  -> TaskManager 创建 TaskRecord
  -> AgentRuntimeAdapter 启动 Agent
  -> runtime 发出 task / plan / tool / rag / memory / reflection / evaluation / state / answer 事件
  -> 服务端写快照和 events/<taskId>.jsonl
  -> SSE 推给控制台
  -> Zustand 更新
  -> Runtime Object 投影
  -> 界面渲染
```

前端断线重连时带 `?after=<eventId>`，服务端从游标之后补发，避免重复。

## Run / Step / Attempt

任务快照里保存：

- `plan`：计划步骤。
- `steps`：每一步的状态、工具、attempts。
- 每次 attempt 的 `attemptNo`、参数、状态、耗时、错误。

步骤重试时，服务端用 `Agent.resume()`，带上原会话 id、原计划、已完成步骤和修正后的参数。runtime 从失败步骤开始执行，已完成步骤不重复跑，只有失败步骤的 attemptNo 变成 2。后续步骤仍然是第一次 attempt。

## 数据

默认目录 `.data/`，可用 `AGENT_DATA_DIR` 覆盖：

```text
.data/
  tasks.json             任务快照
  events/<taskId>.jsonl  每个任务的事件，一行一条
```

`FileTaskRepository` 启动时加载任务，更新时先写临时文件再 rename。事件 JSONL 追加写入，启动时读回。

会话和记忆不落盘。服务重启后历史还能看，但步骤级重试需要原会话，会返回 `Retry context unavailable`。

## 前端投影

`docs/architecture/runtime-object.md` 里是 Runtime Object 的字段和依赖规则。简单说：

```text
AgentEvent + Plan + Tool + Memory + Evaluation
  -> RuntimeObject
  -> Graph / Timeline / Inspector / Drawer / Chat summary
```

这一层只做投影，不改 API、SSE 格式或 store 结构。

## 边界

- 控制台不执行计划，也不判断工具是否成功。
- 服务端不保存页面状态。
- runtime 不依赖 React 或浏览器。
- 历史是本地 JSON，不是数据库；没有分页、搜索和多租户。
