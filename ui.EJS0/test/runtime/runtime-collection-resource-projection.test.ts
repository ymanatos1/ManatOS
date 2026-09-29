import { describe, expect, it } from 'vitest';

import { projectCollectionResources } from '../../src/runtime/state/collection-resource-projection.js';

describe('V2 collection resource projection', () => {
  it('projects read-only related collections into the same resource contract as collection drafts', () => {
    const projected = projectCollectionResources({
      licenses: { rows: [{ id: 'license-1', name: 'Application license' }], references: {} },
    });

    expect(projected.licenses).toEqual({
      original: [{ id: 'license-1', name: 'Application license' }],
      current: [{ id: 'license-1', name: 'Application license' }],
      references: {},
    });
  });

  it('snapshots exactly the authoritative row representation selected by the loader', () => {
    const projected = projectCollectionResources({
      emailAddresses: {
        rows: [{ id: 'email-1', address: 'user@example.test' }],
        references: { type: [{ value: 'Work', label: 'Work' }] },
      },
    });

    expect(projected.emailAddresses?.current).toEqual([
      { id: 'email-1', address: 'user@example.test' },
    ]);
    expect(projected.emailAddresses?.references.type).toEqual([{ value: 'Work', label: 'Work' }]);
  });

  it('does not manufacture collection resources when no related collection exists', () => {
    expect(projectCollectionResources({})).toEqual({});
  });
});
