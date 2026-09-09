import { describe, expect, it } from 'vitest';
import { SurfaceEventRuntime } from '../../src/runtime/events/surface-event-runtime.js';
import {
  bindExpression,
  createEntryExpressionScope,
} from '../../src/runtime/resolvers/expression-binding.js';
import { EffectiveUiMetadataResolver } from '../../src/runtime/resolvers/effective-ui-metadata-resolver.js';
import { EntryStateRuntime } from '../../src/runtime/state/entry-state-runtime.js';
import { SurfaceRuntime } from '../../src/runtime/surface/surface-runtime.js';

describe('UI Runtime V2 canonical CTX dependency paths', () => {
  it('normalizes field and surface facts into one dependency namespace', () => {
    const binding = bindExpression<boolean>(
      "firstName != '' && state.dirty && mode === 'edit'",
      new Set(['firstName']),
    );

    expect(binding.dependencyPaths).toEqual(['fields.firstName.value', 'state.dirty', 'mode']);
  });

  it('preserves explicit nested V2 UI paths as absolute dependency paths', () => {
    const binding = bindExpression<boolean>('ctx.ui.level.state.loading == false', new Set());
    expect(binding.dependencyPaths).toEqual(['ctx.ui.level.state.loading']);
  });

  it('recalculates declarative UX when canonical non-field CTX state changes', () => {
    const events = new SurfaceEventRuntime();
    const surfaces = new SurfaceRuntime(events);
    const surface = surfaces.open({
      host: 'page',
      kind: 'entry',
      mode: 'edit',
      name: 'principal',
    });
    const entry = new EntryStateRuntime(surface.id, events);
    entry.defineField('firstName');

    new EffectiveUiMetadataResolver().wireEntryFields(surface, entry, [
      { field: 'firstName', override: { visible: { expression: 'state.dirty' } } },
    ]);

    // Expression-backed UX is wired before initialization but intentionally
    // not evaluated against partial/null entry state. Initialization performs
    // the first deterministic resolution.
    entry.initialize({});
    expect(entry.fields.require('firstName').ux.visible).toBe(false);
    const change = surfaces.setState(surface.id, 'dirty', true, 'user');
    expect(change?.type).toBe('ctx:changed');
    expect(entry.fields.require('firstName').ux.visible).toBe(true);

    const ctxEvent = events.history().find((event) => event.type === 'ctx:changed');
    expect((ctxEvent?.payload as { path?: string }).path).toBe('state.dirty');
  });

  it('keeps immutable surface facts declarative without requiring mutation events', () => {
    const events = new SurfaceEventRuntime();
    const surfaces = new SurfaceRuntime(events);
    const surface = surfaces.open({
      host: 'popup',
      kind: 'entry',
      mode: 'create',
      name: 'principal',
    });
    const entry = new EntryStateRuntime(surface.id, events);
    entry.defineField('firstName');
    const binding = bindExpression<boolean>("mode === 'create'", new Set(['firstName']));

    expect(binding.evaluate(createEntryExpressionScope(surface, entry.fields), 'test.mode')).toBe(
      true,
    );
    expect(binding.dependencyPaths).toEqual(['mode']);
  });
});

describe('UI Runtime V2 lexical parent dependencies', () => {
  it('walks three UI levels upward for the first missing identifier and binds to its owner', () => {
    const events = new SurfaceEventRuntime();
    const surfaces = new SurfaceRuntime(events);
    const parent = surfaces.open({ host: 'page', kind: 'list', mode: 'browse', name: 'parents' });
    const middle = surfaces.open({
      parentId: parent.id,
      host: 'popup',
      kind: 'selector',
      mode: 'select',
      name: 'middle',
    });
    const child = surfaces.open({
      parentId: middle.id,
      host: 'popup',
      kind: 'entry',
      mode: 'edit',
      name: 'child',
      entry: {},
    });
    const entry = new EntryStateRuntime(child.id, events);
    entry.defineField('name');

    let root: Readonly<Record<string, unknown>> = {
      ui: {
        level: {
          id: parent.id,
          host: parent.host,
          kind: parent.kind,
          inheritedPolicy: false,
          level: {
            id: middle.id,
            host: middle.host,
            kind: middle.kind,
            level: {
              id: child.id,
              host: child.host,
              kind: child.kind,
            },
          },
        },
      },
    };
    const rootSource = () => root;
    const binding = bindExpression<boolean>('inheritedPolicy', new Set(['name']));
    const scope = createEntryExpressionScope(child, entry.fields, rootSource);

    expect(binding.evaluate(scope, 'test.inheritedPolicy')).toBe(false);
    expect(binding.resolveDependencyPaths(scope)).toEqual([`surface:${parent.id}:inheritedPolicy`]);

    new EffectiveUiMetadataResolver().wireEntryFields(
      child,
      entry,
      [{ field: 'name', override: { visible: { expression: 'inheritedPolicy' } } }],
      rootSource,
    );
    entry.initialize({});
    expect(entry.fields.require('name').ux.visible).toBe(false);

    root = {
      ui: {
        ...(root.ui as Record<string, unknown>),
        level: {
          ...((root.ui as Record<string, unknown>).level as Record<string, unknown>),
          inheritedPolicy: true,
        },
      },
    };
    events.emit({
      type: 'ctx:changed',
      surfaceId: parent.id,
      source: 'engine',
      payload: { path: 'inheritedPolicy', oldValue: false, newValue: true },
    });
    expect(entry.fields.require('name').ux.visible).toBe(true);
  });

  it('uses whole-container shadowing: once the first identifier is found, dotted members do not climb', () => {
    const events = new SurfaceEventRuntime();
    const surfaces = new SurfaceRuntime(events);
    const parent = surfaces.open({ host: 'page', kind: 'list', mode: 'browse', name: 'parents' });
    const child = surfaces.open({
      parentId: parent.id,
      host: 'popup',
      kind: 'entry',
      mode: 'edit',
      name: 'child',
      entry: {},
    });
    const entry = new EntryStateRuntime(child.id, events);
    const root = {
      ui: {
        level: {
          id: parent.id,
          host: parent.host,
          kind: parent.kind,
          policy: { var1: 'parent' },
          level: {
            id: child.id,
            host: child.host,
            kind: child.kind,
            policy: { other: 'child' },
          },
        },
      },
    };
    const binding = bindExpression('policy.var1');
    const scope = createEntryExpressionScope(child, entry.fields, root);

    expect(() => binding.evaluate(scope, 'test.shadowing')).toThrow();
    expect(binding.resolveDependencyPaths(scope)).toEqual([`surface:${child.id}:policy.var1`]);
  });
});
