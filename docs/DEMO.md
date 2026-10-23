# 三分钟演示

## 准备

```bash
npm run dev:all
```

打开终端里的地址，默认 http://127.0.0.1:5173/agent。确认顶部显示 `Mock · 模板`，服务端是 `Local dev`。

如果之前跑过很多任务，可以换一个数据目录，演示会干净一些：

```bash
AGENT_DATA_DIR=/tmp/agent-demo npm run server
```

## 时间线

### 0:00 一句话

“这是一个本地运行的 Agent 控制台。我不讲它支持多少模型，直接看一次失败的任务怎么定位和重跑。”

### 0:20 触发失败

点首页的 `Tool error -> step retry`。

任务会跑到 `querySalesData` 时失败，因为参数里的区域是 `华中`，工具只支持华东、华北、华南。

指着屏幕说三处：

- 顶部任务头：`FAILED`，`0/4 steps`，失败行写着 `step 1 · querySalesData · 不支持的区域`。
- 下面的 Steps：第 1 步 `FAILED`，`#1 failed`，错误原文在行里。
- 失败卡片：参数 JSON 可以直接改，按钮是「重试此步」，不是整任务重跑。

### 0:50 改参数重试

把 `region` 从 `华中` 改成 `华东`，点「重试此步」。

说明：只会重跑第 1 步，后面已完成的步骤不会重复执行；这次 attempt 记为 #2。

等任务完成，指一下：

- 任务头变成 `SUCCESS`，`4/4 steps · 100%`。
- 第 1 步显示 `2 attempts`，`#1 failed`、`#2 success`，错误行标成 `Recovered`。
- 后面的步骤仍然是 `#1 success`。

### 1:30 看历史

点右上角 `Run detail`。

依次点 Overview、Evidence、Memory、Quality、Events：

- Overview：目标、最终答案、每一步和 attempts。
- Evidence：这次检索到的文档和分数。
- Quality：规则评分，明确写着 `Rule-based`，不是模型评审。
- Events：完整事件流，排查时可以按事件看。

说明：这些数据存在本地，服务重启后还能打开。

### 2:10 说边界

“它是个人项目，不是生产平台。模型默认是 Mock；RAG 是关键词检索，不是向量库；评测是规则评分；会话不持久化，所以服务重启后只能整任务重跑，不能步骤级重试。这些在 README 里都写了。”

### 2:40 收尾

“我想验证的是：Agent 的一次运行，应该能定位到失败的那一步，改完参数只重跑那一步，跑完还能回看。”

## 出问题时的备用说法

- 服务端没起：`curl http://127.0.0.1:3001/health`，没有返回就先 `npm run server`。
- 端口不是 5173：看 Vite 终端输出，用实际端口。
- 重试报 `Retry context unavailable`：服务重启过，会话丢了。直接说这是当前限制，整任务重跑一次。
- 页面没有历史：`.data/` 被清过，先跑一次失败演示，再打开 Runs。

## 不要做

- 不要从代码结构开始讲，先讲用户看到的那条失败链路。
- 不要把 Mock 说成真实模型。
- 不要说“生产级”“企业级”“高可用”。
- 不要逐行读 Timeline 的 JSON，点到为止。
