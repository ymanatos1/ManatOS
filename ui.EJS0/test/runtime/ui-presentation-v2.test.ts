import { describe, expect, it, vi } from 'vitest';

import { EntityFieldBinding } from '../../src/runtime/v2/binding.js';
import { UiComponentInstance, type UiComponentDefinition } from '../../src/runtime/v2/component.js';
import { UiPresentationInstance } from '../../src/runtime/v2/presentation.js';
import {
  UiContext,
  type UiCtxObject,
  type UiCtxRuntimePort,
} from '../../src/runtime/v2/ui-context.js';
import { UiRuntime } from '../../src/runtime/v2/ui-runtime.js';

const fixture = () => {
  const levelValue: UiCtxObject = {
    control: { id: 'entry' },
    state: { lifecycle: 'active', active: true, presentation: {} },
    data: {
      entry: { current: { name: 'Before' }, original: { name: 'Before' } },
      fields: { name: { value: 'Before' } },
    },
    components: { general: {}, details: {} },
  };
  const root: UiCtxObject = { ui: { level: levelValue } };
  const get = (path: string): unknown => {
    let value: unknown = root;
    for (const part of path
      .replace(/^ctx\.?/, '')
      .split('.')
      .filter(Boolean)) {
      if (!value || typeof value !== 'object') return undefined;
      value = (value as UiCtxObject)[part];
    }
    return value;
  };
  const replace = (path: string, value: unknown) => {
    const parts = path
      .replace(/^ctx\.?/, '')
      .split('.')
      .filter(Boolean);
    const key = parts.pop();
    let owner = root;
    for (const part of parts) {
      if (!owner[part] || typeof owner[part] !== 'object') owner[part] = {};
      owner = owner[part] as UiCtxObject;
    }
    if (key) owner[key] = value;
    return value;
  };
  const port: UiCtxRuntimePort = {
    value: root,
    get,
    set: replace,
    replace,
    delete: vi.fn(),
    add: vi.fn(),
  };
  const context = new UiContext('ctx.ui.level', levelValue, port);
  const runtime = new UiRuntime();
  const level = runtime.adoptChild(
    runtime.root,
    'entry',
    { surface: 'entry', host: 'page' },
    context,
  );
  return { context, level };
};

const component = (
  context: UiContext,
  level: ReturnType<typeof fixture>['level'],
  id: string,
  calls: string[],
) => {
  const definition: UiComponentDefinition<EntityFieldBinding<string>> = {
    id: `test-${id}`,
    contractVersion: 1,
    create: () => ({
      mount: () => calls.push(`${id}:mount`),
      unmount: () => calls.push(`${id}:unmount`),
      dispose: () => calls.push(`${id}:dispose`),
    }),
  };
  return new UiComponentInstance(
    id,
    level,
    context,
    definition,
    new EntityFieldBinding(context, 'name'),
  );
};

describe('V2 presentation composition', () => {
  it('mounts only the selected tab and changes tabs without changing UiLevel identity or semantic state', () => {
    const { context, level } = fixture();
    const calls: string[] = [];
    const presentation = new UiPresentationInstance(level, context, {
      tabs: [
        { id: 'general', regions: [{ id: 'body' }] },
        { id: 'details', regions: [{ id: 'body' }] },
      ],
      initialTabId: 'general',
    });
    presentation.addComponent(component(context, level, 'general', calls), 'body', 'general');
    presentation.addComponent(component(context, level, 'details', calls), 'body', 'details');

    presentation.mount();
    expect(calls).toEqual(['general:mount']);
    presentation.selectTab('details');

    expect(calls).toEqual(['general:mount', 'general:unmount', 'details:mount']);
    expect(presentation.level).toBe(level);
    expect(context.get('data.entry.current.name')).toBe('Before');
    expect(context.get('state.presentation.selectedTabId')).toBe('details');
  });

  it('restores valid tab selection from level CTX when a view is rematerialized', () => {
    const { context, level } = fixture();
    context.set('state.presentation.selectedTabId', 'details', { source: 'test' });
    const presentation = new UiPresentationInstance(level, context, {
      tabs: [
        { id: 'general', regions: [{ id: 'body' }] },
        { id: 'details', regions: [{ id: 'body' }] },
      ],
      initialTabId: 'general',
    });
    expect(presentation.selectedTabId).toBe('details');
  });

  it('disposes view-owned components deepest-first without touching semantic CTX', () => {
    const { context, level } = fixture();
    const calls: string[] = [];
    const presentation = new UiPresentationInstance(level, context, {
      regions: [{ id: 'header' }],
      tabs: [{ id: 'general', regions: [{ id: 'body' }] }],
    });
    presentation.addComponent(component(context, level, 'header', calls), 'header');
    presentation.addComponent(component(context, level, 'body', calls), 'body', 'general');
    presentation.mount();
    presentation.dispose();
    presentation.dispose();

    expect(presentation.lifecycle).toBe('disposed');
    expect(calls).toContain('body:dispose');
    expect(calls).toContain('header:dispose');
    expect(context.get('data.entry.current.name')).toBe('Before');
  });
});
