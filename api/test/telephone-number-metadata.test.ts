import { describe, expect, it } from 'vitest';
import {
  sysBOTelephoneNumbersMetadata,
  sysBOPrincipalTelephoneNumbersMetadata,
  type SysTelephoneNumber,
  type SysPrincipalTelephoneNumber,
  evaluateExpression,
  sysBOUsersMetadata,
} from '@manatos/shared';

describe('canonical telephone-number relationship metadata', () => {
  it('keeps country code first-class and models Principal associations explicitly', () => {
    expect(sysBOTelephoneNumbersMetadata.fieldDefinition.name).toMatchObject({
      unique: true,
      readOnly: true,
    });
    expect(sysBOTelephoneNumbersMetadata.fieldDefinition.countryCode).toMatchObject({
      type: 'string',
      required: true,
      maxLength: 5,
    });
    expect(sysBOTelephoneNumbersMetadata.fieldDefinition.fullNumber).toMatchObject({ type: 'telephone', unique: true, readOnly: true });
    expect(sysBOTelephoneNumbersMetadata.fieldDefinition.fullNumber?.calculation).toMatchObject({
      expression: 'TelephoneNbr(countryCode, number)',
      persisted: true,
    });
    expect(sysBOTelephoneNumbersMetadata.fieldDefinition.number).toMatchObject({
      type: 'string',
      required: true,
    });
    expect(sysBOPrincipalTelephoneNumbersMetadata.relationships?.principal?.cardinality).toBe('many-to-one');
    expect(sysBOPrincipalTelephoneNumbersMetadata.relationships?.telephoneNumber?.cardinality).toBe('many-to-one');
  });

  it('marks telephone/link SysBOs as internal canonical entities', () => {
    expect(sysBOTelephoneNumbersMetadata.exposure).toBe('internal');
    expect(sysBOPrincipalTelephoneNumbersMetadata.exposure).toBe('internal');

    const telephone = null as SysTelephoneNumber | null;
    const link = null as SysPrincipalTelephoneNumber | null;
    expect(telephone).toBeNull();
    expect(link).toBeNull();
  });

  it('normalizes both TelephoneNbr signatures and declares User normalization through metadata', () => {
    expect(evaluateExpression('TelephoneNbr(value)', { value: '+30 694-438-6714' }, { value: '+30 694-438-6714' }, { source: 'test' })).toBe('+306944386714');
    expect(evaluateExpression("TelephoneNbr(countryCode, number)", { countryCode: '+30', number: '694 438 6714' }, { countryCode: '+30', number: '694 438 6714' }, { source: 'test' })).toBe('+306944386714');
    expect(sysBOUsersMetadata.fieldDefinition.telephoneNumber).toMatchObject({
      type: 'telephone',
      normalize: { expression: 'TelephoneNbr(value)' },
    });
  });

});
