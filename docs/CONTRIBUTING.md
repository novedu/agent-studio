# 开发说明

这是个人项目，没有严格的贡献流程。下面的步骤能让你在本地跑起来，改完代码知道该跑哪些检查。

## 环境

- Node.js 20+
- npm 10+

```bash
npm install
cp .env.example .env   # 可选，不配 Key 就走 Mock
npm run dev:all
```

`dev:all` 会同时起 Runtime Server 和 Vite。Vite 默认 5173，服务端默认 3001。端口被占用时看终端输出。

也可以分开起：

```bash
npm run server
npm --prefix apps/agent-console run dev
```

## 常用命令

```bash
npm run dev:all      # 前后端一起
npm run server       # 只起服务端
npm run lint         # 前端 ESLint
npm run typecheck    # TypeScript
npm test             # 密钥扫描 + 后端脚本 + 前端测试
npm run build        # typecheck + 前端构建
```

改完代码至少跑一遍：

```bash
npm run lint && npm test && npm run build
```

## 代码位置

```text
apps/agent-console/     React 控制台
apps/runtime-server/    HTTP、SSE、TaskManager
packages/agent-runtime/ Planner、Workflow、Tool、RAG、Memory、Evaluation
packages/shared-types/  前后端共享类型
```

前端的运行时投影在 `apps/agent-console/src/components/execution/execution-model.ts`，服务端的任务逻辑在 `apps/runtime-server/src/task/task-manager.ts`。

## 改动的几个约定

- 页面状态留在前端，不要把 tab、选中节点这类状态塞进服务端。
- 任务状态和步骤状态以服务端快照为准，前端不要自己猜进度。
- 新增事件时，先改 `packages/shared-types`，再改 runtime、服务端和前端投影，最后补测试。
- 工具失败要保留原始参数和错误，不要只返回一句“执行失败”。
- 不要提交 `.env`、`.data/`、日志和本地数据库文件。

## 测试覆盖

`npm test` 会跑：

- 密钥扫描，防止 key 形状的字符串被提交。
- 会话复用、隔离和历史截断。
- Mock provider 的意图路由。
- 权限、风险和执行器可靠性。
- Runtime Server 健康检查。
- 步骤重试、取消和事件顺序。
- 任务/事件持久化和重启读取。
- 前端 Runtime Object、Steps、失败面板、store 等。

这些测试保证演示链路不崩，不覆盖真实网络、浏览器性能和真实模型质量。

## 提交

提交信息写清楚改了什么、为什么改。一个提交只做一件事。文档和代码一起改时，文档要跟得上当前实现，不要留过期截图或过期命令。
