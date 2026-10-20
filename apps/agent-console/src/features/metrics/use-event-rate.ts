import { useEffect, useRef, useState } from 'react';
import { useAgentStore } from '../../store/agentStore';
import { EventRateMeter, type RateSample } from './event-rate';

export interface EventRateView {
  samples: RateSample[];
  total: number;
  /** Events counted in the most recent bucket. */
  latest: number;
  /** True once at least one frame has been painted. */
  ready: boolean;
}

const EMPTY_VIEW: EventRateView = { samples: [], total: 0, latest: 0, ready: false };

/**
 * Coalesces store updates into frame-gated paints.
 *
 * Two costs are separated on purpose:
 * - ingestion: one store subscription, O(new events) only, never a full scan
 * - painting: at most once per animation frame and at most every 250ms, so a
 *   burst of 1k events cannot trigger 1k React renders
 */
const MAX_PAINT_INTERVAL_MS = 250;

export function useEventRate(windowSeconds = 60): EventRateView {
  const [meter] = useState(() => new EventRateMeter({ capacity: windowSeconds }));
  const [view, setView] = useState<EventRateView>(EMPTY_VIEW);
  const cursorRef = useRef(0);

  useEffect(() => {
    const ingestNew = () => {
      const events = useAgentStore.getState().events;
      if (events.length < cursorRef.current) {
        // Store was reset (new task or cleared session).
        cursorRef.current = 0;
        meter.reset();
      }
      if (events.length === cursorRef.current) return;
      meter.ingestMany(events.slice(cursorRef.current));
      cursorRef.current = events.length;
    };

    ingestNew();
    const unsubscribe = useAgentStore.subscribe(ingestNew);
    return unsubscribe;
  }, [meter]);

  useEffect(() => {
    let frame = 0;
    let lastPaint = 0;

    const tick = (time: number) => {
      frame = window.requestAnimationFrame(tick);
      if (typeof document !== 'undefined' && document.hidden) return;
      if (time - lastPaint < MAX_PAINT_INTERVAL_MS) return;
      lastPaint = time;

      const samples = meter.snapshot(Date.now());
      setView({
        samples,
        total: meter.total,
        latest: samples.length > 0 ? samples[samples.length - 1].count : 0,
        ready: true,
      });
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [meter]);

  return view;
}
