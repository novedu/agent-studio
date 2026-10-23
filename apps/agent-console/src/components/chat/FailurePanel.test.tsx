import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FailurePanel } from './FailurePanel';
import type { ToolCallRecord } from '../../types/agent';

const failedTool: ToolCallRecord = {
  id: 'task_1_querySalesData_1',
  name: 'querySalesData',
  stepId: '1',
  attemptNo: 1,
  args: { region: '华中', month: '2024-02' },
  status: 'failed',
  result: { type: 'argument', message: '不支持的区域 "华中"' },
};

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function setTextareaValue(textarea: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('FailurePanel', () => {
  it('shows the failed step and retries with edited JSON args', () => {
    const onRetry = vi.fn();
    act(() => root.render(<FailurePanel tool={failedTool} onRetry={onRetry} />));

    expect(container.textContent).toContain('这一步失败了');
    expect(container.textContent).toContain('querySalesData');
    expect(container.textContent).toContain('不支持的区域');

    const textarea = container.querySelector('textarea');
    expect(textarea?.value).toContain('华中');

    act(() => {
      setTextareaValue(textarea!, JSON.stringify({ region: '华东', month: '2024-02' }, null, 2));
    });
    const retry = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('重试此步'),
    );
    act(() => retry?.click());

    expect(onRetry).toHaveBeenCalledWith({ region: '华东', month: '2024-02' });
  });

  it('rejects invalid JSON without calling the retry', () => {
    const onRetry = vi.fn();
    act(() => root.render(<FailurePanel tool={failedTool} onRetry={onRetry} />));

    const textarea = container.querySelector('textarea');
    act(() => {
      setTextareaValue(textarea!, '{ region: 华东 }');
    });
    const retry = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('重试此步'),
    );
    act(() => retry?.click());

    expect(onRetry).not.toHaveBeenCalled();
    expect(container.textContent).toContain('参数不是合法的 JSON');
  });
});
