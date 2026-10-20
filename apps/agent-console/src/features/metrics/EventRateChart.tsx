import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';
import { colors } from '../../theme/colors';
import { useEventRate } from './use-event-rate';

// Tree-shaken registration: only the line series, grid, tooltip and the canvas
// renderer are bundled. Importing the full `echarts` package would ship every
// chart type and component (roughly 1MB) for a single sparkline.
echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

type ChartInstance = ReturnType<typeof echarts.init>;

const WINDOW_SECONDS = 60;

function formatClock(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function buildBaseOption(): EChartsCoreOption {
  return {
    animation: false,
    grid: { left: 34, right: 8, top: 10, bottom: 20 },
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: colors.surface,
      borderColor: colors.border,
      textStyle: { color: colors.text, fontSize: 10 },
      axisPointer: { type: 'line', lineStyle: { color: colors.borderStrong, width: 1 } },
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: [],
      axisLine: { lineStyle: { color: colors.border } },
      axisTick: { show: false },
      axisLabel: { color: colors.textSubtle, fontSize: 8, interval: 19, hideOverlap: true },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { color: colors.surfaceMuted, type: 'dashed' } },
      axisLabel: { color: colors.textSubtle, fontSize: 8 },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        name: 'events/s',
        type: 'line',
        showSymbol: false,
        smooth: false,
        lineStyle: { width: 1.5, color: colors.primary },
        itemStyle: { color: colors.primary },
        areaStyle: { color: colors.primarySoft, opacity: 0.55 },
        data: [],
      },
    ],
  };
}

export function EventRateChart({ compact = false }: { compact?: boolean } = {}) {
  const { samples, total, latest } = useEventRate(WINDOW_SECONDS);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ChartInstance | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    let chart: ChartInstance;
    try {
      chart = echarts.init(container, undefined, { renderer: 'canvas' });
    } catch {
      // jsdom and other canvas-less environments cannot host a chart; the panel
      // still renders its numbers and the chart area stays empty.
      return undefined;
    }
    chartRef.current = chart;
    chart.setOption(buildBaseOption());

    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => chart.resize());
    observer?.observe(container);

    return () => {
      observer?.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setOption(
      {
        xAxis: { data: samples.map(sample => formatClock(sample.t)) },
        series: [{ data: samples.map(sample => sample.count) }],
      },
      { lazyUpdate: true },
    );
  }, [samples]);

  const peak = samples.reduce((max, sample) => Math.max(max, sample.count), 0);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[11px] font-semibold text-ink">
          {latest}
          <span className="ml-1 text-[9px] font-normal text-muted">events/s</span>
        </span>
        <span className="text-[9px] text-muted">
          peak {peak} · total {total}
        </span>
      </div>
      <div
        ref={containerRef}
        className={compact ? 'mt-1 h-16 w-full' : 'mt-1 h-24 w-full'}
        role="img"
        aria-label={`Runtime event rate over the last ${WINDOW_SECONDS} seconds`}
      />
      {compact ? null : (
        <div className="mt-1 text-[9px] leading-4 text-muted">
          Window {WINDOW_SECONDS}s · capped ring buffer · frame-gated paint
        </div>
      )}
    </div>
  );
}
