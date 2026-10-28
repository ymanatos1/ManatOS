import { describe, expect, it } from 'vitest';
import { allSysBOMetadata, resolveMetadataText } from '@manatos/shared';
import { uiEntryCaption, uiEntryFieldPresentation, uiEntryFieldTools } from '../src/index.js';

const expected: Readonly<Record<string, readonly string[]>> = {
  boolean: [],
  date: ['copy', 'revert', 'today', 'clear'],
  datetime: ['copy', 'revert', 'today', 'now', 'clear'],
  duration: ['copy', 'revert', 'duration-zero', 'clear'],
  email: ['copy', 'revert', 'trim', 'clear'],
  enum: ['copy', 'revert', 'clear'],
  guid: [],
  number: ['copy', 'revert', 'zero', 'clear'],
  picture: [],
  pictures: [],
  reference: ['copy', 'revert', 'view', 'add', 'select', 'clear'],
  richText: [],
  string: ['copy', 'revert', 'trim', 'clear'],
  telephone: ['copy', 'revert', 'trim', 'clear'],
  version: ['copy', 'revert', 'clear'],
};

describe('EJS0 Entry Field Tools and Greek case parity', () => {
  it('uses the Principal nominative, plural, and genitive forms correctly', () => {
    expect(resolveMetadataText('@EN.manatos.principals.principals.label.Principal', 'EL')).toBe(
      'Οντότητα',
    );
    expect(
      resolveMetadataText('@EN.manatos.principals.principals.pluralLabel.Principals', 'EL'),
    ).toBe('Οντότητες');
    expect(uiEntryCaption('sys-principals', { name: 'Guest Yiannis' }, 'EL')).toBe(
      'Επεξεργασία Οντότητας - Guest Yiannis',
    );
  });

  it('matches the EJS0 menu actions for all 15 canonical Field kinds', () => {
    const seen = new Set<string>();
    for (const [entityKey, entity] of Object.entries(allSysBOMetadata)) {
      for (const [fieldKey, definition] of Object.entries(entity.fieldDefinition)) {
        if (seen.has(definition.type) || definition.sensitive) continue;
        const presentation = uiEntryFieldPresentation(entityKey, fieldKey, null, 'EN');
        if (!presentation) continue;
        seen.add(definition.type);
        const actions = uiEntryFieldTools(presentation);
        expect(
          actions.map((action) => action.id),
          definition.type,
        ).toEqual(expected[definition.type]);
        expect(actions.some((action) => action.id === 'inspect-ctx')).toBe(false);
        if (definition.type === 'reference') {
          expect(actions.find((action) => action.id === 'view')?.enabled).toBe(false);
          expect(actions.find((action) => action.id === 'add')?.enabled).toBe(false);
          expect(actions.find((action) => action.id === 'select')?.enabled).toBe(false);
        }
      }
    }
    expect([...seen].sort()).toEqual(Object.keys(expected).sort());
  });

  it('gates Reference actions by selected value and target authorization', () => {
    const base = uiEntryFieldPresentation(
      'sys-users',
      'principalId',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'EN',
    );
    expect(base).not.toBeNull();
    const allowed = uiEntryFieldTools({
      ...base!,
      readOnly: false,
      canViewRelated: true,
      canCreateRelated: true,
    });
    expect(
      allowed
        .filter((action) => ['view', 'add', 'select'].includes(action.id))
        .every((action) => action.enabled),
    ).toBe(true);
    const denied = uiEntryFieldTools({
      ...base!,
      readOnly: false,
      canViewRelated: false,
      canCreateRelated: false,
    });
    expect(denied.find((action) => action.id === 'add')?.visible).toBe(false);
    expect(denied.find((action) => action.id === 'view')?.enabled).toBe(false);
    expect(denied.find((action) => action.id === 'select')?.enabled).toBe(false);
  });

  it('only displays CTX inspection with developer tools enabled', () => {
    const presentation = uiEntryFieldPresentation('sys-users', 'name', 'Some name', 'EL');
    expect(presentation).not.toBeNull();
    expect(uiEntryFieldTools(presentation!).some((action) => action.id === 'inspect-ctx')).toBe(
      false,
    );
    expect(
      uiEntryFieldTools(presentation!, { inspectCtx: true }).find(
        (action) => action.id === 'inspect-ctx',
      )?.enabled,
    ).toBe(true);
  });
});
