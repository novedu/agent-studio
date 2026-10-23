import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { RuntimeInspector } from './RuntimeInspector';
import { buildRuntimeObjects } from '../../features/agent-console/runtime-object-model';
import type { RuntimeOverview } from '../../features/agent-console/runtime-overview';
import type { ExecutionNodeRecord } from '../execution/execution-model';

const toolNode: ExecutionNodeRecord = {
  id: 'tool:querySales',
  kind: 'tool',
  component: 'querySalesData',
  summary: 'Query sales data',
  status: 'success',
  duration: 320,
  input: { region: 'East China' },
  output: { rows: 24 },
  arguments: { region: 'East China' },
  metadata: { tokenCount: 120, retryCount: 1 },
  trace: [],
};

const runtimeOverview: RuntimeOverview = {
  status: 'success',
  model: 'Portfolio Runtime',
  environment: 'Test',
  taskLabel: 'Analyze East China sales decline',
  currentStep: 'querySalesData',
  currentTool: 'querySalesData',
  progress: 100,
  eventCount: 1,
  toolCount: 1,
  runningToolCount: 0,
  citationCount: 0,
  memoryCount: 0,
  availableSignals: [],
};

beforeAll(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('RuntimeInspector', () => {
  it('renders object-specific inspection sections for the selected runtime object', () => {
    const objects = buildRuntimeObjects([toolNode]);
    const container = document.createElement('div');
    document.body.appendChild(container);
    let root: Root | undefined;

    act(() => {
      root = createRoot(container);
      root.render(
        <RuntimeInspector
          currentNode={toolNode}
          nodes={[toolNode]}
          events={[]}
          plan={null}
          memory={[]}
          citations={[]}
          tools={[]}
          status="success"
          isLoading={false}
          runtimeOverview={runtimeOverview}
          runtimeObjects={objects}
          focusedObject={{ type: 'node', id: toolNode.id, node: toolNode }}
        />,
      );
    });

    const html = container.textContent ?? '';

    expect(html).toContain('Runtime Inspector');
    // Telemetry is pinned above the body, so it must survive object selection.
    expect(html).toContain('Runtime Telemetry');
    expect(html).toContain('querySalesData');
    expect(html).toContain('Arguments');
    expect(html).toContain('Dependency Context');
    expect(html).toContain('Runtime Events');

    act(() => {
      root?.unmount();
    });
    container.remove();
  });

  it('keeps the default overview quiet and reveals details on demand', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let root: Root | undefined;

    act(() => {
      root = createRoot(container);
      root.render(
        <RuntimeInspector
          nodes={[]}
          events={[]}
          plan={null}
          memory={[]}
          citations={[]}
          tools={[]}
          status="idle"
          isLoading={false}
          runtimeOverview={{ ...runtimeOverview, progress: 0, currentStep: 'Waiting for task' }}
          runtimeObjects={[]}
        />,
      );
    });

    const html = container.textContent ?? '';

    // Default state shows the three headline numbers plus the telemetry panel.
    expect(html).toContain('Runtime Telemetry');
    expect(html).toContain('Step');
    expect(html).toContain('Progress');
    expect(html).toContain('Eval');

    // Collapsed by default, and the duplicated runtime context fields are gone.
    expect(html).toContain('Runtime Context');
    expect(html).not.toContain('Last event');
    expect(html).not.toContain('Environment');

    const contextButton = Array.from(container.querySelectorAll('button')).find((button) =>
      (button.textContent ?? '').includes('Runtime Context'),
    );
    expect(contextButton).toBeTruthy();

    act(() => {
      contextButton?.click();
    });

    expect(container.textContent ?? '').toContain('Last event');

    act(() => {
      root?.unmount();
    });
    container.remove();
  });
});
