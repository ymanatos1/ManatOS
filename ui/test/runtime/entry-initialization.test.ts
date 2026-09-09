import { describe, expect, it } from 'vitest';
import type { SysBOMetadata, SysBOUIMetadata } from '@manatos/shared';
import { buildEntryInitializationSeed } from '../../src/routes/sysbo/entry-initialization.js';

const metadata: SysBOMetadata<Record<string, unknown>> = {
  key: 'sample',
  name: 'Sample',
  pluralName: 'Samples',
  primaryField: 'name',
  fieldDefinition: {
    id: { key: 'id', label: 'Id', type: 'guid', order: 0, readOnly: true },
    name: { key: 'name', label: 'Name', type: 'string', order: 1 },
    enabled: { key: 'enabled', label: 'Enabled', type: 'boolean', order: 2 },
    verified: { key: 'verified', label: 'Verified', type: 'boolean', order: 3, readOnly: true },
    parentId: {
      key: 'parentId',
      label: 'Parent',
      type: 'reference',
      order: 4,
      referenceBOKey: 'sample',
    },
    secret: { key: 'secret', label: 'Secret', type: 'string', order: 5, sensitive: true },
  },
};

const uiMetadata: SysBOUIMetadata = {
  key: 'sample',
  list: {
    visibleFields: ['name'],
    filterFields: [],
    sortableFields: [],
    addAction: { visible: true, label: 'Add' },
  },
  record: {
    tabs: [],
    fieldOverrides: { enabled: { createDefaultValue: true } },
  },
};

describe('shared entry initialization normalization', () => {
  it('gives both engines deterministic create-mode empty values before expressions run', () => {
    const seed = buildEntryInitializationSeed({
      runtimeValues: {},
      metadata,
      uiMetadata,
      mode: 'create',
    });

    expect(seed.fields).toMatchObject({
      id: null,
      name: '',
      enabled: true,
      verified: false,
      parentId: null,
    });
  });

  it('separates API-safe runtime facts and excludes canonical sensitive fields', () => {
    const seed = buildEntryInitializationSeed({
      runtimeValues: {
        id: 'record-1',
        name: 'One',
        enabled: true,
        verified: false,
        secret: 'must-not-leak',
        hasSecret: true,
      },
      metadata,
      uiMetadata,
      mode: 'edit',
    });

    expect(seed.fields.secret).toBeUndefined();
    expect(seed.facts).toEqual({ hasSecret: true });
    expect(seed.fields.verified).toBe(false);
  });
});
