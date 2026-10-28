import { describe, expect, it } from 'vitest';
import { ContextTreeRuntime, type ManatOSRuntimeRootContext } from '@manatos/shared';
import {
  UiEmbeddedComponentRegistry,
  type UiEmbeddedComponent,
  type UiEmbeddedInteractionEvent,
  type UiEmbeddedInteractionResult,
  type UiEmbeddedLayoutWriter,
  type UiSemanticContentDefinition,
  type UiSemanticLayoutNode,
} from '../../src/runtime/component.js';
import { createUiSemanticLayoutNode } from '../../src/runtime/layout/node.js';
import { UiSurfaceEmbeddedRuntime } from '../../src/runtime/surface/embedded-runtime.js';
import { UiSurfaceHostRuntime } from '../../src/runtime/surface/host-runtime.js';

/** The SAME semantic event pipeline handles input, key, click, and focus events. */
function fixture(
  behavior: (id: string, event: UiEmbeddedInteractionEvent) => UiEmbeddedInteractionResult | null,
) {
  const context = new ContextTreeRuntime({
    ui: {},
  }) as unknown as ContextTreeRuntime<ManatOSRuntimeRootContext>;
  const level = { control: {}, state: {}, layout: {}, data: { value: 1 } };
  let draft: typeof level | null = level;
  class Node implements UiEmbeddedComponent {
    constructor(private readonly definition: UiSemanticContentDefinition) {}
    bindContext(): void {}
    populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
      if (this.definition.id === 'root') writer.mount(target, { id: 'entry', kind: 'node' }, []);
      if (this.definition.id === 'entry') writer.mount(target, { id: 'field', kind: 'node' }, []);
      if (this.definition.id === 'field') writer.add(target, 'input', 'input', '');
    }
    handleEvent(event: UiEmbeddedInteractionEvent): UiEmbeddedInteractionResult | null {
      return behavior(this.definition.id, event);
    }
  }
  const registry = new UiEmbeddedComponentRegistry().register('node', {
    dataPath: 'data.value',
    create: (definition) => new Node(definition),
  });
  const runtime = new UiSurfaceEmbeddedRuntime(context, 'ctx.ui.level', registry, {
    draft: () => draft,
    name: 'event-test',
    node: (kind, id, selector) => createUiSemanticLayoutNode(kind, id, id, selector),
    componentNode: (definition) =>
      createUiSemanticLayoutNode(definition.kind, definition.id, definition.id, ''),
  });
  runtime.mountRoot({ id: 'root', kind: 'node' }, level.layout);
  const host = new UiSurfaceHostRuntime(context, 'ctx.ui', level);
  draft = null;
  runtime.attach();
  return { runtime, host, target: `${host.levelPath}.layout.entry.field` };
}

describe('UIS target-first semantic event propagation', () => {
  it('propagates across registered parents, independently aggregating effects and preventDefault', () => {
    const calls: string[] = [];
    const { runtime, host, target } = fixture((id, event) => {
      calls.push(`${id}:${event.type}`);
      if (id === 'field') return { handled: true, effects: [{ type: 'validated' }] };
      if (id === 'entry') return { preventDefault: true };
      return { handled: true, effects: [{ type: 'host-request' }] };
    });
    for (const type of ['input', 'keydown', 'click', 'focusout']) {
      calls.length = 0;
      const result = runtime.dispatchEvent(`${target}.input`, {
        type,
        key: type === 'keydown' ? 'Enter' : undefined,
      });
      expect(calls).toEqual([`field:${type}`, `entry:${type}`, `root:${type}`]);
      expect(result).toEqual({
        handled: true,
        consumed: false,
        preventDefault: true,
        effects: [{ type: 'validated' }, { type: 'host-request' }],
      });
    }
    runtime.dispose();
    host.dispose();
  });

  it('stops when consumed, but does not confuse handled with consumed', () => {
    const calls: string[] = [];
    const { runtime, host, target } = fixture((id) => {
      calls.push(id);
      if (id === 'field') return { handled: true };
      if (id === 'entry') return { consume: true, preventDefault: false };
      return { handled: true };
    });
    expect(runtime.dispatchEvent(target, { type: 'keydown', key: 'Escape' })).toEqual({
      handled: true,
      consumed: true,
      preventDefault: false,
      effects: [],
    });
    expect(calls).toEqual(['field', 'entry']);
    expect(() => runtime.dispatchEvent('ctx.foreign.layout', { type: 'click' })).toThrow('escapes');
    runtime.dispose();
    host.dispose();
  });

  it('invalidates event targets on disposal and preserves host fallback for unowned events', () => {
    const { runtime, host, target } = fixture(() => ({ handled: true }));
    expect(runtime.dispatchEvent(`${target}.unknown`, { type: 'click' })).toEqual({
      handled: false,
      consumed: false,
      preventDefault: false,
      effects: [],
    });
    runtime.dispose();
    host.dispose();
    expect(() => runtime.dispatchEvent(target, { type: 'click' })).toThrow('disposed');
  });
});

