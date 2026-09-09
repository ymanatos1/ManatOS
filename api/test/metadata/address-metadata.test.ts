import { describe, expect, it } from 'vitest';
import {
  allSysBOMetadata,
  sysBOAddressesMetadata,
  sysBOPrincipalAddressesMetadata,
} from '@manatos/shared';

describe('address metadata', () => {
  it('keeps reusable addresses internal and calculates one canonical formatted description', () => {
    expect(sysBOAddressesMetadata.exposure).toBe('internal');
    expect(sysBOAddressesMetadata.primaryField).toBe('formattedAddress');
    expect(sysBOAddressesMetadata.fieldDefinition.formattedAddress?.calculation?.persisted).toBe(
      true,
    );
    expect(sysBOAddressesMetadata.fieldDefinition.addressLine1?.required).toBe(true);
    expect(sysBOAddressesMetadata.fieldDefinition.city?.required).toBe(true);
    expect(sysBOAddressesMetadata.fieldDefinition.country?.required).toBe(true);
    expect(allSysBOMetadata['sys-addresses']).toBe(sysBOAddressesMetadata);
  });

  it('uses boolean ternary conditions in the canonical formatted-address expression', () => {
    const expression =
      sysBOAddressesMetadata.fieldDefinition.formattedAddress?.calculation?.expression || '';
    expect(expression).toContain("recipientOrAttention != '' ?");
    expect(expression).toContain("stateOrProvince != '' ?");
    expect(expression).not.toContain('recipientOrAttention ?');
  });

  it('links principals to canonical addresses through relationship metadata', () => {
    expect(sysBOPrincipalAddressesMetadata.exposure).toBe('internal');
    expect(sysBOPrincipalAddressesMetadata.relationships?.principal?.references.objectKey).toBe(
      'sys-principals',
    );
    expect(sysBOPrincipalAddressesMetadata.relationships?.address?.references.objectKey).toBe(
      'sys-addresses',
    );
  });
});
