import {entryNameSource, entryTypeSource, type ManatOSEntryValueSourceMetadata, type SysBOMetadata, type SysBOUIComponentMetadata, type SysBOUIMetadata} from '@manatos/shared';

/**
 * Renderer-neutral contract for a self-referencing entity hierarchy workspace.
 *
 * The workspace intentionally knows nothing about Principals, Companies,
 * Groups, or any future customer-defined entity. Field names and enum-trait
 * semantics come from canonical metadata/component options supplied by the
 * consuming entity.
 */
export interface MetadataHierarchyWorkspaceDescriptor {
  key: string;
  label: string;
  component: Readonly<SysBOUIComponentMetadata>;
  idField: string;
  parentField: string;
  rootField: string | null;
  labelField: string;
  typeField: string | null;
  entryName: ManatOSEntryValueSourceMetadata;
  entryType: ManatOSEntryValueSourceMetadata | null;
  containerTrait: string | null;
  canHaveParentTrait: string | null;
  rootEligibleTrait: string | null;
  standAloneEligibleTrait: string | null;
}

export interface MetadataHierarchyFinalizationState {
  memberCount: number;
  rootId: string | null;
  complete: boolean;
  reason: string | null;
}

function optionString(
  component: Readonly<SysBOUIComponentMetadata>,
  key: string,
): string | null {
  const value = component.options?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Discover the hierarchy workspace contract from UI metadata.
 *
 * The first hierarchy-tree component that explicitly declares workspaceKey is
 * the entity's hierarchy workspace. This lets other entities opt in simply by
 * metadata; generic routes/renderers never switch on entity names.
 */
export function metadataHierarchyWorkspaceDescriptor<T extends object>(
  metadata: SysBOMetadata<T>,
  uiMetadata: SysBOUIMetadata,
): MetadataHierarchyWorkspaceDescriptor | null {
  for (const tab of uiMetadata.record.tabs) {
    const candidates = [
      ...(tab.component ? [tab.component] : []),
      ...(tab.content ?? []).flatMap((item) => item.kind === 'component' ? [item.component] : []),
    ];

    for (const component of candidates) {
      if (component.key !== 'hierarchy-tree') continue;
      const key = optionString(component, 'workspaceKey');
      if (!key) continue;

      const idField = optionString(component, 'idField');
      const parentField = optionString(component, 'parentField');
      if (!idField || !parentField) continue;

      const entryName = entryNameSource(metadata);
      const entryType = entryTypeSource(metadata);
      const directField = (source: ManatOSEntryValueSourceMetadata | null): string | null => {
        if (!source) return null;
        if ('field' in source) return source.field;
        const expression = source.expression.trim();
        return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(expression) && metadata.fieldDefinition[expression]
          ? expression
          : null;
      };

      return {
        key,
        label: optionString(component, 'workspaceLabel') ?? 'Hierarchy',
        component,
        idField,
        parentField,
        rootField: optionString(component, 'rootField'),
        // Sorting/fallback infrastructure still needs a concrete field. Entry
        // renderers use entryName itself and therefore support formulas.
        labelField: directField(entryName) ?? metadata.primaryField,
        typeField: directField(entryType),
        entryName,
        entryType,
        containerTrait: optionString(component, 'containerTrait'),
        canHaveParentTrait: optionString(component, 'canHaveParentTrait'),
        rootEligibleTrait: optionString(component, 'rootEligibleTrait'),
        standAloneEligibleTrait: optionString(component, 'standAloneEligibleTrait'),
      };
    }
  }

  return null;
}

/**
 * Create the ID-keyed snapshot used by hierarchy entryOriginal/entry.
 * Ordering is deliberately absent: stable entity identity, not array position,
 * owns every working member.
 */
export function keyedHierarchySnapshot(
  rows: readonly Readonly<Record<string, unknown>>[],
  idField: string,
): Readonly<Record<string, Readonly<Record<string, unknown>>>> {
  const entries: Array<[string, Readonly<Record<string, unknown>>]> = [];
  for (const row of rows) {
    const id = row[idField];
    if (id === null || id === undefined || String(id) === '') continue;
    entries.push([String(id), Object.freeze({ ...row })]);
  }
  return Object.freeze(Object.fromEntries(entries));
}

/**
 * Resolve the persisted organization/hierarchy root for an invocation member.
 * A populated calculated root field identifies the hierarchy; otherwise the
 * invocation member itself is the root candidate.
 */
export function hierarchyRootIdForMember(
  member: Readonly<Record<string, unknown>>,
  descriptor: MetadataHierarchyWorkspaceDescriptor,
): string | null {
  const memberId = member[descriptor.idField];
  if (memberId === null || memberId === undefined || String(memberId) === '') return null;

  if (descriptor.rootField) {
    const rootId = member[descriptor.rootField];
    if (rootId !== null && rootId !== undefined && String(rootId) !== '') {
      return String(rootId);
    }
  }

  return String(memberId);
}

/**
 * Lightweight, non-blocking completeness indicator for the current hierarchy.
 *
 * This is intentionally not yet an authorization/licensing rule. It only
 * projects metadata traits into a workspace hint. Future ownership/licensing
 * work may strengthen or replace the finalization policy without changing the
 * generic hierarchy editor contract.
 */
export function hierarchyFinalizationState<T extends object>(
  rows: readonly Readonly<Record<string, unknown>>[],
  metadata: SysBOMetadata<T>,
  descriptor: MetadataHierarchyWorkspaceDescriptor,
): MetadataHierarchyFinalizationState {
  const memberCount = rows.length;
  if (!memberCount) {
    return { memberCount: 0, rootId: null, complete: false, reason: 'The hierarchy has no members yet.' };
  }

  const roots = rows.filter((row) => {
    const parent = row[descriptor.parentField];
    return parent === null || parent === undefined || String(parent) === '';
  });
  if (roots.length !== 1) {
    return {
      memberCount,
      rootId: null,
      complete: false,
      reason: roots.length ? 'The hierarchy has more than one root candidate.' : 'The hierarchy has no root candidate.',
    };
  }

  const root = roots[0]!;
  const rootIdValue = root[descriptor.idField];
  const rootId = rootIdValue === null || rootIdValue === undefined ? null : String(rootIdValue);
  if (!descriptor.typeField || !descriptor.rootEligibleTrait || !descriptor.standAloneEligibleTrait) {
    return { memberCount, rootId, complete: true, reason: null };
  }

  const typeValue = root[descriptor.typeField];
  const typeField = metadata.fieldDefinition[descriptor.typeField];
  const typeOption = typeField?.enumItems?.find((candidate) => candidate.value === typeValue);
  const rootEligible = typeOption?.[descriptor.rootEligibleTrait] === true;
  const standAloneEligible = typeOption?.[descriptor.standAloneEligibleTrait] === true;
  const complete = rootEligible || (memberCount === 1 && standAloneEligible);

  return complete
    ? { memberCount, rootId, complete: true, reason: null }
    : {
        memberCount,
        rootId,
        complete: false,
        reason: memberCount === 1
          ? 'This member type is not eligible to finalize a standalone hierarchy.'
          : 'This hierarchy needs an eligible root member type before it is finalized.',
      };
}
