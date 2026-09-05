import { describe, expect, it } from 'vitest';

import {
  SysBOPrincipalType,
  sysBOPrincipalsMetadata,
  sysBOPrincipalsUIMetadata,
} from '@manatos/shared';

import {
  hierarchyFinalizationState,
  hierarchyRootIdForMember,
  keyedHierarchySnapshot,
  metadataHierarchyWorkspaceDescriptor,
} from '../src/presentation/metadata-hierarchy-workspace.js';

describe('metadata hierarchy workspace', () => {
  it('discovers a reusable self-reference contract from metadata and keeps record identity as the collection key', () => {
    const descriptor = metadataHierarchyWorkspaceDescriptor(
      sysBOPrincipalsMetadata,
      sysBOPrincipalsUIMetadata,
    );
    expect(descriptor).toMatchObject({
      key: 'organization',
      label: 'Organization',
      idField: 'id',
      parentField: 'parentId',
      rootField: 'rootPrincipalId',
      typeField: 'principalType',
      entryName: { field: 'name' },
      entryType: { expression: 'principalType' },
      containerTrait: 'isContainer',
      canHaveParentTrait: 'canHaveParent',
    });
    expect(descriptor).not.toBeNull();

    const snapshot = keyedHierarchySnapshot(
      [
        { id: 'root', name: 'Root' },
        { id: 'child', name: 'Child', parentId: 'root' },
      ],
      'id',
    );
    expect(Object.keys(snapshot)).toEqual(['root', 'child']);
    expect(snapshot.child?.name).toBe('Child');
  });

  it('uses a populated calculated root field to identify the organization and treats lone Person/System roots as complete only when standalone', () => {
    const descriptor = metadataHierarchyWorkspaceDescriptor(
      sysBOPrincipalsMetadata,
      sysBOPrincipalsUIMetadata,
    )!;
    expect(hierarchyRootIdForMember({ id: 'member', rootPrincipalId: 'root' }, descriptor)).toBe(
      'root',
    );
    expect(hierarchyRootIdForMember({ id: 'root', rootPrincipalId: null }, descriptor)).toBe(
      'root',
    );

    expect(
      hierarchyFinalizationState(
        [{ id: 'person', parentId: null, principalType: SysBOPrincipalType.Person }],
        sysBOPrincipalsMetadata,
        descriptor,
      ).complete,
    ).toBe(true);

    expect(
      hierarchyFinalizationState(
        [{ id: 'system', parentId: null, principalType: SysBOPrincipalType.System }],
        sysBOPrincipalsMetadata,
        descriptor,
      ).complete,
    ).toBe(true);

    const incomplete = hierarchyFinalizationState(
      [
        { id: 'person', parentId: null, principalType: SysBOPrincipalType.Person },
        { id: 'child', parentId: 'person', principalType: SysBOPrincipalType.Person },
      ],
      sysBOPrincipalsMetadata,
      descriptor,
    );
    expect(incomplete.complete).toBe(false);

    expect(
      hierarchyFinalizationState(
        [
          { id: 'group', parentId: null, principalType: SysBOPrincipalType.Group },
          { id: 'system', parentId: 'group', principalType: SysBOPrincipalType.System },
        ],
        sysBOPrincipalsMetadata,
        descriptor,
      ).complete,
    ).toBe(true);
  });
});
