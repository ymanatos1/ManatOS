import { describe, expect, it } from 'vitest';
import type { SysBOMetadata } from '@manatos/shared';
import { formPayloadForMetadata } from '../../src/routes/sysbo/entry/form-payload.js';

const metadata: SysBOMetadata<Record<string, unknown>> = {
  key: 'sample',
  subsystem: 'test',
  name: 'samples',
  label: 'Sample',
  pluralLabel: 'Samples',
  primaryField: 'description',
  fieldDefinition: {
    id: { key: 'id', label: 'Id', type: 'guid', order: 0, readOnly: true },
    parentId: { key: 'parentId', label: 'Parent', type: 'guid', order: 1, nullable: true },
    description: {
      key: 'description',
      label: 'Description',
      type: 'string',
      order: 2,
      nullable: true,
    },
    enabled: { key: 'enabled', label: 'Enabled', type: 'boolean', order: 3 },
  },
  relationships: {},
};

describe('metadata form update presence semantics', () => {
  it('does not mutate an omitted disabled field while accepting an unrelated edit', () => {
    expect(formPayloadForMetadata({ description: 'changed' }, 'sample', metadata)).toEqual({
      description: 'changed',
    });
  });

  it('keeps explicit nullable clearing distinct from omission', () => {
    expect(formPayloadForMetadata({ description: '' }, 'sample', metadata)).toEqual({
      description: null,
    });
  });

  it('uses the editable boolean presence marker to distinguish unchecked false from disabled omission', () => {
    expect(
      formPayloadForMetadata({ __manatos_field_present__enabled: '1' }, 'sample', metadata),
    ).toEqual({ enabled: false });
    expect(formPayloadForMetadata({}, 'sample', metadata)).toEqual({});
    expect(
      formPayloadForMetadata(
        { __manatos_field_present__enabled: '1', enabled: 'on' },
        'sample',
        metadata,
      ),
    ).toEqual({ enabled: true });
  });
});
