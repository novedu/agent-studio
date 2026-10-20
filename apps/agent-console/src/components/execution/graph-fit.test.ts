import { describe, expect, it } from 'vitest';
import { computeFitScale, GRAPH_MAX_SCALE, GRAPH_MIN_SCALE } from './graph-fit';

describe('computeFitScale', () => {
  it('fits a wide graph to the viewport width', () => {
    // 1160px of content in a 600px viewport: 572 / 1160
    expect(computeFitScale(1160, 240, 600, 400)).toBe(0.49);
  });

  it('fits a tall graph to the viewport height', () => {
    // 400 content height in a 400px viewport: (400 - 28) / 600 = 0.62
    expect(computeFitScale(400, 600, 900, 400)).toBe(0.62);
  });

  it('never shrinks below the readable minimum', () => {
    expect(computeFitScale(4000, 4000, 300, 200)).toBe(GRAPH_MIN_SCALE);
  });

  it('never grows beyond the maximum when content already fits', () => {
    expect(computeFitScale(100, 100, 900, 700)).toBe(GRAPH_MAX_SCALE);
  });

  it('falls back gracefully when the viewport has no measurable size', () => {
    expect(computeFitScale(1160, 240, 0, 0)).toBe(GRAPH_MIN_SCALE);
    expect(computeFitScale(0, 0, 600, 400)).toBe(GRAPH_MAX_SCALE);
  });
});
