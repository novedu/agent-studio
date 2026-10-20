import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ExecutionGraph } from './ExecutionGraph';
import type { ExecutionNodeRecord } from './execution-model';

const nodes: ExecutionNodeRecord[] = [
  {
    id: 'planner:1',
    kind: 'planner',
    component: 'Planner',
    summary: 'Plan steps',
    status: 'success',
    duration: 202,
    input: {},
    output: {},
    arguments: {},
    metadata: {},
    trace: [],
  },
  {
    id: 'tool:querySales',
    kind: 'tool',
    component: 'querySalesData',
    summary: 'Query sales data',
    status: 'success',
    duration: 320,
    input: {},
    output: {},
    arguments: {},
    metadata: {},
    trace: [],
  },
];

beforeAll(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('ExecutionGraph', () => {
  it('renders the dependency graph without a leftover viewport offset', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let root: Root | undefined;

    act(() => {
      root = createRoot(container);
      root.render(<ExecutionGraph nodes={nodes} onSelectNode={() => {}} />);
    });

    const html = container.textContent ?? '';
    expect(html).toContain('Runtime Graph');
    expect(html).toContain('querySalesData');

    act(() => {
      root?.unmount();
    });
    container.remove();
  });
});