it('bridges independent native consumption and default prevention', async () => {
  const { dispatchUiNativeComponentEvent } =
    await import('../../src/browser/native-component-events.js');
  const native = new Event('keydown', { cancelable: true, bubbles: true });
  const outcome = dispatchUiNativeComponentEvent(
    native,
    'ctx.ui.level.layout.entry.field',
    { type: 'keydown', key: 'Enter' },
    () => ({ handled: true, consumed: false, preventDefault: true, effects: [] }),
  );
  expect(outcome.consumed).toEqual(false);
  expect(native.defaultPrevented).toEqual(true);
  const other = new Event('click', { cancelable: true, bubbles: true });
  dispatchUiNativeComponentEvent(
    other,
    'ctx.ui.level.layout.entry.field',
    { type: 'click' },
    () => ({ handled: true, consumed: true, preventDefault: false, effects: [] }),
  );
  expect(other.defaultPrevented).toEqual(false);
});

it('routes legacy typed Field and action intents without duplicate framework logic', () => {
  const context = new ContextTreeRuntime({
    ui: {},
  }) as unknown as ContextTreeRuntime<ManatOSRuntimeRootContext>;
  const level = { control: {}, state: {}, layout: {}, data: { value: 1 } };
  let draft: typeof level | null = level;
  class TypedOwner implements UiEmbeddedComponent {
    bindContext(): void {}
    populateLayout(): void {}
    handleControl() {
      return { type: 'set-field', field: 'name', value: 'updated' };
    }
    handleAction() {
      return { type: 'do-action' };
    }
  }
  const registry = new UiEmbeddedComponentRegistry().register('typed-owner', {
    dataPath: 'data.value',
    create: () => new TypedOwner(),
  });
  const runtime = new UiSurfaceEmbeddedRuntime(context, 'ctx.ui.level', registry, {
    draft: () => draft,
    name: 'typed-event-test',
    node: (kind, id, selector) => createUiSemanticLayoutNode(kind, id, id, selector),
    componentNode: (definition) =>
      createUiSemanticLayoutNode(definition.kind, definition.id, definition.id, ''),
  });
  runtime.mountRoot({ id: 'typed', kind: 'typed-owner' }, level.layout);
  const host = new UiSurfaceHostRuntime(context, 'ctx.ui', level);
  draft = null;
  runtime.attach();
  const target = `${host.levelPath}.layout`;
  expect(
    runtime.dispatchEvent(target, { type: 'control-input', control: 'text', value: 'updated' })
      .effects,
  ).toEqual([{ type: 'set-field', field: 'name', value: 'updated' }]);
  expect(runtime.dispatchEvent(target, { type: 'action', action: 'save' }).effects).toEqual([
    { type: 'do-action' },
  ]);
  runtime.dispose();
  host.dispose();
});
