import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DockViewSwitch, type DockView } from './DockViewSwitch';

beforeAll(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('DockViewSwitch', () => {
  it('marks the active view and reports the selected one', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let root: Root | undefined;
    const changes: DockView[] = [];

    act(() => {
      root = createRoot(container);
      root.render(<DockViewSwitch value="steps" onChange={(next) => changes.push(next)} />);
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons.map((button) => button.textContent)).toEqual(['Steps', 'Graph', 'Timeline']);
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('false');

    act(() => {
      buttons[2].click();
    });

    expect(changes).toEqual(['timeline']);

    act(() => {
      root?.unmount();
    });
    container.remove();
  });
});
