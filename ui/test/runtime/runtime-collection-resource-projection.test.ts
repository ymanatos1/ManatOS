import { describe, expect, it } from 'vitest';

import { projectCollectionResources } from '../../src/runtime/state/collection-resource-projection.js';

describe('V2 collection resource projection', () => {
  it('projects read-only related collections into the same resource contract as collection drafts', () => {
    const projected = projectCollectionResources(
      { licenses: [{ id: 'license-1', name: 'Application license' }] },
      {},
    );

    expect(projected.licenses).toEqual({
      original: [{ id: 'license-1', name: 'Application license' }],
      current: [{ id: 'license-1', name: 'Application license' }],
    });
  });

  it('prefers the canonical editable representation when a collection editor supplies one', () => {
    const projected = projectCollectionResources(
      { emailAddresses: [{ id: 'link-1', emailAddressId: 'email-1' }] },
      { emailAddresses: [{ id: 'email-1', address: 'user@example.test' }] },
    );

    expect(projected.emailAddresses?.current).toEqual([
      { id: 'email-1', address: 'user@example.test' },
    ]);
    expect(projected.emailAddresses?.current).not.toEqual([
      { id: 'link-1', emailAddressId: 'email-1' },
    ]);
  });

  it('does not manufacture collection resources when no related collection exists', () => {
    expect(projectCollectionResources({}, {})).toEqual({});
  });
});
