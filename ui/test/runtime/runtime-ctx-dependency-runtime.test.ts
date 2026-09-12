import { describe, expect, it } from 'vitest';
import {
  dependencyChangePathsForEvent,
  reactiveEventMatchesDependencies,
} from '../../src/runtime/calculations/dependency-runtime.js';
import { SurfaceEventRuntime } from '../../src/runtime/events/surface-event-runtime.js';
import {
  bindExpression,
  createEntryExpressionScope,
} from '../../src/runtime/resolvers/expression-binding.js';
import { EffectiveUiMetadataResolver } from '../../src/runtime/resolvers/effective-ui-metadata-resolver.js';
import { EntryStateRuntime } from '../../src/runtime/state/entry-state-runtime.js';
import { SurfaceRuntime } from '../../src/runtime/surface/surface-runtime.js';

describe('UI Runtime V2 reactive event projection', () => {
  it('uses one matcher for local, foreign-surface and root CTX events', () => {
    const localValue = Object.freeze({
      id: 'evt-local',
      sequence: 1,
      timestamp: 1,
      type: 'value:changed' as const,
      surfaceId: 'child',
      source: 'engine' as const,
      causeEventId: null,
      payload: { field: 'name' },
    });
    expect(dependencyChangePathsForEvent('child', localValue)).toEqual([
      'fields.name.value',
      'surface:child:fields.name.value',
    ]);
    expect(reactiveEventMatchesDependencies('child', localValue, ['fields.name.value'])).toBe(true);

    const parentCtx = Object.freeze({
      id: 'evt-parent',
      sequence: 2,
      timestamp: 2,
      type: 'ctx:changed' as const,
      surfaceId: 'parent',
      source: 'engine' as const,
      causeEventId: null,
      payload: { path: 'policy.enabled' },
    });
    expect(
      reactiveEventMatchesDependencies('child', parentCtx, ['surface:parent:policy.enabled']),
    ).toBe(true);
    expect(reactiveEventMatchesDependencies('child', parentCtx, ['policy.enabled'])).toBe(false);
  });
});

describe('UI Runtime V2 canonical CTX dependency paths', () => {
  it('exposes only scope-resolved dependency ownership, not static compatibility projections', () => {
    const binding = bindExpression<boolean>(
      "firstName != '' && state.dirty && mode === 'edit'",
      new Set(['firstName']),
    );

    expect('dependencyPaths' in binding).toBe(false);
    expect('variablePaths' in binding).toBe(false);
    expect('fieldDependencies' in binding).toBe(false);
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

  it('does not evaluate CTX dependencies against a partially initialized entry', () => {
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

    let evaluations = 0;
    entry.addUxCalculation({
      target: 'firstName',
      property: 'visible',
      dependsOn: [`surface:${surface.id}:state.valid`],
      calculate: () => {
        evaluations += 1;
        return true;
      },
    });

    surfaces.setState(surface.id, 'valid', false, 'engine');
    expect(evaluations).toBe(0);

    entry.initialize({});
    expect(evaluations).toBe(1);
    expect(entry.fields.require('firstName').ux.visible).toBe(true);

    surfaces.setState(surface.id, 'valid', true, 'engine');
    expect(evaluations).toBe(2);
  });

  it('evaluates each calculation once per semantic event even when multiple dependency identities match', () => {
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
    entry.defineField('displayName');

    let evaluations = 0;
    entry.addValueCalculation({
      target: 'displayName',
      dependsOn: ['fields.firstName.value', `surface:${surface.id}:fields.firstName.value`],
      calculate: ({ values }) => {
        evaluations += 1;
        return values.firstName;
      },
    });

    entry.initialize({ server: { firstName: 'Yiannis' } });
    expect(evaluations).toBe(1);

    entry.fields.setValue({ field: 'firstName', value: 'John', source: 'user' });
    expect(evaluations).toBe(2);
    expect(entry.fields.require('displayName').value).toBe('John');
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
    expect(
      binding.resolveDependencyPaths(createEntryExpressionScope(surface, entry.fields)),
    ).toEqual([`surface:${surface.id}:mode`]);
  });

  it('projects one canonical event identity for local, inherited and root dependency consumers', () => {
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
    entry.defineField('name');
    entry.addUxCalculation({
      target: 'name',
      property: 'visible',
      dependsOn: [`surface:${parent.id}:policy.enabled`],
      calculate: () => true,
    });
    entry.initialize({});
    expect(entry.fields.require('name').ux.visible).toBe(true);

    entry.fields.setUx('name', 'visible', false, 'engine');
    events.emit({
      type: 'ctx:changed',
      surfaceId: parent.id,
      source: 'engine',
      payload: { path: 'policy.enabled', oldValue: false, newValue: true },
    });
    expect(entry.fields.require('name').ux.visible).toBe(true);
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
          control: { id: parent.id, host: parent.host, kind: parent.kind },
          inheritedPolicy: false,
          level: {
            control: { id: middle.id, host: middle.host, kind: middle.kind },
            level: {
              control: { id: child.id, host: child.host, kind: child.kind },
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
          control: { id: parent.id, host: parent.host, kind: parent.kind },
          policy: { var1: 'parent' },
          level: {
            control: { id: child.id, host: child.host, kind: child.kind },
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
