import { describe, expect, it } from 'vitest';

import {
  SysBOPrincipalType,
  sysBOPrincipalsMetadata,
  sysBOTelephoneNumbersMetadata,
  sysBOPrincipalTelephoneNumbersMetadata,
  type SysBOCreateInput,
  type SysBOUpdateInput,
  type SysBOPrincipal,
} from '@manatos/shared';

import { SYSTEM_AUDIT_ACTOR } from '../src/audit/audit-service.js';
import { sysBOPrincipalsUIMetadata } from '../src/metadata/sysbo-ui-definitions.js';
import { createTestApi } from './test-helpers.js';

describe('SysBOPrincipal declarative enum metadata', () => {

  it('declares the standard metadata-driven record actions required by the shared entry renderer', () => {
    expect(sysBOPrincipalsUIMetadata.record.entryActions).toMatchObject({
      delete: { kind: 'delete', visible: true, label: 'Delete entry' },
      save: { kind: 'save', label: 'Save' },
    });
    expect(sysBOPrincipalsUIMetadata.record.entryActions?.save?.visible).toEqual({
      expression: "mode !== 'view'",
    });
  });
  it('declares icon, containment and parentability traits for every principal type', () => {
    const items = sysBOPrincipalsMetadata.fieldDefinition.principalType.enumItems ?? [];
    const byValue = new Map(items.map((item) => [item.value, item]));

    expect(byValue.get(SysBOPrincipalType.Person)).toMatchObject({ icon: 'person', isContainer: false, canHaveParent: true });
    expect(byValue.get(SysBOPrincipalType.Company)).toMatchObject({ icon: 'building', isContainer: true, canHaveParent: false });
    expect(byValue.get(SysBOPrincipalType.Group)).toMatchObject({ icon: 'people', isContainer: true, canHaveParent: true });
    expect(byValue.get(SysBOPrincipalType.System)).toMatchObject({ icon: 'gear', isContainer: false, canHaveParent: false });
  });


  it('materializes canonical persisted derived rootPrincipalId before commit and cascades it through the hierarchy', async () => {
    expect(sysBOPrincipalsMetadata.fieldDefinition.rootPrincipalId).toMatchObject({
      type: 'reference',
      readOnly: true,
      nullable: true,
      applicationManaged: true,
      referenceBOKey: 'sys-principals',
    });
    expect(sysBOPrincipalsMetadata.derivedFields?.rootPrincipalId).toMatchObject({
      persisted: true,
      expression: "parentId == null ? null : TraverseCtx(parentId, dataList, 'parentId', 'id')",
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
    expect(changed.parentId).toBeNull();
  });

  it('stores Principal telephone numbers through canonical reusable rows and many-to-many links', async () => {
    expect(sysBOTelephoneNumbersMetadata.exposure).toBe('internal');
    expect(sysBOTelephoneNumbersMetadata.fieldDefinition.countryCode).toMatchObject({
      required: true,
      label: 'Country code',
    });
    expect(sysBOPrincipalTelephoneNumbersMetadata.relationships?.telephoneNumber?.references.objectKey)
      .toBe('sys-telephone-numbers');

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
      page: 1, pageSize: 100, direction: 'asc', filters: {},
    });
    const links = await context.store.sysPrincipalTelephoneNumbers.list({
      page: 1, pageSize: 100, direction: 'asc', filters: { principalId: principal.id },
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
      page: 1, pageSize: 100, direction: 'asc', filters: { principalId: principal.id },
    });
    expect(linksAfterRemove.items).toHaveLength(0);
    // Canonical shared value survives unlinking, matching EmailAddress semantics.
    expect((await context.store.sysTelephoneNumbers.list({
      page: 1, pageSize: 100, direction: 'asc', filters: {},
    })).items).toHaveLength(1);
  });

});
