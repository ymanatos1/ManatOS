import { describe, expect, it } from 'vitest';

import { CollectionDraftRuntime } from '../../src/runtime/state/collection-draft-runtime.js';
import { EntityEntryRuntime } from '../../src/runtime/state/entity-entry-runtime.js';
import { SurfaceRuntime } from '../../src/runtime/surface/surface-runtime.js';

const metadata = {
  key: 'test-items',
  name: 'Item',
  pluralName: 'Items',
  fieldDefinition: {
    id: { key: 'id', label: 'Id', type: 'string', order: 1 },
  },
} as any;
const uiMetadata = {
  key: 'test-items',
  record: { tabs: [], fieldOverrides: {}, entryActions: [], relatedCollections: {} },
} as any;

function fixture() {
  const surfaces = new SurfaceRuntime();
  const surface = surfaces.open({
    host: 'page',
    kind: 'entry',
    mode: 'edit',
    name: 'entry',
    entityKey: 'test-items',
    entry: { original: { id: '1' }, current: { id: '1' }, facts: {} },
  });
  const entry = new EntityEntryRuntime({ surface, surfaces, metadata, uiMetadata });
  entry.initialize({ server: { id: '1' } });
  return { surface, entry };
}

describe('V2 CollectionDraftRuntime', () => {
  it('owns baseline/current values without polluting canonical entry fields', () => {
    const { entry } = fixture();
    const draft = new CollectionDraftRuntime({
      id: 'emails',
      aggregate: entry.aggregate,
      values: [{ address: 'a@example.test' }],
    });
    draft.replace([{ address: 'b@example.test' }]);
    expect(draft.snapshot().dirty).toBe(true);
    expect(draft.snapshot().original).toEqual([{ address: 'a@example.test' }]);
    expect(entry.values()).toEqual({ id: '1' });
    expect(entry.aggregate.snapshot().dirty).toBe(true);
  });

  it('contributes validity and active-editor blocking to the generic aggregate', () => {
    const { entry } = fixture();
    const draft = new CollectionDraftRuntime({
      id: 'phones',
      aggregate: entry.aggregate,
      values: [{ number: '123' }],
      validate: (values) => values.every((value) => Boolean(value.number)),
    });
    draft.replace([{ number: '' }]);
    expect(entry.aggregate.snapshot().valid).toBe(false);
    draft.replace([{ number: '456' }]);
    draft.setEditing(true);
    expect(entry.aggregate.snapshot().blocked).toBe(true);
    draft.setEditing(false);
    expect(entry.aggregate.snapshot().blocked).toBe(false);
  });

  it('can commit or reset its own baseline independently of entity fields', () => {
    const { entry } = fixture();
    const draft = new CollectionDraftRuntime({
      id: 'addresses',
      aggregate: entry.aggregate,
      values: ['A'],
    });
    draft.replace(['B']);
    draft.reset();
    expect(draft.snapshot().current).toEqual(['A']);
    draft.replace(['C']);
    draft.commitBaseline();
    expect(draft.snapshot().dirty).toBe(false);
    expect(draft.snapshot().original).toEqual(['C']);
  });
});
