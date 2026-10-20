import { describe, expect, it } from 'vitest';
import { EventRateMeter } from './event-rate';

const event = (timestamp: number) => ({ timestamp });

describe('EventRateMeter', () => {
  it('counts events inside the same second', () => {
    const meter = new EventRateMeter({ capacity: 10 });
    meter.ingestMany([event(1000), event(1200), event(1900)]);

    const samples = meter.snapshot(1900);

    expect(samples).toHaveLength(1);
    expect(samples[0]).toEqual({ t: 1000, count: 3 });
    expect(meter.total).toBe(3);
  });

  it('fills idle seconds with zero buckets so the chart stays continuous', () => {
    const meter = new EventRateMeter({ capacity: 10 });
    meter.ingest(1000);
    meter.ingest(5000);

    const samples = meter.snapshot(5000);

    expect(samples.map(sample => sample.count)).toEqual([1, 0, 0, 0, 1]);
    expect(samples.map(sample => sample.t)).toEqual([1000, 2000, 3000, 4000, 5000]);
  });

  it('closes the trailing window up to now', () => {
    const meter = new EventRateMeter({ capacity: 10 });
    meter.ingest(1000);

    const samples = meter.snapshot(3000);

    expect(samples).toHaveLength(3);
    expect(samples[2]).toEqual({ t: 3000, count: 0 });
  });

  it('caps memory at capacity and keeps the newest buckets', () => {
    const meter = new EventRateMeter({ capacity: 3 });
    for (let second = 0; second < 10; second += 1) {
      meter.ingest(second * 1000);
    }

    const samples = meter.snapshot(9000);

    expect(samples).toHaveLength(3);
    expect(samples.map(sample => sample.count)).toEqual([1, 1, 1]);
    expect(samples[0].t).toBe(7000);
    expect(samples[2].t).toBe(9000);
  });

  it('resets the window when the stream jumps further than capacity', () => {
    const meter = new EventRateMeter({ capacity: 3 });
    meter.ingest(1000);
    meter.ingest(60000);

    const samples = meter.snapshot(60000);

    expect(samples).toEqual([{ t: 60000, count: 1 }]);
    expect(meter.total).toBe(2);
  });

  it('drops events that predate the visible window but keeps counting them', () => {
    const meter = new EventRateMeter({ capacity: 10 });
    meter.ingest(3000);
    meter.ingest(1000);

    const samples = meter.snapshot(3000);

    expect(samples.map(sample => sample.count)).toEqual([1]);
    expect(meter.total).toBe(2);
  });

  it('ignores events older than the window but still counts them in total', () => {
    const meter = new EventRateMeter({ capacity: 2 });
    meter.ingest(5000);
    meter.ingest(6000);
    meter.ingest(1000);

    const samples = meter.snapshot(6000);

    expect(samples.map(sample => sample.count)).toEqual([1, 1]);
    expect(meter.total).toBe(3);
  });

  it('rejects invalid configuration', () => {
    expect(() => new EventRateMeter({ capacity: 0 })).toThrow();
    expect(() => new EventRateMeter({ bucketMs: 0 })).toThrow();
  });
});
