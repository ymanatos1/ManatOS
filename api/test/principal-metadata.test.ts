import { describe, expect, it } from 'vitest';

import {
  SysBOPrincipalType,
  sysBOPrincipalsMetadata,
  sysBOTelephoneNumbersMetadata,
  sysBOPrincipalTelephoneNumbersMetadata,
  type SysBOCreateInput,
  type SysBOUpdateInput,
  type SysBOPrincipal,
  sysBOPrincipalsUIMetadata,
} from '@manatos/shared';

import { SYSTEM_AUDIT_ACTOR } from '../src/audit/audit-service.js';
import { createTestApi } from './test-helpers.js';

describe('SysBOPrincipal declarative enum metadata', () => {
  it('declares the standard metadata-driven record actions required by the shared entry renderer', () => {
    expect(sysBOPrincipalsUIMetadata.record.entryActions).toMatchObject({
      delete: {
        kind: 'delete',
        visible: { expression: "mode !== 'create' && permissions.delete === true" },
        label: 'Delete entry',
      },
      save: { kind: 'save', label: 'Save' },
    });
    expect(sysBOPrincipalsUIMetadata.record.entryActions?.save?.visible).toEqual({
      expression: "mode !== 'view' && (permissions.create === true || permissions.update === true)",
    });
  });
  it('declares icon, containment and parentability traits for every principal type', () => {
    const items = sysBOPrincipalsMetadata.fieldDefinition.principalType.enumItems ?? [];
    const byValue = new Map(items.map((item) => [item.value, item]));

    expect(byValue.get(SysBOPrincipalType.Person)).toMatchObject({
      icon: 'person',
      isContainer: false,
      canHaveParent: true,
      canBeOrganizationRoot: false,
      canStandAloneOrganization: true,
    });
    expect(byValue.get(SysBOPrincipalType.Company)).toMatchObject({
      icon: 'building',
      isContainer: true,
      canHaveParent: false,
      canBeOrganizationRoot: true,
      canStandAloneOrganization: false,
    });
    expect(byValue.get(SysBOPrincipalType.Group)).toMatchObject({
      icon: 'people',
      isContainer: true,
      canHaveParent: true,
      canBeOrganizationRoot: true,
      canStandAloneOrganization: false,
    });
    expect(byValue.get(SysBOPrincipalType.System)).toMatchObject({
      icon: 'gear',
      isContainer: false,
      canHaveParent: true,
      canBeOrganizationRoot: false,
      canStandAloneOrganization: true,
    });
  });

  it('allows System principals to be organization members while preventing non-container principals from parenting children', async () => {
    const context = await createTestApi();
    const group = await context.services.principals.create(
      {
        name: 'System hosts',
        principalType: SysBOPrincipalType.Group,
        parentId: null,
        enabled: true,
      },
      SYSTEM_AUDIT_ACTOR,
    );
    const system = await context.services.principals.create(
      {
        name: 'Integration daemon',
        principalType: SysBOPrincipalType.System,
        parentId: group.id,
        enabled: true,
      },
      SYSTEM_AUDIT_ACTOR,
    );

    expect(system.parentId).toBe(group.id);
    expect(system.rootPrincipalId).toBe(group.id);

    await expect(
      context.services.principals.create(
        {
          name: 'Invalid child',
          principalType: SysBOPrincipalType.Person,
          parentId: system.id,
          enabled: true,
        },
        SYSTEM_AUDIT_ACTOR,
      ),
    ).rejects.toMatchObject({ code: 'PRINCIPAL_PARENT_NOT_CONTAINER' });

    const child = await context.services.principals.create(
      {
        name: 'Ordinary member',
        principalType: SysBOPrincipalType.Person,
        parentId: group.id,
        enabled: true,
      },
      SYSTEM_AUDIT_ACTOR,
    );
    expect(child.parentId).toBe(group.id);

    await expect(
      context.services.principals.update(
        group.id,
        { principalType: SysBOPrincipalType.System },
        SYSTEM_AUDIT_ACTOR,
      ),
    ).rejects.toMatchObject({ code: 'PRINCIPAL_TYPE_CANNOT_CONTAIN_EXISTING_MEMBERS' });
  });

  it('materializes canonical persisted calculated rootPrincipalId before commit and cascades it through the hierarchy', async () => {
    expect(sysBOPrincipalsMetadata.fieldDefinition.rootPrincipalId).toMatchObject({
      type: 'reference',
      readOnly: true,
      nullable: true,
      applicationManaged: true,
      referenceBOKey: 'sys-principals',
    });
    expect(sysBOPrincipalsMetadata.fieldDefinition.rootPrincipalId?.calculation).toMatchObject({
      persisted: true,
      expression:
        "parentId == null ? null : TraverseEntity(parentId, 'sys-principals', 'parentId', 'id')",
    });

    const context = await createTestApi();
    const root = await context.services.principals.create(
      {
        name: 'Organization root',
        principalType: SysBOPrincipalType.Company,
        parentId: null,
        enabled: true,
      },
      SYSTEM_AUDIT_ACTOR,
    );
    expect(root.rootPrincipalId).toBeNull();

    const team = await context.services.principals.create(
      {
        name: 'Nested team',
        principalType: SysBOPrincipalType.Group,
        parentId: root.id,
        enabled: true,
      },
      SYSTEM_AUDIT_ACTOR,
    );
    expect(team.rootPrincipalId).toBe(root.id);

    const member = await context.services.principals.create(
      {
        name: 'Nested person',
        principalType: SysBOPrincipalType.Person,
        parentId: team.id,
        enabled: true,
      },
      SYSTEM_AUDIT_ACTOR,
    );
    expect(member.rootPrincipalId).toBe(root.id);

    // Moving an ancestor to a new root must refresh materialized descendants,
    // not only the row that was directly edited.
    const movedTeam = await context.services.principals.update(
      team.id,
      { parentId: null },
      SYSTEM_AUDIT_ACTOR,
    );
    expect(movedTeam.rootPrincipalId).toBeNull();

    const refreshedMember = await context.services.principals.get(member.id);
    expect(refreshedMember?.rootPrincipalId).toBe(movedTeam.id);
  });

  it('normalizes parentId to null only for principal types that cannot have a parent at the API service boundary', async () => {
    const context = await createTestApi();
    const root = await context.services.principals.create(
      {
        name: 'Root company',
        principalType: SysBOPrincipalType.Company,
        parentId: null,
        enabled: true,
      },
      SYSTEM_AUDIT_ACTOR,
    );

    const person = await context.services.principals.create(
      {
        name: 'Person with attempted parent',
        principalType: SysBOPrincipalType.Person,
        parentId: root.id,
        enabled: true,
      },
      SYSTEM_AUDIT_ACTOR,
    );
    expect(person.parentId).toBe(root.id);

    const company = await context.services.principals.create(
      {
        name: 'Child company attempt',
        principalType: SysBOPrincipalType.Company,
        parentId: root.id,
        enabled: true,
      },
      SYSTEM_AUDIT_ACTOR,
    );
    expect(company.parentId).toBeNull();

    const group = await context.services.principals.create(
      {
        name: 'Nested group',
        principalType: SysBOPrincipalType.Group,
        parentId: root.id,
        enabled: true,
      },
      SYSTEM_AUDIT_ACTOR,
    );
    expect(group.parentId).toBe(root.id);

    const changed = await context.services.principals.update(
      group.id,
      { principalType: SysBOPrincipalType.System },
      SYSTEM_AUDIT_ACTOR,
    );
    // System principals may be organization/group members, so changing a leaf
    // Group to System must preserve its valid parent relationship. System is
    // non-container, which is enforced separately on the parent side.
    expect(changed.parentId).toBe(root.id);
  });

  it('stores Principal telephone numbers through canonical reusable rows and many-to-many links', async () => {
    expect(sysBOTelephoneNumbersMetadata.exposure).toBe('internal');
    expect(sysBOTelephoneNumbersMetadata.fieldDefinition.countryCode).toMatchObject({
      required: true,
      label: 'Country code',
    });
    expect(
      sysBOPrincipalTelephoneNumbersMetadata.relationships?.telephoneNumber?.references.objectKey,
    ).toBe('sys-telephone-numbers');

    const context = await createTestApi();
    const input = {
      name: 'Telephone contact principal',
      principalType: SysBOPrincipalType.Person,
      parentId: null,
      enabled: true,
      relatedChanges: {
        telephoneNumbers: {
          current: [
            { countryCode: '+30', number: '210 123 4567' },
            // Same canonical number with different punctuation must resolve to
            // one shared telephone row/link rather than a duplicate.
            { countryCode: '+30', number: '210-123-4567' },
          ],
        },
      },
    };

    const principal = await context.services.principals.create(
      input as SysBOCreateInput<SysBOPrincipal>,
      SYSTEM_AUDIT_ACTOR,
    );

    const telephones = await context.store.sysTelephoneNumbers.list({
      page: 1,
      pageSize: 100,
      direction: 'asc',
      filters: {},
    });
    const links = await context.store.sysPrincipalTelephoneNumbers.list({
      page: 1,
      pageSize: 100,
      direction: 'asc',
      filters: { principalId: principal.id },
    });

    expect(telephones.items).toHaveLength(1);
    expect(telephones.items[0]).toMatchObject({
      countryCode: '+30',
      number: '210 123 4567',
      name: '+302101234567',
      fullNumber: '+302101234567',
    });
    expect(links.items).toHaveLength(1);
    expect(links.items[0]?.telephoneNumberId).toBe(telephones.items[0]?.id);

    await context.services.principals.update(
      principal.id,
      {
        relatedChanges: { telephoneNumbers: { current: [] } },
      } as SysBOUpdateInput<SysBOPrincipal>,
      SYSTEM_AUDIT_ACTOR,
    );

    const linksAfterRemove = await context.store.sysPrincipalTelephoneNumbers.list({
      page: 1,
      pageSize: 100,
      direction: 'asc',
      filters: { principalId: principal.id },
    });
    expect(linksAfterRemove.items).toHaveLength(0);
    // Canonical shared value survives unlinking, matching EmailAddress semantics.
    expect(
      (
        await context.store.sysTelephoneNumbers.list({
          page: 1,
          pageSize: 100,
          direction: 'asc',
          filters: {},
        })
      ).items,
    ).toHaveLength(1);
  });

  it('reuses canonical email rows across Principals and unlinking one Principal preserves the shared value', async () => {
    const context = await createTestApi();
    const makePrincipal = async (name: string, email: string) =>
      context.services.principals.create(
        {
          name,
          principalType: SysBOPrincipalType.Person,
          parentId: null,
          enabled: true,
          relatedChanges: { emailAddresses: { current: [email] } },
        } as SysBOCreateInput<SysBOPrincipal>,
        SYSTEM_AUDIT_ACTOR,
      );

    const first = await makePrincipal('First email principal', ' Shared.Contact@Example.com ');
    const second = await makePrincipal('Second email principal', 'shared.contact@example.com');

    const emails = await context.store.sysEmailAddresses.list({
      page: 1,
      pageSize: 100,
      direction: 'asc',
      filters: {},
    });
    const firstLinks = await context.store.sysPrincipalEmailAddresses.list({
      page: 1,
      pageSize: 100,
      direction: 'asc',
      filters: { principalId: first.id },
    });
    const secondLinks = await context.store.sysPrincipalEmailAddresses.list({
      page: 1,
      pageSize: 100,
      direction: 'asc',
      filters: { principalId: second.id },
    });

    expect(emails.items).toHaveLength(1);
    expect(firstLinks.items).toHaveLength(1);
    expect(secondLinks.items).toHaveLength(1);
    expect(firstLinks.items[0]?.emailAddressId).toBe(emails.items[0]?.id);
    expect(secondLinks.items[0]?.emailAddressId).toBe(emails.items[0]?.id);

    await context.services.principals.update(
      first.id,
      { relatedChanges: { emailAddresses: { current: [] } } } as SysBOUpdateInput<SysBOPrincipal>,
      SYSTEM_AUDIT_ACTOR,
    );

    expect(
      (
        await context.store.sysPrincipalEmailAddresses.list({
          page: 1,
          pageSize: 100,
          direction: 'asc',
          filters: { principalId: first.id },
        })
      ).items,
    ).toHaveLength(0);
    expect(
      (
        await context.store.sysPrincipalEmailAddresses.list({
          page: 1,
          pageSize: 100,
          direction: 'asc',
          filters: { principalId: second.id },
        })
      ).items,
    ).toHaveLength(1);
    expect(
      (
        await context.store.sysEmailAddresses.list({
          page: 1,
          pageSize: 100,
          direction: 'asc',
          filters: {},
        })
      ).items,
    ).toHaveLength(1);
  });

  it('reuses canonical structured addresses across Principals and preserves the shared row when one link is removed', async () => {
    const context = await createTestApi();
    const address = {
      recipientOrAttention: '',
      organization: '',
      addressLine1: '43 Ipeirou Str.',
      addressLine2: '3rd',
      addressLine3: '',
      poBox: '',
      postalCode: '10439',
      city: 'Athens',
      stateOrProvince: 'Attica',
      country: 'Greece',
    };
    const makePrincipal = async (name: string, currentAddress: typeof address) =>
      context.services.principals.create(
        {
          name,
          principalType: SysBOPrincipalType.Person,
          parentId: null,
          enabled: true,
          relatedChanges: { addresses: { current: [currentAddress] } },
        } as SysBOCreateInput<SysBOPrincipal>,
        SYSTEM_AUDIT_ACTOR,
      );

    const first = await makePrincipal('First address principal', address);
    const second = await makePrincipal('Second address principal', {
      ...address,
      addressLine1: '  43   IPEIROU STR. ',
      city: 'ATHENS',
      country: 'greece',
    });

    const addresses = await context.store.sysAddresses.list({
      page: 1,
      pageSize: 100,
      direction: 'asc',
      filters: {},
    });
    const firstLinks = await context.store.sysPrincipalAddresses.list({
      page: 1,
      pageSize: 100,
      direction: 'asc',
      filters: { principalId: first.id },
    });
    const secondLinks = await context.store.sysPrincipalAddresses.list({
      page: 1,
      pageSize: 100,
      direction: 'asc',
      filters: { principalId: second.id },
    });

    expect(addresses.items).toHaveLength(1);
    expect(addresses.items[0]?.formattedAddress).toContain('43 Ipeirou Str.');
    expect(firstLinks.items[0]?.addressId).toBe(addresses.items[0]?.id);
    expect(secondLinks.items[0]?.addressId).toBe(addresses.items[0]?.id);

    await context.services.principals.update(
      first.id,
      { relatedChanges: { addresses: { current: [] } } } as SysBOUpdateInput<SysBOPrincipal>,
      SYSTEM_AUDIT_ACTOR,
    );

    expect(
      (
        await context.store.sysPrincipalAddresses.list({
          page: 1,
          pageSize: 100,
          direction: 'asc',
          filters: { principalId: first.id },
        })
      ).items,
    ).toHaveLength(0);
    expect(
      (
        await context.store.sysPrincipalAddresses.list({
          page: 1,
          pageSize: 100,
          direction: 'asc',
          filters: { principalId: second.id },
        })
      ).items,
    ).toHaveLength(1);
    expect(
      (
        await context.store.sysAddresses.list({
          page: 1,
          pageSize: 100,
          direction: 'asc',
          filters: {},
        })
      ).items,
    ).toHaveLength(1);
  });

  it('persists all Principal Contact collections atomically in the same Principal transaction', async () => {
    const context = await createTestApi();
    const principal = await context.services.principals.create(
      {
        name: 'Complete contact principal',
        principalType: SysBOPrincipalType.Person,
        parentId: null,
        enabled: true,
        relatedChanges: {
          emailAddresses: { current: ['contact@example.com'] },
          telephoneNumbers: { current: [{ countryCode: '+30', number: '210 555 0100' }] },
          addresses: {
            current: [
              {
                recipientOrAttention: '',
                organization: '',
                addressLine1: '1 Example St.',
                addressLine2: '',
                addressLine3: '',
                poBox: '',
                postalCode: '10000',
                city: 'Athens',
                stateOrProvince: 'Attica',
                country: 'Greece',
              },
            ],
          },
        },
      } as SysBOCreateInput<SysBOPrincipal>,
      SYSTEM_AUDIT_ACTOR,
    );

    expect(
      (
        await context.store.sysPrincipalEmailAddresses.list({
          page: 1,
          pageSize: 100,
          direction: 'asc',
          filters: { principalId: principal.id },
        })
      ).items,
    ).toHaveLength(1);
    expect(
      (
        await context.store.sysPrincipalTelephoneNumbers.list({
          page: 1,
          pageSize: 100,
          direction: 'asc',
          filters: { principalId: principal.id },
        })
      ).items,
    ).toHaveLength(1);
    expect(
      (
        await context.store.sysPrincipalAddresses.list({
          page: 1,
          pageSize: 100,
          direction: 'asc',
          filters: { principalId: principal.id },
        })
      ).items,
    ).toHaveLength(1);

    // A subsequent Principal Save can replace all three collections together;
    // canonical value rows deliberately survive because they may be shared.
    await context.services.principals.update(
      principal.id,
      {
        relatedChanges: {
          emailAddresses: { current: [] },
          telephoneNumbers: { current: [] },
          addresses: { current: [] },
        },
      } as SysBOUpdateInput<SysBOPrincipal>,
      SYSTEM_AUDIT_ACTOR,
    );

    expect(
      (
        await context.store.sysPrincipalEmailAddresses.list({
          page: 1,
          pageSize: 100,
          direction: 'asc',
          filters: { principalId: principal.id },
        })
      ).items,
    ).toHaveLength(0);
    expect(
      (
        await context.store.sysPrincipalTelephoneNumbers.list({
          page: 1,
          pageSize: 100,
          direction: 'asc',
          filters: { principalId: principal.id },
        })
      ).items,
    ).toHaveLength(0);
    expect(
      (
        await context.store.sysPrincipalAddresses.list({
          page: 1,
          pageSize: 100,
          direction: 'asc',
          filters: { principalId: principal.id },
        })
      ).items,
    ).toHaveLength(0);
    expect(
      (
        await context.store.sysEmailAddresses.list({
          page: 1,
          pageSize: 100,
          direction: 'asc',
          filters: {},
        })
      ).items,
    ).toHaveLength(1);
    expect(
      (
        await context.store.sysTelephoneNumbers.list({
          page: 1,
          pageSize: 100,
          direction: 'asc',
          filters: {},
        })
      ).items,
    ).toHaveLength(1);
    expect(
      (
        await context.store.sysAddresses.list({
          page: 1,
          pageSize: 100,
          direction: 'asc',
          filters: {},
        })
      ).items,
    ).toHaveLength(1);
  });
});
