import { describe, expect, it } from 'vitest';

import {
  resolveEntryRepresentation,
  sysBOPrincipalsMetadata,
  sysBOPrincipalsUIMetadata,
  type SysBOMetadata,
  type SysBOUIMetadata,
} from '@manatos/shared';

describe('canonical entry representation metadata', () => {
  it('resolves Principal name/type/icons without component-specific field declarations', () => {
    const result = resolveEntryRepresentation(
      sysBOPrincipalsMetadata,
      sysBOPrincipalsUIMetadata,
      { id: 'p1', name: 'Yiannakis', principalType: 'Person', description: 'Example' },
      { entityIcon: 'bi-diagram-3-fill' },
    );

    expect(result.name).toBe('Yiannakis');
    expect(result.typeValue).toBe('Person');
    expect(result.typeName).toBe('Person');
    expect(result.typeIcon).toBe('person');
    expect(result.icons).toEqual(['diagram-3-fill', 'person']);
  });

  it('treats a simple canonical field expression as an optional direct source on create records', () => {
    expect(() => resolveEntryRepresentation(
      sysBOPrincipalsMetadata,
      sysBOPrincipalsUIMetadata,
      { name: '' },
      { entityIcon: 'bi-diagram-3-fill' },
    )).not.toThrow();

    const result = resolveEntryRepresentation(
      sysBOPrincipalsMetadata,
      sysBOPrincipalsUIMetadata,
      { name: '' },
      { entityIcon: 'bi-diagram-3-fill' },
    );
    expect(result.typeValue).toBeUndefined();
  });

  it('prefers evaluator formulas and resolves calculated field dependencies lazily', () => {
    const metadata: SysBOMetadata<Record<string, unknown>> = {
      key: 'people', name: 'Person', pluralName: 'People', primaryField: 'id',
      fieldDefinition: {
        id: { key: 'id', label: 'Id', type: 'guid', order: 1 },
        firstName: { key: 'firstName', label: 'First', type: 'string', order: 2 },
        lastName: { key: 'lastName', label: 'Last', type: 'string', order: 3 },
        fullName: {
          key: 'fullName', label: 'Full name', type: 'string', order: 4, readOnly: true,
          calculation: { expression: "firstName + ' ' + lastName" },
        },
      },
      entry: { name: { expression: 'fullName' } },
    };
    const ui: SysBOUIMetadata = {
      key: 'people', list: { visibleFields: ['id'], filterFields: [], sortableFields: [], addAction: { visible: true, label: 'Add' } },
      record: { tabs: [], fieldOverrides: {} },
    };

    expect(resolveEntryRepresentation(metadata, ui, { id: '1', firstName: 'Ada', lastName: 'Lovelace' }).name)
      .toBe('Ada Lovelace');
  });

  it('supports relationship expressions using owner-supplied relation/reference data without I/O', () => {
    const metadata: SysBOMetadata<Record<string, unknown>> = {
      key: 'orders', name: 'Order', pluralName: 'Orders', primaryField: 'id',
      fieldDefinition: {
        id: { key: 'id', label: 'Id', type: 'guid', order: 1 },
        customerTypeId: { key: 'customerTypeId', label: 'Type', type: 'reference', order: 2, referenceBOKey: 'customer-types' },
      },
      relationships: {
        customerType: { fields: ['customerTypeId'], references: { objectKey: 'customer-types', fields: ['id'] }, cardinality: 'many-to-one' },
      },
      entry: { name: { field: 'id' }, type: { expression: 'relations.customerType.name' } },
    };
    const ui: SysBOUIMetadata = {
      key: 'orders', entry: { icon: { mode: 'type' } },
      list: { visibleFields: ['id'], filterFields: [], sortableFields: [], addAction: { visible: true, label: 'Add' } },
      record: { tabs: [], fieldOverrides: {} },
    };
    const result = resolveEntryRepresentation(metadata, ui, { id: 'o1', customerTypeId: 'retail' }, {
      referenceData: { customerTypeId: [{ id: 'retail', name: 'Retail', icon: 'shop' }] },
    });

    expect(result.typeValue).toBe('Retail');
    expect(result.typeName).toBe('Retail');
    expect(result.typeIcon).toBe('shop');
    expect(result.icons).toEqual(['shop']);
  });
});
