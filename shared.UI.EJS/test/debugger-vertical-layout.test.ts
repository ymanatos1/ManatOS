// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { DebuggerVerticalLayout } from '../src/components/debugger/DebuggerVerticalLayout.js';

function measured(element: HTMLElement, fallback = 0): void {
  element.getBoundingClientRect = () => {
    const height = Number.parseFloat(element.style.height) || fallback;
    return {
      x: 0,
      y: 0,
      top: 0,
      right: 0,
      bottom: height,
      left: 0,
      width: 0,
      height,
      toJSON: () => ({}),
    } as DOMRect;
  };
}

function pointer(type: string, clientY: number): PointerEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    clientY: { value: clientY },
    button: { value: 0 },
  });
  return event;
}

async function frame(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 5));
}

describe('DebuggerVerticalLayout', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps drag sizing direct while preserving preferred heights through constrained layouts', async () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) =>
      window.setTimeout(() => callback(performance.now()), 0),
    );
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => window.clearTimeout(id));

    const dock = document.createElement('aside');
    const container = document.createElement('section');
    const toolbar = document.createElement('div');
    const findRegion = document.createElement('div');
    const find = document.createElement('div');
    const propertiesRegion = document.createElement('div');
    const properties = document.createElement('section');
    const tree = document.createElement('div');
    const cli = document.createElement('section');
    const cliHandle = document.createElement('div');
    let containerHeight = 600;

    Object.defineProperty(container, 'clientHeight', {
      configurable: true,
      get: () => containerHeight,
    });
    toolbar.style.height = '40px';
    findRegion.style.display = 'contents';
    find.style.height = '20px';
    findRegion.appendChild(find);
    propertiesRegion.style.display = 'contents';
    properties.dataset.debugResizablePanel = 'ctx-properties';
    properties.dataset.debugPreferredHeight = '190';
    properties.style.height = '190px';
    propertiesRegion.appendChild(properties);
    tree.dataset.debugFlexiblePanel = '';
    tree.dataset.debugFlexiblePreferredHeight = '128';
    tree.style.minHeight = '64px';
    cli.dataset.debugResizablePanel = 'cli';
    cli.dataset.debugPreferredHeight = '192';
    cli.style.height = '192px';
    cliHandle.dataset.debugVerticalResize = 'cli';
    cli.appendChild(cliHandle);
    measured(toolbar, 40);
    measured(find, 20);
    measured(properties, 190);
    measured(tree);
    measured(cli, 192);
    container.append(toolbar, findRegion, propertiesRegion, tree, cli);
    dock.appendChild(container);
    document.body.appendChild(dock);

    const changes: Array<readonly [string, number | null]> = [];
    const layout = new DebuggerVerticalLayout({
      dock,
      heightChanged: (key, height) => changes.push([key, height]),
    });
    await frame();

    expect(properties.style.height).toBe('190px');
    expect(cli.style.height).toBe('192px');
    expect(cli.style.flex).toBe('0 0 auto');

    cliHandle.dispatchEvent(pointer('pointerdown', 400));
    document.dispatchEvent(pointer('pointermove', 310));
    expect(cli.style.height).toBe('222px');
    layout.refresh();
    await frame();
    expect(cli.style.height).toBe('222px');
    expect(changes).toEqual([]);
    document.dispatchEvent(pointer('pointerup', 310));
    expect(changes).toEqual([['cli', 222]]);
    expect(cli.dataset.debugPreferredHeight).toBe('222');

    containerHeight = 350;
    layout.refresh();
    await frame();
    expect(properties.style.height).toBe('110px');
    expect(cli.style.height).toBe('96px');
    expect(properties.dataset.debugPreferredHeight).toBe('190');
    expect(cli.dataset.debugPreferredHeight).toBe('222');

    containerHeight = 600;
    layout.refresh();
    await frame();
    expect(properties.style.height).toBe('190px');
    expect(cli.style.height).toBe('222px');

    cliHandle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    await frame();
    expect(changes.at(-1)).toEqual(['cli', null]);
    expect(cli.dataset.debugPreferredHeight).toBe('192');

    layout.destroy();
    dock.remove();
  });
});
