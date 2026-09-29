import { describe, expect, it } from 'vitest';

import {
  allManatOSObjectMetadata,
  allManatOSRelationshipDefinitions,
  relationshipDefinition,
  relationshipBindingForField,
  relationshipEndpointIsSet,
  navigateRelationship,
  relationshipForField,
  relationshipsReferencing,
  validateRelationshipMetadata,
} from '@manatos/shared';

describe('canonical relationship field resolution', () => {
  it('marks relationship source fields as references without duplicating target semantics', () => {
    for (const metadata of Object.values(allManatOSObjectMetadata)) {
      validateRelationshipMetadata(metadata);
      for (const relationship of Object.values(metadata.relationships ?? {})) {
        for (const fieldKey of relationship.fields) {
          const field = metadata.fieldDefinition[fieldKey];
          expect(field, `${metadata.key}.${fieldKey}`).toBeDefined();
          const target = allManatOSObjectMetadata[relationship.references.objectKey];
          const targetFieldKey =
            relationship.references.fields[relationship.fields.indexOf(fieldKey)];
          const targetField = targetFieldKey ? target?.fieldDefinition[targetFieldKey] : undefined;
          if (targetField?.type === 'guid') {
            expect(field?.type, `${metadata.key}.${fieldKey}`).toBe('reference');
          }
          expect(field, `${metadata.key}.${fieldKey}`).not.toHaveProperty('referenceBOKey');
          expect(field, `${metadata.key}.${fieldKey}`).not.toHaveProperty('referenceSelection');
        }
      }
    }
  });

  it('resolves reference semantics from the relationship declaration', () => {
    const licenses = allManatOSObjectMetadata['sys-licenses'];
    const endpoint = relationshipForField(licenses, 'principalId');

    expect(licenses.fieldDefinition.principalId?.type).toBe('reference');
    expect(endpoint?.relationshipKey).toBe('principal');
    expect(endpoint?.relationship.references).toEqual({
      objectKey: 'sys-principals',
      fields: ['id'],
    });
  });

  it('moves reference selection policy to the relationship authority', () => {
    const principals = allManatOSObjectMetadata['sys-principals'];
    const user = principals.relationships?.user;

    expect(principals.fieldDefinition.userId).not.toHaveProperty('referenceSelection');
    expect(user?.selection?.uniqueThrough).toEqual({
      objectKey: 'sys-principals',
      field: 'userId',
    });
  });
  it('materializes one typed direction-aware relationship catalogue with inverse navigation', () => {
    const principalUser = relationshipDefinition(
      allManatOSRelationshipDefinitions,
      'sys-principals',
      'user',
    );
    expect(principalUser).toMatchObject({
      key: 'user',
      sourceObjectKey: 'sys-principals',
      targetObjectKey: 'sys-users',
      inverseCardinality: 'one-to-one',
    });

    const userReferences = relationshipsReferencing(allManatOSRelationshipDefinitions, 'sys-users');
    expect(
      userReferences.map((definition) => `${definition.sourceObjectKey}.${definition.key}`),
    ).toContain('sys-principals.user');

    const parent = relationshipDefinition(
      allManatOSRelationshipDefinitions,
      'sys-principals',
      'parent',
    );
    expect(parent?.relationship.cardinality).toBe('many-to-one');
    expect(parent?.inverseCardinality).toBe('one-to-many');
  });

  it('navigates canonical relationships in both directions with cardinality-aware results', () => {
    const principalUser = relationshipDefinition(
      allManatOSRelationshipDefinitions,
      'sys-principals',
      'user',
    );
    expect(principalUser).toBeDefined();
    if (!principalUser) return;

    const principal = { id: 'p1', userId: 'u1' };
    const user = { id: 'u1', userName: 'admin' };
    expect(navigateRelationship(principalUser, 'forward', principal, [user])).toBe(user);
    expect(navigateRelationship(principalUser, 'inverse', user, [principal])).toBe(principal);

    const parent = relationshipDefinition(
      allManatOSRelationshipDefinitions,
      'sys-principals',
      'parent',
    );
    expect(parent).toBeDefined();
    if (!parent) return;

    const root = { id: 'root', parentId: null };
    const childA = { id: 'a', parentId: 'root' };
    const childB = { id: 'b', parentId: 'root' };
    expect(navigateRelationship(parent, 'forward', childA, [root])).toBe(root);
    expect(navigateRelationship(parent, 'inverse', root, [childA, childB])).toEqual([
      childA,
      childB,
    ]);
  });

  it('treats unset endpoints as unlinked and enforces singular navigation cardinality', () => {
    const principalUser = relationshipDefinition(
      allManatOSRelationshipDefinitions,
      'sys-principals',
      'user',
    );
    expect(principalUser).toBeDefined();
    if (!principalUser) return;

    expect(
      navigateRelationship(principalUser, 'forward', { id: 'p1', userId: null }, [{ id: null }]),
    ).toBeNull();
    expect(relationshipEndpointIsSet(principalUser, 'forward', { id: 'p1', userId: null })).toBe(
      false,
    );
    expect(relationshipEndpointIsSet(principalUser, 'forward', { id: 'p1', userId: '' })).toBe(
      false,
    );
    expect(relationshipEndpointIsSet(principalUser, 'forward', { id: 'p1', userId: 'u1' })).toBe(
      true,
    );
    expect(() =>
      navigateRelationship(principalUser, 'inverse', { id: 'u1' }, [
        { id: 'p1', userId: 'u1' },
        { id: 'p2', userId: 'u1' },
      ]),
    ).toThrow(/violates one-to-one cardinality/);
  });

  it('declares User.principalId as a non-persistent inverse projection of Principal.user', () => {
    const users = allManatOSObjectMetadata['sys-users'];
    expect(users.fieldDefinition.principalId).toMatchObject({
      type: 'reference',
      persistent: false,
    });
    const binding = relationshipBindingForField(
      allManatOSRelationshipDefinitions,
      users,
      'principalId',
    );
    expect(binding).toMatchObject({
      direction: 'inverse',
      definition: { sourceObjectKey: 'sys-principals', key: 'user', targetObjectKey: 'sys-users' },
    });
  });
});
