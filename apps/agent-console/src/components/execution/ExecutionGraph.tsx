import { motion } from 'framer-motion';
import type { PointerEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FitViewIcon, Panel, ZoomInIcon, ZoomOutIcon } from '../ui';
import { ExecutionNode } from './ExecutionNode';
import { computeFitScale, GRAPH_MAX_SCALE, GRAPH_MIN_SCALE } from './graph-fit';
import {
  getStatusColor,
  type ExecutionNodeRecord,
} from './execution-model';
import type {
  RuntimeDependencyEdge,
  RuntimeObject,
  RuntimeObjectType,
} from '../../features/agent-console/runtime-object-model';
import { buildRuntimeObjects } from '../../features/agent-console/runtime-object-model';

interface ExecutionGraphProps {
  nodes: ExecutionNodeRecord[];
  runtimeObjects?: RuntimeObject[];
  dependencyEdges?: RuntimeDependencyEdge[];
  activeNodeId?: string;
  onSelectNode: (node: ExecutionNodeRecord) => void;
}

interface GraphPoint {
  object: RuntimeObject;
  x: number;
  y: number;
}

const nodeWidth = 156;
const nodeHeight = 88;
const columnGap = 188;
const rowGap = 102;

export function ExecutionGraph({
  nodes,
  runtimeObjects,
  dependencyEdges,
  activeNodeId,
  onSelectNode,
}: ExecutionGraphProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const dragStart = useRef<{ pointerX: number; pointerY: number; left: number; top: number }>();
  const interactedRef = useRef(false);

  const objects = useMemo(
    () => runtimeObjects ?? buildRuntimeObjects(nodes),
    [nodes, runtimeObjects],
  );
  const graph = useMemo(
    () => buildGraph(objects, dependencyEdges ?? buildSequentialEdges(objects)),
    [dependencyEdges, objects],
  );
  const activeObject = objects.find((object) => object.id === activeNodeId);

  useEffect(() => {
    if (!activeRef.current) return;
    activeRef.current.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  }, [activeNodeId]);

  const fitView = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    setScale(computeFitScale(graph.width, graph.height, el.clientWidth, el.clientHeight));
    if (typeof el.scrollTo === 'function') {
      el.scrollTo({ top: 0, left: 0 });
    } else {
      el.scrollLeft = 0;
      el.scrollTop = 0;
    }
  }, [graph.width, graph.height]);

  // Re-fit whenever the layout grows, so a finished run is always fully visible.
  // Once the user pans or zooms we stop moving the viewport under them.
  useEffect(() => {
    if (interactedRef.current) return;
    fitView();
  }, [fitView]);

  // The dock swaps between graph and timeline, so the viewport can go from
  // zero width to full width without graph dimensions changing. Re-fit on
  // resize so the first visible frame is already correct.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (interactedRef.current) return;
        if (el.clientWidth === 0 || el.clientHeight === 0) return;
        fitView();
      });
    });
    observer.observe(el);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [fitView]);

  const zoomBy = useCallback((delta: number) => {
    interactedRef.current = true;
    setScale((value) =>
      Math.min(GRAPH_MAX_SCALE, Math.max(GRAPH_MIN_SCALE, Number((value + delta).toFixed(2)))),
    );
  }, []);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    const el = viewportRef.current;
    if (!el) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    interactedRef.current = true;
    dragStart.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      left: el.scrollLeft,
      top: el.scrollTop,
    };
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const el = viewportRef.current;
    if (!el || !dragStart.current) return;
    el.scrollLeft = dragStart.current.left - (event.clientX - dragStart.current.pointerX);
    el.scrollTop = dragStart.current.top - (event.clientY - dragStart.current.pointerY);
  }

  function handlePointerUp() {
    dragStart.current = undefined;
  }

  return (
    <Panel
      title="Runtime Graph"
      description={activeObject ? `Focused dependency: ${activeObject.title}` : 'Runtime dependency graph'}
      actions={
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => zoomBy(-0.12)}
            className="flex h-5 w-5 cursor-pointer items-center justify-center rounded border border-line bg-white text-muted transition-colors duration-200 hover:bg-panel"
          >
            <ZoomOutIcon className="h-2.5 w-2.5" />
          </button>
          <span className="w-8 text-center font-mono text-[10px] text-muted">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => zoomBy(0.12)}
            className="flex h-5 w-5 cursor-pointer items-center justify-center rounded border border-line bg-white text-muted transition-colors duration-200 hover:bg-panel"
          >
            <ZoomInIcon className="h-2.5 w-2.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              interactedRef.current = false;
              fitView();
            }}
            className="flex h-5 w-5 cursor-pointer items-center justify-center rounded border border-line bg-white text-muted transition-colors duration-200 hover:bg-panel"
          >
            <FitViewIcon className="h-2.5 w-2.5" />
          </button>
        </div>
      }
      className="h-full rounded-none border-0 shadow-none"
      bodyClassName="relative overflow-hidden p-0"
    >
      <div
        ref={viewportRef}
        className="h-full cursor-grab overflow-auto overscroll-contain bg-[radial-gradient(circle_at_1px_1px,#e2e8f0_1px,transparent_0)] bg-[length:24px_24px] active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Layout box matches the scaled content so scrollbars are honest. */}
        <div className="relative" style={{ width: graph.width * scale, height: graph.height * scale }}>
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{ width: graph.width, height: graph.height, transform: `scale(${scale})` }}
          >
          <svg
            className="pointer-events-none absolute inset-0 overflow-visible"
            width={graph.width}
            height={graph.height}
            viewBox={`0 0 ${graph.width} ${graph.height}`}
            aria-hidden="true"
          >
            {graph.edges.map((edge) => {
              const from = graph.pointById.get(edge.from);
              const to = graph.pointById.get(edge.to);
              if (!from || !to) return null;
              const stroke = getStatusColor(edge.status);
              return (
                <g key={edge.id}>
                  <motion.path
                    d={getConnectorPath(from, to)}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={edge.status === 'running' ? 2.4 : 1.4}
                    strokeLinecap="round"
                    strokeDasharray={edge.status === 'waiting' ? '4 6' : undefined}
                    initial={{ pathLength: 0, opacity: 0.28 }}
                    animate={{ pathLength: 1, opacity: 0.82 }}
                    transition={{ duration: 0.22 }}
                  />
                  <text
                    x={(from.x + to.x + nodeWidth) / 2}
                    y={(from.y + to.y + nodeHeight) / 2 - 6}
                    className="fill-slate-500 text-[9px] font-semibold uppercase tracking-[0.12em]"
                    textAnchor="middle"
                  >
                    {edge.label}
                  </text>
                </g>
              );
            })}
          </svg>

          {graph.points.map((point, index) => (
            <motion.div
              key={point.object.id}
              ref={point.object.id === activeNodeId ? activeRef : undefined}
              className="absolute"
              style={{ left: point.x, top: point.y, width: nodeWidth }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, delay: index * 0.025 }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <ExecutionNode
                node={point.object.sourceNode}
                active={point.object.id === activeNodeId}
                onSelect={onSelectNode}
              />
            </motion.div>
          ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function buildGraph(objects: RuntimeObject[], edges: RuntimeDependencyEdge[]) {
  const points = objects.map((object, index) => ({
    object,
    ...getPosition(object, index, objects),
  }));
  const pointById = new Map(points.map((point) => [point.object.id, point]));
  const maxX = Math.max(...points.map((point) => point.x), 0) + nodeWidth + 48;
  const maxY = Math.max(...points.map((point) => point.y), 0) + nodeHeight + 28;

  return {
    points,
    pointById,
    edges,
    width: Math.max(720, maxX),
    height: Math.max(228, maxY),
  };
}

function getPosition(object: RuntimeObject, index: number, objects: RuntimeObject[]) {
  const toolIndex = objects.filter((item) => item.type === 'tool').findIndex((item) => item.id === object.id);
  const toolCount = objects.filter((item) => item.type === 'tool').length;
  const column = getColumn(object.type);
  const baseY = getBaseY(object.type);
  const y = object.type === 'tool'
    ? 20 + Math.max(0, toolIndex) * Math.min(rowGap, toolCount > 2 ? 78 : rowGap)
    : baseY;

  return {
    x: 24 + column * columnGap,
    y: y + getNudge(index, object.type),
  };
}

function getColumn(type: RuntimeObjectType): number {
  if (type === 'planner') return 0;
  if (type === 'workflow' || type === 'knowledge') return 1;
  if (type === 'tool') return 2;
  if (type === 'memory' || type === 'reflection') return 3;
  if (type === 'evaluation') return 4;
  return 5;
}

function getBaseY(type: RuntimeObjectType): number {
  if (type === 'workflow' || type === 'memory') return 16;
  if (type === 'knowledge' || type === 'reflection') return 120;
  if (type === 'planner') return 68;
  if (type === 'evaluation' || type === 'answer') return 68;
  return 68;
}

function getNudge(index: number, type: RuntimeObjectType): number {
  if (type === 'tool') return 0;
  return index % 2 === 0 ? 0 : 4;
}

function getConnectorPath(from: GraphPoint, to: GraphPoint): string {
  const startX = from.x + nodeWidth;
  const startY = from.y + nodeHeight / 2;
  const endX = to.x;
  const endY = to.y + nodeHeight / 2;
  const middleX = startX + Math.max(34, (endX - startX) / 2);
  return `M ${startX} ${startY} C ${middleX} ${startY}, ${middleX} ${endY}, ${endX} ${endY}`;
}

function buildSequentialEdges(objects: RuntimeObject[]): RuntimeDependencyEdge[] {
  return objects.slice(0, -1).map((object, index) => {
    const next = objects[index + 1];
    return {
      id: `${object.id}__${next.id}`,
      from: object.id,
      to: next.id,
      status: next.status,
      label: 'next',
    };
  });
}
