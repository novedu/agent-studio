/**
 * Reproducible benchmark for the runtime telemetry path.
 *
 * Compares two ways of answering "how many events per second, last 60s":
 *
 *  naive : scan the whole event array once per frame  -> O(events) per frame
 *  meter : incremental bucket accumulator + ring buffer -> O(new events) + O(window)
 *
 * Run: npx tsx scripts/bench-event-rate.ts
 */

import { EventRateMeter } from '../apps/agent-console/src/features/metrics/event-rate';

const EVENT_COUNT = 10_000;
const WINDOW_SECONDS = 60;
const FRAMES = 60;
const BUCKET_MS = 1_000;

const now = Date.now();
const events: Array<{ timestamp: number }> = [];
for (let index = 0; index < EVENT_COUNT; index += 1) {
  // Spread the events across the visible window, newest last.
  const offset = (index / EVENT_COUNT) * WINDOW_SECONDS * BUCKET_MS;
  events.push({ timestamp: now - WINDOW_SECONDS * BUCKET_MS + offset });
}

function timeIt(label: string, fn: () => void): number {
  const started = performance.now();
  fn();
  const elapsed = performance.now() - started;
  console.log(`${label.padEnd(42)} ${elapsed.toFixed(2).padStart(9)} ms`);
  return elapsed;
}

function naiveFrame(at: number): number[] {
  const windowStart = at - WINDOW_SECONDS * BUCKET_MS;
  const buckets = new Array<number>(WINDOW_SECONDS).fill(0);
  for (const event of events) {
    if (event.timestamp < windowStart || event.timestamp > at) continue;
    const bucket = Math.floor((event.timestamp - windowStart) / BUCKET_MS);
    buckets[Math.min(bucket, WINDOW_SECONDS - 1)] += 1;
  }
  return buckets;
}

console.log(`events=${EVENT_COUNT} window=${WINDOW_SECONDS}s frames=${FRAMES}\n`);

const naiveTotal = timeIt(`naive: ${FRAMES} frames x full scan`, () => {
  for (let frame = 0; frame < FRAMES; frame += 1) naiveFrame(now - (FRAMES - frame) * 16);
});

const meter = new EventRateMeter({ capacity: WINDOW_SECONDS });
const ingestTotal = timeIt(`meter: ingest ${EVENT_COUNT} events once`, () => {
  meter.ingestMany(events);
});

const snapshotTotal = timeIt(`meter: ${FRAMES} frame snapshots`, () => {
  for (let frame = 0; frame < FRAMES; frame += 1) meter.snapshot(now - (FRAMES - frame) * 16);
});

const meterTotal = ingestTotal + snapshotTotal;
const speedup = naiveTotal / meterTotal;

console.log(
  `\nper frame: naive ${(naiveTotal / FRAMES).toFixed(2)} ms | meter ${(meterTotal / FRAMES).toFixed(2)} ms`,
);
console.log(`speedup: ${speedup.toFixed(1)}x | total counted: ${meter.total}`);

if (meter.total !== EVENT_COUNT) {
  throw new Error(`meter dropped events: ${meter.total} !== ${EVENT_COUNT}`);
}
if (!Number.isFinite(speedup) || speedup < 2) {
  throw new Error(`expected at least 2x speedup over the naive scan, got ${speedup.toFixed(2)}x`);
}
// Scaling: the naive cost grows with the session, the meter's does not.
console.log('\nscaling (per frame, 60s window):');
console.log('events'.padStart(8) + ' naive(ms)'.padStart(12) + ' meter(ms)'.padStart(12) + ' speedup'.padStart(10));

for (const count of [10_000, 50_000, 100_000]) {
  const scaled: Array<{ timestamp: number }> = [];
  for (let index = 0; index < count; index += 1) {
    scaled.push({ timestamp: now - WINDOW_SECONDS * BUCKET_MS + (index / count) * WINDOW_SECONDS * BUCKET_MS });
  }

  const scanStarted = performance.now();
  for (let frame = 0; frame < FRAMES; frame += 1) {
    const at = now - (FRAMES - frame) * 16;
    const windowStart = at - WINDOW_SECONDS * BUCKET_MS;
    const buckets = new Array<number>(WINDOW_SECONDS).fill(0);
    for (const event of scaled) {
      if (event.timestamp < windowStart || event.timestamp > at) continue;
      const bucket = Math.floor((event.timestamp - windowStart) / BUCKET_MS);
      buckets[Math.min(bucket, WINDOW_SECONDS - 1)] += 1;
    }
  }
  const scanPerFrame = (performance.now() - scanStarted) / FRAMES;

  const scaledMeter = new EventRateMeter({ capacity: WINDOW_SECONDS });
  const meterStarted = performance.now();
  scaledMeter.ingestMany(scaled);
  for (let frame = 0; frame < FRAMES; frame += 1) scaledMeter.snapshot(now - (FRAMES - frame) * 16);
  const meterPerFrame = (performance.now() - meterStarted) / FRAMES;

  console.log(
    String(count).padStart(8) +
      scanPerFrame.toFixed(3).padStart(12) +
      meterPerFrame.toFixed(3).padStart(12) +
      `${(scanPerFrame / meterPerFrame).toFixed(1)}x`.padStart(10),
  );
}

console.log('\nOK: incremental path stays bounded and beats the full scan.');
