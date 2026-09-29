import { describe, expect, it } from 'vitest';

import { UiHierarchyRelationshipPolicy } from '../../src/runtime/v2/hierarchy-relationship.js';

const policy = new UiHierarchyRelationshipPolicy({
  identityField: 'id',
  parentField: 'parentId',
  typeField: 'type',
  containerTrait: 'container',
  canHaveParentTrait: 'canParent',
  rootEligibleTrait: 'root',
  standAloneEligibleTrait: 'standalone',
  typeOptions: [
    { value: 'company', container: true, canParent: false, root: true, standalone: true },
    { value: 'group', container: true, canParent: true, root: false, standalone: false },
    { value: 'person', container: false, canParent: true, root: false, standalone: false },
  ],
  resolveName: (row) => String(row.name ?? ''),
});

const rows = [
  { id: 'root', name: 'Root', type: 'company', parentId: null },
  { id: 'group', name: 'Group', type: 'group', parentId: 'root' },
  { id: 'person', name: 'Person', type: 'person', parentId: 'group' },
];

describe('UiHierarchyRelationshipPolicy', () => {
  it('owns relationship eligibility from metadata-derived traits', () => {
    expect(policy.eligibility(rows, rows[2]!, rows[0]!, 'parent')).toEqual({
      eligible: true,
      reason: null,
    });
    expect(policy.eligibility(rows, rows[0]!, rows[2]!, 'parent').reason).toMatch(
      /cannot have a parent/,
    );
    expect(policy.eligibility(rows, rows[2]!, rows[2]!, 'sibling').reason).toMatch(
      /cannot relate to itself/,
    );
  });

  it('rejects cycles before transforming the canonical working graph', () => {
    expect(policy.wouldCreateCycle(rows, 'root', 'person')).toBe(true);
    expect(policy.reparent(rows, 'root', 'person')).toBeNull();
  });

  it('owns new-member type and parent placement policy', () => {
    expect(policy.allowedTypeValuesForNewMember(rows[1], 'child')).toEqual(['group', 'person']);
    expect(policy.allowedTypeValuesForNewMember(rows[2], 'parent')).toEqual(['group']);
    expect(policy.parentForNewMember(rows[1], 'child')).toBe('group');
    expect(policy.parentForNewMember(rows[1], 'sibling')).toBe('root');
    expect(policy.parentForNewMember(rows[1], 'parent')).toBe('root');
  });

  it('returns a pure reparented graph without mutating its input', () => {
    const next = policy.reparent(rows, 'person', 'root');
    expect(next?.find((row) => row.id === 'person')?.parentId).toBe('root');
    expect(rows[2]?.parentId).toBe('group');
  });
});
