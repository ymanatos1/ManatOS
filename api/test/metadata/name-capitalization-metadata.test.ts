import { describe, expect, it } from 'vitest';
import {
  evaluateExpression,
  normalizeMetadataFieldValues,
  sysBOPrincipalsMetadata,
  sysBOUsersMetadata,
} from '@manatos/shared';

describe('canonical person-name capitalization metadata', () => {
  it('keeps Capitalize conservative and field agnostic', () => {
    expect(
      evaluateExpression(
        'Capitalize(value)',
        { value: 'yiannis' },
        { value: 'yiannis' },
        { source: 'test' },
      ),
    ).toBe('Yiannis');
    expect(
      evaluateExpression(
        'Capitalize(value)',
        { value: 'mCdonald' },
        { value: 'mCdonald' },
        { source: 'test' },
      ),
    ).toBe('MCdonald');
  });

  it('normalizes owner/API-style partial values through the shared canonical helper', () => {
    expect(
      normalizeMetadataFieldValues(sysBOPrincipalsMetadata, {
        firstName: 'yiannis',
        lastName: 'mCdonald',
        name: 'leave me',
      }),
    ).toMatchObject({ firstName: 'Yiannis', lastName: 'MCdonald', name: 'leave me' });
  });

  it('normalizes only firstName and lastName on Users and Principals', () => {
    for (const metadata of [sysBOUsersMetadata, sysBOPrincipalsMetadata]) {
      expect(metadata.fieldDefinition.firstName?.normalize).toEqual({
        expression: 'Capitalize(value)',
      });
      expect(metadata.fieldDefinition.lastName?.normalize).toEqual({
        expression: 'Capitalize(value)',
      });
    }

    expect(sysBOUsersMetadata.fieldDefinition.name?.normalize).toBeUndefined();
    expect(sysBOPrincipalsMetadata.fieldDefinition.name?.normalize).toBeUndefined();
  });
});
