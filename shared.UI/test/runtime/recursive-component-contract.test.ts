import { describe, expect, it } from 'vitest';
import { ContextTreeRuntime, type ManatOSRuntimeRootContext } from '@manatos/shared';
import {
  UiEmbeddedComponentRegistry,
  uiComponentServiceToken,
  type UiEmbeddedComponent,
  type UiEmbeddedContextBinding,
  type UiEmbeddedLayoutWriter,
  type UiSemanticContentDefinition,
  type UiSemanticLayoutNode,
} from '../../src/runtime/component.js';
import { createUiSemanticLayoutNode } from '../../src/runtime/layout/node.js';
import { UiSurfaceEmbeddedRuntime } from '../../src/runtime/surface/embedded-runtime.js';
import { UiSurfaceHostRuntime } from '../../src/runtime/surface/host-runtime.js';
import { SIGN_IN_POPUP } from '../../src/popups/auth/definitions.js';
import { UNSAVED_CHANGES_POPUP } from '../../src/popups/unsaved-changes-definition.js';
import { UiPopupRuntime } from '../../src/popups/popup-runtime.js';

/** Real CTX ownership with no Angular/EJS adapter or native DOM dependency. */
const tree = () =>
  new ContextTreeRuntime({ ui: {} }) as unknown as ContextTreeRuntime<ManatOSRuntimeRootContext>;

const service = uiComponentServiceToken<string>('contract-example');

function fixture(
  context: ContextTreeRuntime<ManatOSRuntimeRootContext>,
  parent: string,
  registry: UiEmbeddedComponentRegistry,
) {
  const level = { control: {}, state: {}, layout: {}, data: { sample: 'data' } };
  let draft: typeof level | null = level;
  const runtime = new UiSurfaceEmbeddedRuntime(context, `${parent}.level`, registry, {
    name: 'recursive-test',
    draft: () => draft,
    services: new Map([[service.id, 'host']]),
    node: (kind, id, selector) => createUiSemanticLayoutNode(kind, id, id, selector),
    componentNode: (definition) =>
      createUiSemanticLayoutNode(definition.kind, definition.id, definition.id, ''),
  });
  runtime.mountRoot({ id: 'root', kind: 'root' }, level.layout);
  const host = new UiSurfaceHostRuntime(context, parent, level);
  draft = null;
  runtime.attach();
  return { runtime, host };
}

/** Only the parent decides child placement; each registered child declares its internals. */
function registryFor(events: string[]) {
  class RecursiveComponent implements UiEmbeddedComponent {
    private binding: UiEmbeddedContextBinding | null = null;
    private writer: UiEmbeddedLayoutWriter | null = null;
    constructor(private readonly definition: UiSemanticContentDefinition) {}
    bindContext(binding: UiEmbeddedContextBinding): void {
      this.binding = binding;
      events.push(`bind:${this.definition.id}`);
    }
    provideServices(): ReadonlyMap<symbol, unknown> | undefined {
      return this.definition.id === 'root' ? new Map([[service.id, 'parent']]) : undefined;
    }
    populateLayout(target: UiSemanticLayoutNode, writer: UiEmbeddedLayoutWriter): void {
      this.writer = writer;
      events.push(`layout:${this.definition.id}`);
      if (this.definition.id === 'root') {
        const slot = writer.add(target, 'children', 'region', '');
        writer.mount(slot, { id: 'branch', kind: 'child' }, ['children']);
      } else if (this.definition.id === 'branch') {
        writer.mount(target, { id: 'leaf', kind: 'child' }, []);
      } else if (this.definition.id === 'leaf') {
        expect(this.binding?.services.resolve(service)).toBe('parent');
        expect(this.binding?.parentLayoutPath).toContain('.branch');
      } else if (this.definition.id === 'broken') {
        throw new Error('Invalid child');
      }
    }
    onAttached(): void {
      events.push(`attach:${this.definition.id}`);
    }
    replaceChild(id: string): void {
      if (!this.writer) throw new Error('Not mounted');
      this.writer.replaceChildren(['children'], (target, writer) => {
        writer.mount(target, { id, kind: 'child' }, ['children']);
      });
    }
    dispose(): void {
      events.push(`dispose:${this.definition.id}`);
      this.binding = null;
    }
  }
  const registry = new UiEmbeddedComponentRegistry()
    .register('root', {
      dataPath: 'data.sample',
      create: (definition) => new RecursiveComponent(definition),
    })
    .register('child', {
      dataPath: 'data.sample',
      create: (definition) => new RecursiveComponent(definition),
    });
  return { registry };
}

