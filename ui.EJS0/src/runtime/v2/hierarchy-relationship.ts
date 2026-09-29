export type UiHierarchyRelation = 'parent' | 'child' | 'sibling';
export type UiHierarchyRecord = Readonly<Record<string, unknown>>;

export interface UiHierarchyRelationshipOptions {
  readonly identityField: string;
  readonly parentField: string;
  readonly typeField?: string;
  readonly containerTrait?: string;
  readonly canHaveParentTrait?: string;
  readonly rootEligibleTrait?: string;
  readonly standAloneEligibleTrait?: string;
  readonly typeOptions?: readonly Readonly<Record<string, unknown>>[];
  readonly resolveName?: (record: UiHierarchyRecord) => string;
}

export interface UiHierarchyEligibility {
  readonly eligible: boolean;
  readonly reason: string | null;
}

const text = (value: unknown): string => (value == null ? '' : String(value));

export class UiHierarchyRelationshipPolicy {
  constructor(readonly options: UiHierarchyRelationshipOptions) {}

  identity(record: UiHierarchyRecord): string {
    return text(record[this.options.identityField] ?? record.id ?? record.value);
  }

  typeOption(record: UiHierarchyRecord): UiHierarchyRecord | null {
    const { typeField, typeOptions = [] } = this.options;
    if (!typeField) return null;
    return typeOptions.find((candidate) => candidate.value === record[typeField]) ?? null;
  }

  wouldCreateCycle(
    rows: readonly UiHierarchyRecord[],
    movingId: string,
    nextParentId: unknown,
  ): boolean {
    if (nextParentId == null || text(nextParentId) === '') return false;
    const byId = new Map(rows.map((row) => [this.identity(row), row]));
    let cursor = byId.get(text(nextParentId));
    const visited = new Set<string>();
    while (cursor) {
      const cursorId = this.identity(cursor);
      if (!cursorId || visited.has(cursorId)) break;
      if (cursorId === movingId) return true;
      visited.add(cursorId);
      const parentId = cursor[this.options.parentField];
      if (parentId == null || text(parentId) === '') break;
      cursor = byId.get(text(parentId));
    }
    return false;
  }

  eligibility(
    rows: readonly UiHierarchyRecord[],
    member: UiHierarchyRecord | null | undefined,
    candidate: UiHierarchyRecord | null | undefined,
    relation: UiHierarchyRelation,
  ): UiHierarchyEligibility {
    if (!member || !candidate) return { eligible: false, reason: 'Missing hierarchy member.' };
    const memberId = this.identity(member);
    const candidateId = this.identity(candidate);
    if (!memberId || !candidateId || memberId === candidateId)
      return { eligible: false, reason: 'An entry cannot relate to itself.' };

    const {
      parentField,
      canHaveParentTrait,
      containerTrait,
      rootEligibleTrait,
      standAloneEligibleTrait,
    } = this.options;
    const memberOption = this.typeOption(member);
    const candidateOption = this.typeOption(candidate);
    const memberCanHaveParent = !canHaveParentTrait || memberOption?.[canHaveParentTrait] === true;
    const candidateCanHaveParent =
      !canHaveParentTrait || candidateOption?.[canHaveParentTrait] === true;
    const memberCanContain = !containerTrait || memberOption?.[containerTrait] === true;
    const candidateCanContain = !containerTrait || candidateOption?.[containerTrait] === true;
    const name = (row: UiHierarchyRecord, fallback: string) =>
      this.options.resolveName?.(row) || fallback;

    if (relation === 'parent') {
      if (text(member[parentField]) === candidateId)
        return {
          eligible: false,
          reason: `${name(candidate, 'The selected entry')} is already the parent of ${name(member, 'this entry')}.`,
        };
      if (!memberCanHaveParent)
        return { eligible: false, reason: `${name(member, 'This entry')} cannot have a parent.` };
      if (!candidateCanContain)
        return {
          eligible: false,
          reason: `${name(candidate, 'The selected entry')} cannot contain children.`,
        };
    } else if (relation === 'child') {
      if (text(candidate[parentField]) === memberId)
        return {
          eligible: false,
          reason: `${name(candidate, 'The selected entry')} is already a child of ${name(member, 'this entry')}.`,
        };
      if (!memberCanContain)
        return {
          eligible: false,
          reason: `${name(member, 'This entry')} cannot contain children.`,
        };
      if (!candidateCanHaveParent)
        return {
          eligible: false,
          reason: `${name(candidate, 'The selected entry')} cannot have a parent.`,
        };
    } else {
      const nextParentId = member[parentField];
      if (text(candidate[parentField]) === text(nextParentId))
        return {
          eligible: false,
          reason: `${name(candidate, 'The selected entry')} is already a sibling of ${name(member, 'this entry')}.`,
        };
      if (nextParentId != null && text(nextParentId) !== '' && !candidateCanHaveParent)
        return {
          eligible: false,
          reason: `${name(candidate, 'The selected entry')} cannot have a parent.`,
        };
      if ((nextParentId == null || text(nextParentId) === '') && rootEligibleTrait) {
        const rootEligible =
          candidateOption?.[rootEligibleTrait] === true ||
          (standAloneEligibleTrait ? candidateOption?.[standAloneEligibleTrait] === true : false);
        if (!rootEligible)
          return {
            eligible: false,
            reason: `${name(candidate, 'The selected entry')} is not root-eligible.`,
          };
      }
    }

    const movingId = relation === 'parent' ? memberId : candidateId;
    const nextParentId =
      relation === 'parent'
        ? candidateId
        : relation === 'child'
          ? memberId
          : (member[parentField] ?? null);
    if (this.wouldCreateCycle(rows, movingId, nextParentId))
      return { eligible: false, reason: 'That relationship would create a hierarchy cycle.' };
    return { eligible: true, reason: null };
  }

  allowedTypeValuesForNewMember(
    member: UiHierarchyRecord | null | undefined,
    relation: UiHierarchyRelation,
  ): readonly string[] {
    const { typeOptions = [], containerTrait, canHaveParentTrait, parentField } = this.options;
    return typeOptions
      .filter((option) => {
        if (relation === 'child' || relation === 'sibling')
          return !canHaveParentTrait || option[canHaveParentTrait] === true;
        if (relation === 'parent') {
          if (containerTrait && option[containerTrait] !== true) return false;
          const memberHasParent = member?.[parentField] != null && text(member[parentField]) !== '';
          return !memberHasParent || !canHaveParentTrait || option[canHaveParentTrait] === true;
        }
        return true;
      })
      .map((option) => text(option.value))
      .filter(Boolean);
  }

  parentForNewMember(
    member: UiHierarchyRecord | null | undefined,
    relation: UiHierarchyRelation,
  ): unknown {
    if (!member) return null;
    return relation === 'child'
      ? this.identity(member)
      : (member[this.options.parentField] ?? null);
  }

  reparent(
    rows: readonly UiHierarchyRecord[],
    movingId: string,
    nextParentId: unknown,
  ): readonly UiHierarchyRecord[] | null {
    if (!movingId || this.wouldCreateCycle(rows, movingId, nextParentId)) return null;
    let found = false;
    const next = rows.map((row) => {
      if (this.identity(row) !== movingId) return { ...row };
      found = true;
      return { ...row, [this.options.parentField]: nextParentId ?? null };
    });
    return found ? next : null;
  }
}
