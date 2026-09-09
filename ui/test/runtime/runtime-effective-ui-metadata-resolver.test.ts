import { describe, expect, it } from 'vitest';
import { SurfaceEventRuntime } from '../../src/runtime/events/surface-event-runtime.js';
import { EffectiveUiMetadataResolver } from '../../src/runtime/resolvers/effective-ui-metadata-resolver.js';
import { EntryStateRuntime } from '../../src/runtime/state/entry-state-runtime.js';
import { SurfaceRuntime } from '../../src/runtime/surface/surface-runtime.js';

describe('V2 EffectiveUiMetadataResolver', () => {
  it('uses canonical expressions and the same value-event pipeline for dynamic UI decisions', () => {
    const events = new SurfaceEventRuntime();
    const surfaces = new SurfaceRuntime(events);
    const surface = surfaces.open({
      host: 'page',
      kind: 'entry',
      mode: 'create',
      name: 'principal',
      entityKey: 'sys-principals',
    });
    const entry = new EntryStateRuntime(surface.id, events);
    entry.defineField('principalType');
    entry.defineField('parentId');

    const resolver = new EffectiveUiMetadataResolver();
    resolver.wireEntryFields(surface, entry, [
      { field: 'principalType' },
      {
        field: 'parentId',
        override: { editable: { expression: "principalType !== 'Company'" } },
      },
    ]);

    entry.initialize({ callerDefaults: { principalType: 'Person' } });
    expect(entry.fields.require('parentId').ux.readonly).toBe(false);

    entry.fields.setValue({ field: 'principalType', value: 'Company', source: 'user' });
    expect(entry.fields.require('parentId').ux.readonly).toBe(true);
  });

  it('treats view mode as a universal surface restriction rather than a component-specific check', () => {
    const events = new SurfaceEventRuntime();
    const surfaces = new SurfaceRuntime(events);
    const surface = surfaces.open({
      host: 'popup',
      kind: 'entry',
      mode: 'view',
      name: 'principal',
    });
    const entry = new EntryStateRuntime(surface.id, events);
    entry.defineField('firstName');
    entry.defineField('lastName');

    new EffectiveUiMetadataResolver().wireEntryFields(surface, entry, [
      { field: 'firstName' },
      { field: 'lastName', override: { editable: true } },
    ]);

    expect(entry.fields.require('firstName').ux.readonly).toBe(true);
    expect(entry.fields.require('lastName').ux.readonly).toBe(true);
  });

  it('never lets UI metadata make a canonical read-only field writable', () => {
    const events = new SurfaceEventRuntime();
    const surfaces = new SurfaceRuntime(events);
    const surface = surfaces.open({
      host: 'popup',
      kind: 'entry',
      mode: 'view',
      name: 'principal',
    });
    const entry = new EntryStateRuntime(surface.id, events);
    entry.defineField('name');

    new EffectiveUiMetadataResolver().wireEntryFields(surface, entry, [
      { field: 'name', canonical: { readOnly: true }, override: { editable: true } },
    ]);

    expect(entry.fields.require('name').ux.readonly).toBe(true);
  });
});
