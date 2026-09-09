import { describe, expect, it } from 'vitest';
import {
  sysBOEmailAddressesMetadata,
  sysBOPrincipalEmailAddressesMetadata,
  type SysEmailAddress,
  type SysPrincipalEmailAddress,
} from '@manatos/shared';

describe('canonical email-address relationship metadata', () => {
  it('keeps addresses canonical and models Principal associations explicitly', () => {
    expect(sysBOEmailAddressesMetadata.fieldDefinition.address).toMatchObject({
      type: 'email',
      required: true,
      unique: true,
    });
    expect(sysBOPrincipalEmailAddressesMetadata.relationships?.principal?.cardinality).toBe(
      'many-to-one',
    );
    expect(sysBOPrincipalEmailAddressesMetadata.relationships?.emailAddress?.cardinality).toBe(
      'many-to-one',
    );
  });

  it('marks supporting address/link SysBOs as internal canonical entities', () => {
    expect(sysBOEmailAddressesMetadata.exposure).toBe('internal');
    expect(sysBOPrincipalEmailAddressesMetadata.exposure).toBe('internal');

    // Compile-time naming guard: the domain types intentionally use SysEmailAddress
    // / SysPrincipalEmailAddress rather than the accidental SysBO* variants.
    const address = null as SysEmailAddress | null;
    const link = null as SysPrincipalEmailAddress | null;
    expect(address).toBeNull();
    expect(link).toBeNull();
  });
});
