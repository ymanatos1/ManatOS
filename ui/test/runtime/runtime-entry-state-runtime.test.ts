import { describe, expect, it } from 'vitest';
import { projectUiCtx } from '../../src/runtime/context/surface-ctx-projection.js';
import { SurfaceEventRuntime } from '../../src/runtime/events/surface-event-runtime.js';
import { EntryStateRuntime } from '../../src/runtime/state/entry-state-runtime.js';
import { SurfaceRuntime } from '../../src/runtime/surface/surface-runtime.js';

function principalEntry(events: SurfaceEventRuntime) {
  const surfaces = new SurfaceRuntime(events);
  const surface = surfaces.open({
    host: 'popup',
    kind: 'entry',
    mode: 'create',
    name: 'principal',
    entityKey: 'sys-principals',
  });
  const entry = new EntryStateRuntime(surface.id, events);
  for (const field of ['principalType', 'firstName', 'lastName', 'name', 'parentId']) {
    entry.defineField(field);
  }
  entry.addValueCalculation({
    target: 'name',
    dependsOn: ['fields.principalType.value', 'fields.firstName.value', 'fields.lastName.value'],
    calculate: ({ values }) => {
      if (values.principalType !== 'Person') return values.name;
      return [values.firstName, values.lastName].filter(Boolean).join(' ');
    },
  });
  entry.addUxCalculation({
    target: 'parentId',
    property: 'readonly',
    dependsOn: ['fields.principalType.value'],
    calculate: ({ values }) => values.principalType === 'Company',
  });
  return { surfaces, surface, entry };
}

describe('UI Runtime V2 entry state and dependency contracts', () => {
  it('wires dependencies before caller defaults so Full name is correct on first render', () => {
    const events = new SurfaceEventRuntime();
    const { entry } = principalEntry(events);

    entry.initialize({
      callerDefaults: { principalType: 'Person', firstName: 'Yiannis', lastName: 'Manatos' },
    });

    expect(entry.fields.require('name').value).toBe('Yiannis Manatos');
    const nameEvent = events
      .history()
      .find(
        (event) =>
          event.type === 'value:changed' && (event.payload as { field?: string }).field === 'name',
      );
    expect(nameEvent?.source).toBe('calculation');
    expect(nameEvent?.causeEventId).not.toBeNull();
  });

  it('uses the same mutation pipeline for server, metadata, caller, relationship, user and calculation values', () => {
    const events = new SurfaceEventRuntime();
    const { entry } = principalEntry(events);
    entry.initialize({
      server: { principalType: 'System' },
      metadataDefaults: { principalType: 'Person' },
      callerDefaults: { firstName: 'Yiannis' },
      callerOverrides: { lastName: 'Manatos' },
    });
    entry.fields.setValue({ field: 'parentId', value: 'parent-1', source: 'relationship' });
    entry.fields.setValue({ field: 'firstName', value: 'John', source: 'user' });

    const sources = events
      .history()
      .filter((event) => event.type === 'value:changed')
      .map((event) => event.source);
    expect(sources).toContain('server');
    expect(sources).toContain('metadata-default');
    expect(sources).toContain('caller-default');
    expect(sources).toContain('caller-override');
    expect(sources).toContain('relationship');
    expect(sources).toContain('user');
    expect(sources).toContain('calculation');
    expect(entry.fields.require('name').value).toBe('John Manatos');
  });

  it('drives calculated UX state from the same dependency events', () => {
    const events = new SurfaceEventRuntime();
    const { entry } = principalEntry(events);
    entry.initialize({ metadataDefaults: { principalType: 'Person' } });
    expect(entry.fields.require('parentId').ux.readonly).toBe(false);

    entry.fields.setValue({ field: 'principalType', value: 'Company', source: 'user' });
    expect(entry.fields.require('parentId').ux.readonly).toBe(true);
    expect(events.history().some((event) => event.type === 'field-state:changed')).toBe(true);
  });

  it('projects recursively nested V2 surfaces and field values into one canonical CTX shape', () => {
    const events = new SurfaceEventRuntime();
    const pages = new SurfaceRuntime(events);
    const page = pages.open({ host: 'page', kind: 'list', mode: 'browse', name: 'principals' });
    const popup = pages.open({
      parentId: page.id,
      host: 'popup',
      kind: 'entry',
      mode: 'create',
      name: 'principal',
    });
    const entry = new EntryStateRuntime(popup.id, events);
    entry.defineField('firstName');
    entry.initialize({ callerDefaults: { firstName: 'Yiannis' } });

    const projection = projectUiCtx(pages, new Map([[popup.id, entry.fields]]));
    const popupCtx = projection.level?.level;
    expect(popupCtx?.control.id).toBe(popup.id);
    expect(popupCtx?.control.mode).toBe('create');
    expect(popupCtx?.control.presentation.kind).toBe('entry');
    expect(popupCtx?.fields?.firstName?.value).toBe('Yiannis');
    expect('mode' in (popupCtx?.control.invocation ?? {})).toBe(false);
  });

  it('does not emit duplicate change events when a calculation resolves to the current value', () => {
    const events = new SurfaceEventRuntime();
    const { entry } = principalEntry(events);
    entry.initialize({
      callerDefaults: { principalType: 'Person', firstName: 'Yiannis', lastName: 'Manatos' },
    });
    const before = events.history().filter((event) => event.type === 'value:changed').length;
    entry.fields.setValue({ field: 'lastName', value: 'Manatos', source: 'user' });
    const after = events.history().filter((event) => event.type === 'value:changed').length;
    expect(after).toBe(before);
  });
});
