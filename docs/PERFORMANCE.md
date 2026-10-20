# Performance Notes

The runtime console streams events over SSE while the UI keeps four views in sync. Two costs matter:

1. **Per-frame work** — anything computed on every frame must not grow with the session length.
2. **First load** — a runtime debugger should not ship a charting library before the first paint.

Both are addressed in the telemetry panel (`apps/agent-console/src/features/metrics/`).

## 1. Frame-gated painting

Every SSE event updates the store immediately, but the chart does **not** react to events. The panel subscribes once, feeds an incremental accumulator, and paints at most once per animation frame (further coalesced to 250 ms):

| Concern | Naive approach | This implementation |
| --- | --- | --- |
| Events → chart | one chart update per event | one store subscription, ingest only new events |
| React renders | one render per event (1k events → 1k renders) | at most one render per animation frame |
| Tab in background | keeps painting | `document.hidden` check skips the paint |

## 2. Capped ring buffer instead of an append-only array

`EventRateMeter` keeps a fixed number of one-second buckets (60 by default) in typed arrays. Memory and per-frame cost are bounded by the window, not by the number of events seen.

Clicking `Run full demo` a hundred times no longer grows the chart's memory footprint.

## 3. Measured: incremental accumulator vs full scan

`npx tsx scripts/bench-event-rate.ts` (Node 24, macOS, 60 frames, 60 s window):

```text
events=10000 window=60s frames=60

naive: 60 frames x full scan                   10.91 ms
meter: ingest 10000 events once                 0.89 ms
meter: 60 frame snapshots                       0.36 ms

per frame: naive 0.18 ms | meter 0.02 ms
speedup: 8.7x | total counted: 10000

scaling (per frame, 60s window):
  events   naive(ms)   meter(ms)   speedup
   10000       0.114       0.003     40.2x
   50000       0.161       0.013     12.9x
  100000       0.815       0.047     17.4x
```

Reading the numbers honestly:

- At 10k events both paths are fast; the absolute cost is not the argument.
- The argument is the **growth rate**: the naive scan is linear in the event count, the meter's per-frame cost is ~flat because it only touches the window.
- Speedup ratios in the table are noisy (JIT warm-up, cache effects). Treat the per-frame columns as the signal, not the ratio.

## 4. Measured: first-load bundle

The chart needs ECharts. Importing it eagerly pushed the console chunk to **699 kB (226 kB gzip)** and triggered Vite's chunk-size warning. The chart is now a lazy chunk:

| Build | Console chunk | Chart chunk | Gzip total on first paint |
| --- | ---: | ---: | ---: |
| Eager import | 699.31 kB | — | 226.33 kB |
| Lazy chunk (current) | **200.27 kB** | 498.83 kB (on demand) | **56.27 kB** |

The chart bundle only downloads when the inspector panel mounts, and `echarts/core` is used with explicit `use([...])` registration so only the line series, grid, tooltip and canvas renderer are included.

## 5. What a real demo run produces

Measured against the local runtime server (one `POST /api/agent/tasks` with the default demo prompt):

```text
80 events in 640 ms across 13 event types
(final_answer x52, state_update x13, tool_start x3, tool_success x3, plan/rag/memory/reflection/evaluation x1 each)
```

That is roughly 125 events/second at peak. Rendering once per event would mean ~80 React renders and ~80 chart redraws for a single demo run — this is why painting is frame-gated rather than event-gated.

## 6. What is *not* measured here

- **Browser frame rate.** The numbers above are computation cost, not FPS. FPS has to be read in a real browser (Performance panel), which is the honest way to claim it.
- **SSE throughput on a real network.** Local events arrive far faster than over a network.

Reproduce everything on this page with:

```bash
npx tsx scripts/bench-event-rate.ts   # aggregation cost + scaling
npm run build                          # bundle split
```