describe('UIS recursive ownership contract', () => {
  it('reuses the same registered components in Page and nested Popup Hosts', () => {
    const context = tree();
    const events: string[] = [];
    const { registry } = registryFor(events);
    const page = fixture(context, 'ctx.ui', registry);
    const popup = fixture(context, page.host.levelPath, registry);
    expect(context.get(`${page.host.levelPath}.layout.children.branch.leaf`)).toBeDefined();
    expect(context.get(`${popup.host.levelPath}.layout.children.branch.leaf`)).toBeDefined();
    expect(events.slice(0, 9)).toEqual([
      'bind:root',
      'layout:root',
      'bind:branch',
      'layout:branch',
      'bind:leaf',
      'layout:leaf',
      'attach:root',
      'attach:branch',
      'attach:leaf',
    ]);
    popup.runtime.dispose();
    popup.host.dispose();
    page.runtime.dispose();
    page.host.dispose();
    expect(events.slice(-6)).toEqual([
      'dispose:leaf',
      'dispose:branch',
      'dispose:root',
      'dispose:leaf',
      'dispose:branch',
      'dispose:root',
    ]);
  });

  it('replaces subtrees without orphaning ownership, then rolls back failed mounts', () => {
    const context = tree();
    const events: string[] = [];
    const { registry } = registryFor(events);
    const { runtime, host } = fixture(context, 'ctx.ui', registry);
    const root = runtime.componentAt<UiEmbeddedComponent & { replaceChild(id: string): void }>(
      `${host.levelPath}.layout`,
    );
    expect(root).toBeDefined();
    root?.replaceChild('replacement');
    expect(runtime.componentAt(`${host.levelPath}.layout.children.branch`)).toBeUndefined();
    expect(runtime.componentAt(`${host.levelPath}.layout.children.replacement`)).toBeDefined();
    expect(events.slice(-3)).toEqual(['dispose:leaf', 'dispose:branch', 'attach:replacement']);

    // Replacing a child at the SAME path must shadow its retired instance
    // without leaking it or losing the new registration.
    const prior = runtime.componentAt(`${host.levelPath}.layout.children.replacement`);
    root?.replaceChild('replacement');
    expect(runtime.componentAt(`${host.levelPath}.layout.children.replacement`)).not.toBe(prior);
    expect(events.slice(-2)).toEqual(['dispose:replacement', 'attach:replacement']);

    const before = events.length;
    expect(() => root?.replaceChild('broken')).toThrow('Invalid child');
    expect(events.slice(before)).toEqual(['bind:broken', 'layout:broken', 'dispose:broken']);
    expect(runtime.componentAt(`${host.levelPath}.layout.children.replacement`)).toBeDefined();
    runtime.dispose();
    host.dispose();
    expect(events.slice(-2)).toEqual(['dispose:replacement', 'dispose:root']);
  });

  it('keeps optional popup tabs and standalone content under their established CTX paths', () => {
    for (const definition of [SIGN_IN_POPUP, UNSAVED_CHANGES_POPUP]) {
      const context = tree();
      const popup = new UiPopupRuntime(context, definition);
      const layout = context.get(`${popup.levelPath}.layout`) as Record<string, unknown>;
      expect(layout.title).toBeDefined();
      if ('tabs' in definition) {
        expect(layout.tabs).toBeDefined();
        expect(layout.content).toBeUndefined();
      } else {
        expect(layout.content).toBeDefined();
        expect(layout.tabs).toBeUndefined();
      }
      popup.dispose();
    }
  });
});
