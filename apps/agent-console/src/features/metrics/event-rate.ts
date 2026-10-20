/**
 * Event rate meter.
 *
 * Runtime events arrive one by one over SSE. Computing "events per second" by
 * scanning the whole event array once per frame is O(n) per frame and degrades
 * as the session grows, so this module keeps an incremental, fixed-size
 * accumulator instead:
 *
 * - ingest() is O(1) per event (plus a bounded gap fill when the stream idles)
 * - snapshot() is O(window) and never depends on how many events were seen
 * - memory is capped by the window size, not by the event count
 */

export interface RateSample {
  /** Bucket start timestamp in ms. */
  t: number;
  /** Number of events inside this bucket. */
  count: number;
}

export interface EventRateMeterOptions {
  /** Bucket width in ms. Defaults to 1000ms. */
  bucketMs?: number;
  /** Maximum number of buckets kept. Defaults to 120. */
  capacity?: number;
}

interface TimestampedEvent {
  timestamp: number;
}

export const DEFAULT_BUCKET_MS = 1000;
export const DEFAULT_CAPACITY = 120;

export class EventRateMeter {
  private readonly bucketMs: number;
  private readonly capacity: number;
  private readonly keys: Float64Array;
  private readonly counts: Int32Array;
  private head = 0;
  private filled = 0;
  private totalCount = 0;

  constructor(options: EventRateMeterOptions = {}) {
    const bucketMs = options.bucketMs ?? DEFAULT_BUCKET_MS;
    const capacity = options.capacity ?? DEFAULT_CAPACITY;
    if (bucketMs <= 0) throw new Error('bucketMs must be greater than 0');
    if (capacity <= 0) throw new Error('capacity must be greater than 0');
    this.bucketMs = bucketMs;
    this.capacity = capacity;
    this.keys = new Float64Array(capacity);
    this.counts = new Int32Array(capacity);
  }

  get total(): number {
    return this.totalCount;
  }

  ingestMany(events: Iterable<TimestampedEvent>): void {
    for (const event of events) this.ingest(event.timestamp);
  }

  ingest(timestamp: number): void {
    if (!Number.isFinite(timestamp)) return;
    const key = Math.floor(timestamp / this.bucketMs);
    this.totalCount += 1;
    this.write(key);
  }

  /** Returns the window oldest -> newest, and closes buckets up to `now`. */
  snapshot(now: number): RateSample[] {
    this.advanceTo(Math.floor(now / this.bucketMs));
    const samples: RateSample[] = [];
    const start = this.filled === this.capacity ? this.head : 0;
    for (let i = 0; i < this.filled; i += 1) {
      const slot = (start + i) % this.capacity;
      samples.push({ t: this.keys[slot] * this.bucketMs, count: this.counts[slot] });
    }
    return samples;
  }

  reset(): void {
    this.clearWindow();
    this.totalCount = 0;
  }

  /** Drops the visible window but keeps the lifetime counter. */
  private clearWindow(): void {
    this.head = 0;
    this.filled = 0;
  }

  private write(key: number): void {
    const last = this.lastKey();
    if (last === null) {
      this.push(key, 1);
      return;
    }
    if (key > last) {
      const gap = key - last;
      if (gap > this.capacity) {
        this.clearWindow();
        this.push(key, 1);
        return;
      }
      for (let offset = 1; offset < gap; offset += 1) this.push(last + offset, 0);
      this.push(key, 1);
      return;
    }
    const slot = this.findSlot(key);
    if (slot >= 0) this.counts[slot] += 1;
  }

  private advanceTo(key: number): void {
    const last = this.lastKey();
    if (last === null) {
      this.push(key, 0);
      return;
    }
    if (key <= last) return;
    const gap = key - last;
    if (gap > this.capacity) {
      this.clearWindow();
      this.push(key, 0);
      return;
    }
    for (let offset = 1; offset <= gap; offset += 1) this.push(last + offset, 0);
  }

  private push(key: number, count: number): void {
    this.keys[this.head] = key;
    this.counts[this.head] = count;
    this.head = (this.head + 1) % this.capacity;
    if (this.filled < this.capacity) this.filled += 1;
  }

  private lastKey(): number | null {
    if (this.filled === 0) return null;
    const slot = (this.head - 1 + this.capacity) % this.capacity;
    return this.keys[slot];
  }

  private findSlot(key: number): number {
    for (let i = 0; i < this.filled; i += 1) {
      const slot = (this.head - 1 - i + this.capacity * 2) % this.capacity;
      if (this.keys[slot] === key) return slot;
    }
    return -1;
  }
}
