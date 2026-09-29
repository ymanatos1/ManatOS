import { describe, expect, it } from 'vitest';

import { sysBOPrincipalsMetadata, sysBOUsersMetadata, sysBOUsersUIMetadata } from '@manatos/shared';

import {
  ownedReferenceOptions,
  referenceTargetEntityKey,
} from '../../src/runtime/v2/owned-reference-options.js';

describe('owned reference option projection', () => {
  const persisted = [
    {
      id: 'user-1',
      value: 'user-1',
      name: 'Persisted user',
      __entryName: 'Persisted user',
      __entryIcons: ['people-fill'],
    },
  ];

  it('uses canonical relationship metadata to resolve the target entity', () => {
    expect(referenceTargetEntityKey(sysBOPrincipalsMetadata, 'userId')).toBe('sys-users');
  });

  it('projects owner-provided entries without exposing owner transaction structure', () => {
    const projected = ownedReferenceOptions(
      persisted,
      [
        {
          identity: 'draft:nested',
          current: { id: 'draft:nested', name: 'Nested user' },
          deleted: false,
        },
      ],
      sysBOUsersMetadata,
      sysBOUsersUIMetadata,
      'bi-people-fill',
    );
    expect(projected.at(-1)).toMatchObject({
      id: 'draft:nested',
      __entryName: 'Nested user',
      __ownerWorkspaceState: 'owner-workspace',
    });
  });

  it('leaves the factual base domain unchanged when the owner has no target entries', () => {
    const projected = ownedReferenceOptions(
      persisted,
      [],
      sysBOUsersMetadata,
      sysBOUsersUIMetadata,
      'bi-people-fill',
    );
    expect(projected).toEqual(persisted);
    expect(projected[0]).not.toHaveProperty('__ownerWorkspaceState');
  });

  it('adds workspace creates and marks only owner-state candidates', () => {
    const projected = ownedReferenceOptions(
      persisted,
      [
        {
          identity: 'draft:user-2',
          current: { id: 'draft:user-2', name: 'Draft user' },
          deleted: false,
        },
      ],
      sysBOUsersMetadata,
      sysBOUsersUIMetadata,
      'bi-people-fill',
    );
    expect(projected.map((option) => option.id)).toEqual(['user-1', 'draft:user-2']);
    expect(projected[0]).not.toHaveProperty('__ownerWorkspaceState');
    expect(projected[1]).toMatchObject({
      id: 'draft:user-2',
      __entryName: 'Draft user',
      __ownerWorkspaceState: 'owner-workspace',
    });
  });

  it('overlays persistent workspace updates and removes workspace deletes', () => {
    const projected = ownedReferenceOptions(
      persisted,
      [
        { identity: 'user-1', current: { id: 'user-1', name: 'Workspace user' }, deleted: false },
        { identity: 'user-3', current: null, deleted: true },
      ],
      sysBOUsersMetadata,
      sysBOUsersUIMetadata,
      'bi-people-fill',
    );
    expect(projected).toHaveLength(1);
    expect(projected[0]).toMatchObject({
      id: 'user-1',
      __entryName: 'Workspace user',
      __ownerWorkspaceState: 'owner-workspace',
    });
  });
});
