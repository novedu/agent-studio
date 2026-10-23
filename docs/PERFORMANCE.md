# 性能笔记

控制台通过 SSE 收事件，同时更新几个视图。这里只记两个成本：事件速率的计算，和首屏包大小。

## 图表按帧绘制

每个 SSE 事件都会更新 store，但图表不跟着每个事件重绘。图表只订阅一次，把新事件喂给累加器，最多每帧画一次，实际再合并到 250ms。

| 项目 | 朴素做法 | 现在的做法 |
| --- | --- | --- |
| 事件到图表 | 每个事件更新一次 | 一个订阅，只处理新事件 |
| React 渲染 | 每个事件一次 | 每帧最多一次 |
| 后台标签页 | 继续画 | `document.hidden` 时跳过 |

## 固定窗口

`EventRateMeter` 只保留 60 个一秒桶，用 typed array 存。内存和每帧成本与窗口大小有关，与事件总数无关。

## 基准

```bash
npx tsx scripts/bench-event-rate.ts
```

Node 24，macOS，60 帧，60 秒窗口：

```text
events=10000 window=60s frames=60

naive: 60 frames x full scan        10.91 ms
meter: ingest 10000 events once      0.89 ms
meter: 60 frame snapshots            0.36 ms

per frame: naive 0.18 ms | meter 0.02 ms
speedup: 8.7x
```

不同事件量下的每帧成本：

```text
events   naive(ms)   meter(ms)   speedup
 10000       0.114       0.003     40.2x
 50000       0.161       0.013     12.9x
100000       0.815       0.047     17.4x
```

这些数字主要看增长趋势：朴素做法随事件数线性增长，meter 只碰窗口，成本基本平。倍率受 JIT 和缓存影响，不用太当真。

## 首屏包

图表用 ECharts。最早是同步引入，控制台 chunk 到了 699 kB（gzip 226 kB）。现在图表单独懒加载：

| 构建 | 控制台 chunk | 图表 chunk | 首屏 gzip |
| --- | ---: | ---: | ---: |
| 同步引入 | 699.31 kB | 无 | 226.33 kB |
| 懒加载（当前） | 200.27 kB | 498.83 kB（按需） | 56.27 kB |

图表只在 Inspector 挂载时下载。ECharts 用 `echarts/core`，只注册 line、grid、tooltip 和 canvas renderer。

## 一次演示的量

本地跑一次默认任务：

```text
80 events in 640 ms, 13 event types
final_answer x52, state_update x13, tool_start x3, tool_success x3
plan/rag/memory/reflection/evaluation x1 each
```

大约 125 events/s。如果每个事件都渲染，一次演示要渲染 80 次 React 和 80 次图表，所以图表按帧画。

## 没测的部分

- 浏览器 FPS。上面是计算成本，不是帧率。
- 真实网络下的 SSE 吞吐。本地事件比线上快很多。
- 真实模型下的耗时和 token。
