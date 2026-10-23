# Agent Studio

一个本地运行的 AI Agent 控制台。跑一个任务，能看到每一步在做什么；工具报错时，停在失败的那一步，改完参数只重跑那一步；跑过的任务可以回看。

React + Node.js + SSE。默认 Mock，配 Key 可接 OpenAI 兼容模型。

![失败时停在出错步骤](docs/screenshots/agent-failure.png)

## 运行

需要 Node 20+。

```bash
npm install
cp .env.example .env
npm run dev:all
```

打开终端里的地址。没有 Key 也能跑，走 Mock。首页两个入口：`Run full demo` 和 `Tool error -> step retry`。

## 现在有什么

跑任务时，计划、工具调用、检索、评测和最终答案会实时出现。工具失败时，失败步骤、参数和错误留在界面上，改完参数只重跑这一步。历史任务在 `/runs`，单次运行的步骤、attempts、证据、评分和事件在 `/runs/:runId`。

## Mock 和限制

模型配了 Key 就接真实模型，否则走 Mock 脚本。工具返回的是示例数据，RAG 是关键词检索，评测是规则评分，记忆只存在进程内。

会话不持久化，服务重启后步骤级重试会失败。历史是本地 JSON，没有分页和搜索。token 和 cost 没接 usage，显示 0。

测试：`npm test`。

## 文档

- [架构](docs/ARCHITECTURE.md)
- [演示](docs/DEMO.md)
- [开发说明](docs/CONTRIBUTING.md)
- [更新记录](docs/CHANGELOG.md)

## License

MIT
