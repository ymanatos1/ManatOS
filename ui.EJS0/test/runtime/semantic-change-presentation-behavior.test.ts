import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

const installPresentation = async (
  entity: Record<string, unknown>,
  levels: Record<string, unknown>,
) => {
  const fakeWindow = {
    ManatOS: {
      ctx: {
        value: { entities: { sample: entity } },
        get: (path: string) => levels[path] ?? null,
      },
      entryRepresentation: {
        projected: (row: Record<string, unknown>, fallback: unknown) => ({
          name: row.label ?? fallback,
          icons: ['person'],
        }),
      },
      enumItemsForField: () => [],
    },
  };
  vi.stubGlobal('window', fakeWindow);
  const { PictureValuePresentation } =
    await import('../../src/runtime/picture-value-presentation.js');
  new PictureValuePresentation().install();
  const { SemanticChangePresentation } =
    await import('../../src/runtime/semantic-change-presentation.js');
  new SemanticChangePresentation().install();
  return (fakeWindow.ManatOS as any).semanticChangePresentation;
};

describe('semantic change field presentation behavior', () => {
  it('uses EN without a browser document and reads EL changes at presentation time', async () => {
    vi.stubGlobal('document', undefined);
    const presentation = await installPresentation(
      { key: 'sample', metadata: { fieldDefinition: { enabled: { type: 'boolean' } } } },
      {},
    );
    expect(presentation.fieldDescriptor('sample', 'enabled', true).label).toBe('Enabled');

    vi.stubGlobal('document', { cookie: 'manatos_ui_language=el' });
    expect(presentation.fieldDescriptor('sample', 'enabled', true).label).toBe('Ενεργό');

    vi.stubGlobal('document', { cookie: 'manatos_ui_language=en' });
    expect(presentation.fieldDescriptor('sample', 'enabled', true).label).toBe('Enabled');
  });

  it('keeps reference fields as entry descriptors even when they have effective options', async () => {
    const entity = {
      key: 'sample',
      metadata: {
        fieldDefinition: { ownerId: { key: 'ownerId', type: 'reference' } },
        relationships: {
          owner: {
            fields: ['ownerId'],
            references: { objectKey: 'people', fields: ['id'] },
          },
        },
      },
    };
    const levels = {
      '$.ui.level1': {
        control: { entityKey: 'sample' },
        data: { fields: { ownerId: { options: [{ id: 'p1', label: 'Mitsos' }] } } },
      },
      '$.ui.level1.data.fields.ownerId.options': [{ id: 'p1', label: 'Mitsos' }],
    };
    const presentation = await installPresentation(entity, levels);

    expect(presentation.fieldDescriptor('sample', 'ownerId', 'p1', '$.ui.level1')).toMatchObject({
      label: 'Mitsos',
      icons: ['bi-person'],
    });
    expect(presentation.fieldDescriptor('sample', 'ownerId', 'p1', '$.ui.level1').kind).not.toBe(
      'option-badge',
    );
  });

  it('uses live effective options for option-backed scalars and metadata for GUID semantics', async () => {
    const entity = {
      key: 'sample',
      metadata: {
        fieldDefinition: {
          role: {
            key: 'role',
            type: 'enum',
            optionItems: [{ value: 'user', label: 'Static User', tone: 'secondary' }],
          },
          id: { key: 'id', type: 'guid', readOnly: true },
          editableGuid: { key: 'editableGuid', type: 'guid', readOnly: false },
        },
      },
    };
    const levels = {
      '$.ui.level1': {
        control: { entityKey: 'sample' },
        data: {
          fields: {
            role: {
              options: [{ value: 'user', label: 'Live User', icon: 'person', tone: 'success' }],
            },
          },
        },
      },
    };
    const presentation = await installPresentation(entity, levels);

    expect(presentation.fieldDescriptor('sample', 'role', 'user', '$.ui.level1')).toMatchObject({
      kind: 'option-badge',
      label: 'Live User',
      icon: 'bi-person',
      tone: 'success',
    });
    expect(
      presentation.fieldDescriptor('sample', 'id', '6f9619ff-8b86-d011-b42d-00cf4fc964ff'),
    ).toMatchObject({
      kind: 'system-identifier',
      label: '6f9619ff-8b86-d011-b42d-00cf4fc964ff',
    });
    expect(presentation.fieldDescriptor('sample', 'id', 'draft:123')).toMatchObject({
      kind: 'system-identifier',
      label: 'draft:123',
    });
    expect(presentation.fieldDescriptor('sample', 'editableGuid', 'abc').kind).toBeUndefined();
  });

  it('uses canonical persisted-picture URLs while pending pictures remain resource-key based', async () => {
    const entity = {
      key: 'sample',
      metadata: { fieldDefinition: { photo: { key: 'photo', component: 'picture' } } },
    };
    const presentation = await installPresentation(entity, {});

    expect(
      presentation.fieldDescriptor(
        'sample',
        'photo',
        { id: 'photo-1', revision: 'r1', pending: false },
        null,
        'record-1',
      ),
    ).toMatchObject({
      imageSrc: '/bo/sample/record-1/picture/photo?revision=r1',
    });
    expect(
      presentation.fieldDescriptor(
        'sample',
        'photo',
        { revision: 'pending:7', pending: true },
        '$.ui.level1',
        'record-1',
      ),
    ).toMatchObject({
      imageResourceKey: 'picture:pending:7',
      fieldKey: 'photo',
    });
    expect(
      presentation.fieldDescriptor(
        'sample',
        'photo',
        { revision: 'pending:7', pending: true },
        '$.ui.level1',
        'record-1',
      ).ownerPath,
    ).toBeUndefined();
  });
});
