/* Generic working-hierarchy relationship and placement runtime.
 *
 * Owns graph placement mutations, relationship eligibility, persisted-candidate
 * overlay, and the existing-entry selector integration. It deliberately does not
 * own CTX storage, draft persistence, quick-edit UI, or aggregate commit.
 */
window.ManatOS = window.ManatOS || {};

window.ManatOS.createHierarchyRelationshipRuntime = ({
  runtime,
  pagePath,
  workspace,
  entityContext,
  entityMetadata,
  entityLabel,
  idField,
  parentField,
  typeField,
  containerTrait,
  canHaveParentTrait,
  rootEligibleTrait,
  standAloneEligibleTrait,
  entries,
  originalEntries,
  replaceEntries,
  replaceOriginalEntries,
  find,
  resolveEntryName,
  isEditing,
}) => {
  const enumOptionFor = (row) => {
    if (!typeField || !row) return null;
    const field = entityMetadata?.fieldDefinition?.[typeField];
    return Array.isArray(field?.enumItems)
      ? (field.enumItems.find((candidate) => candidate?.value === row?.[typeField]) ?? null)
      : null;
  };

  const ensureOriginalSnapshot = (candidate) => {
    const candidateId = candidate?.[idField] ?? candidate?.id ?? candidate?.value;
    if (
      candidateId == null ||
      String(candidateId) === '' ||
      String(candidateId).startsWith('draft:')
    )
      return;
    if (originalEntries().some((entry) => String(entry?.[idField] ?? '') === String(candidateId)))
      return;
    replaceOriginalEntries(
      [...originalEntries(), { ...candidate, [idField]: candidateId }],
      'add-existing-original',
    );
  };

  const removeOriginalSnapshot = (memberId) => {
    if (!memberId || String(memberId).startsWith('draft:')) return;
    replaceOriginalEntries(
      originalEntries().filter((entry) => String(entry?.[idField] ?? '') !== String(memberId)),
      'remove-existing-original',
    );
  };

  const removeNode = (memberId) => {
    if (isEditing() || !memberId) return;
    const row = find(memberId);
    if (!row) return;
    if (
      entries().some((candidate) => String(candidate?.[parentField] ?? '') === String(memberId))
    ) {
      window.alert('Move or remove this member’s children before removing the member.');
      return;
    }
    replaceEntries(
      entries()
        .filter((entry) => String(entry[idField]) !== String(memberId))
        .map((entry) => ({ ...entry })),
      'remove-member',
    );
    removeOriginalSnapshot(memberId);
  };

  const clearParent = (memberId) => {
    if (isEditing() || !memberId) return;
    const row = find(memberId);
    if (!row || row?.[parentField] == null || String(row[parentField]) === '') return;
    replaceEntries(
      entries().map((entry) =>
        String(entry?.[idField] ?? '') === String(memberId)
          ? { ...entry, [parentField]: null }
          : { ...entry },
      ),
      'clear-parent',
    );
  };

  const moveNode = (memberId, targetId) => {
    if (isEditing() || !memberId || !targetId || String(memberId) === String(targetId)) return;
    const moving = find(memberId);
    const target = find(targetId);
    if (!moving || !target) return;
    if (String(moving?.[parentField] ?? '') === String(targetId)) return;

    const movingOption = enumOptionFor(moving);
    if (canHaveParentTrait && movingOption?.[canHaveParentTrait] !== true) return;

    const targetOption = enumOptionFor(target);
    if (containerTrait && targetOption?.[containerTrait] !== true) return;

    let cursor = target;
    const visited = new Set();
    while (cursor) {
      const cursorId = String(cursor?.[idField] ?? '');
      if (!cursorId || visited.has(cursorId)) break;
      if (cursorId === String(memberId)) return;
      visited.add(cursorId);
      const parentId = cursor?.[parentField];
      if (parentId == null || String(parentId) === '') break;
      cursor = find(String(parentId));
    }

    replaceEntries(
      entries().map((entry) =>
        String(entry?.[idField] ?? '') === String(memberId)
          ? { ...entry, [parentField]: target[idField] }
          : { ...entry },
      ),
      'move-member',
    );
  };

  const allReferenceEntries = () => {
    const referenceData = runtime.resolve(`${pagePath}.resources.referenceData`) ?? {};
    const candidates = referenceData?.[parentField];
    if (!Array.isArray(candidates)) return [];

    const workingById = new Map(entries().map((row) => [String(row?.[idField] ?? ''), row]));
    return candidates
      .filter((row) => row && typeof row === 'object')
      .map((row) => {
        const candidateId = String(row?.[idField] ?? row?.id ?? row?.value ?? '');
        const working = workingById.get(candidateId);
        return working ? { ...row, ...working } : row;
      });
  };

  const hydrateMissingOriginalSnapshots = () => {
    const sourceById = new Map(
      allReferenceEntries().map((row) => [
        String(row?.[idField] ?? row?.id ?? row?.value ?? ''),
        row,
      ]),
    );
    const originalsById = new Map(
      originalEntries().map((row) => [String(row?.[idField] ?? ''), row]),
    );
    let changed = false;
    for (const row of entries()) {
      const id = String(row?.[idField] ?? '');
      if (!id || id.startsWith('draft:') || originalsById.has(id)) continue;
      const source = sourceById.get(id);
      if (!source) continue;
      originalsById.set(id, { ...source, [idField]: id });
      changed = true;
    }
    if (changed) replaceOriginalEntries([...originalsById.values()], 'hydrate-existing-originals');
  };

  const relationCandidateEligibility = (member, candidate, relation) => {
    if (!member || !candidate) return { eligible: false, reason: 'Missing hierarchy member.' };
    const memberId = String(member?.[idField] ?? '');
    const candidateId = String(candidate?.[idField] ?? candidate?.id ?? candidate?.value ?? '');
    if (!memberId || !candidateId || memberId === candidateId)
      return { eligible: false, reason: 'An entry cannot relate to itself.' };

    const memberOption = enumOptionFor(member);
    const candidateOption = enumOptionFor(candidate);
    const memberCanHaveParent = !canHaveParentTrait || memberOption?.[canHaveParentTrait] === true;
    const candidateCanHaveParent =
      !canHaveParentTrait || candidateOption?.[canHaveParentTrait] === true;
    const memberCanContain = !containerTrait || memberOption?.[containerTrait] === true;
    const candidateCanContain = !containerTrait || candidateOption?.[containerTrait] === true;

    if (relation === 'parent') {
      if (String(member?.[parentField] ?? '') === candidateId) {
        return {
          eligible: false,
          reason: `${resolveEntryName(candidate) || 'The selected entry'} is already the parent of ${resolveEntryName(member) || 'this entry'}.`,
        };
      }
      if (!memberCanHaveParent)
        return {
          eligible: false,
          reason: `${resolveEntryName(member) || 'This entry'} cannot have a parent.`,
        };
      if (!candidateCanContain)
        return {
          eligible: false,
          reason: `${resolveEntryName(candidate) || 'The selected entry'} cannot contain children.`,
        };
    } else if (relation === 'child') {
      if (String(candidate?.[parentField] ?? '') === memberId) {
        return {
          eligible: false,
          reason: `${resolveEntryName(candidate) || 'The selected entry'} is already a child of ${resolveEntryName(member) || 'this entry'}.`,
        };
      }
      if (!memberCanContain)
        return {
          eligible: false,
          reason: `${resolveEntryName(member) || 'This entry'} cannot contain children.`,
        };
      if (!candidateCanHaveParent)
        return {
          eligible: false,
          reason: `${resolveEntryName(candidate) || 'The selected entry'} cannot have a parent.`,
        };
    } else {
      const nextParentId = member?.[parentField];
      if (String(candidate?.[parentField] ?? '') === String(nextParentId ?? '')) {
        return {
          eligible: false,
          reason: `${resolveEntryName(candidate) || 'The selected entry'} is already a sibling of ${resolveEntryName(member) || 'this entry'}.`,
        };
      }
      if (nextParentId != null && String(nextParentId) !== '' && !candidateCanHaveParent) {
        return {
          eligible: false,
          reason: `${resolveEntryName(candidate) || 'The selected entry'} cannot have a parent.`,
        };
      }
      if ((nextParentId == null || String(nextParentId) === '') && rootEligibleTrait) {
        const rootEligible =
          candidateOption?.[rootEligibleTrait] === true ||
          candidateOption?.[standAloneEligibleTrait] === true;
        if (!rootEligible)
          return {
            eligible: false,
            reason: `${resolveEntryName(candidate) || 'The selected entry'} is not root-eligible.`,
          };
      }
    }

    const candidateWorking = find(candidateId);
    if (candidateWorking) {
      const movingId = relation === 'parent' ? memberId : candidateId;
      const nextParentId =
        relation === 'parent'
          ? candidateId
          : relation === 'child'
            ? memberId
            : (member?.[parentField] ?? null);
      if (nextParentId != null && String(nextParentId) !== '') {
        let cursor = find(String(nextParentId));
        const visited = new Set();
        while (cursor) {
          const cursorId = String(cursor?.[idField] ?? '');
          if (!cursorId || visited.has(cursorId)) break;
          if (cursorId === movingId)
            return { eligible: false, reason: 'That relationship would create a hierarchy cycle.' };
          visited.add(cursorId);
          const parentId = cursor?.[parentField];
          if (parentId == null || String(parentId) === '') break;
          cursor = find(String(parentId));
        }
      }
    }
    return { eligible: true, reason: null };
  };

  const addDatabaseEntryForRelation = (candidate, memberId, relation) => {
    const member = find(memberId);
    const candidateId = candidate?.[idField] ?? candidate?.id ?? candidate?.value;
    if (!member || candidateId == null || String(candidateId) === '') return false;
    if (find(String(candidateId))) return false;
    const eligibility = relationCandidateEligibility(member, candidate, relation);
    if (!eligibility.eligible) {
      window.alert(eligibility.reason || 'That relationship is not allowed.');
      return false;
    }

    const row = { ...candidate, [idField]: candidateId };
    ensureOriginalSnapshot(row);
    const currentParent = member[parentField] ?? null;
    const current = entries().map((entry) => ({ ...entry }));

    if (relation === 'parent') {
      row[parentField] = currentParent;
      replaceEntries(
        [
          ...current.map((entry) =>
            String(entry?.[idField] ?? '') === String(memberId)
              ? { ...entry, [parentField]: candidateId }
              : entry,
          ),
          row,
        ],
        'add-existing-entry-parent',
      );
    } else if (relation === 'child') {
      row[parentField] = memberId;
      replaceEntries([...current, row], 'add-existing-entry-child');
    } else {
      row[parentField] = currentParent;
      replaceEntries([...current, row], 'add-existing-entry-sibling');
    }
    return true;
  };

  const relateExistingNode = (command, memberId, candidateId, options = {}) => {
    if (isEditing() || !memberId || !candidateId || String(memberId) === String(candidateId))
      return;
    const member = find(memberId);
    const candidate = find(candidateId);
    if (!member || !candidate) return;

    const memberName = resolveEntryName(member) || String(memberId);
    const candidateName = resolveEntryName(candidate) || String(candidateId);
    let movingId = candidateId;
    let nextParent = null;
    let message = '';
    if (command === 'use-existing-parent') {
      movingId = memberId;
      nextParent = candidateId;
      message = `Make ${candidateName} parent of ${memberName}?`;
    } else if (command === 'use-existing-child') {
      movingId = candidateId;
      nextParent = memberId;
      message = `Make ${candidateName} child of ${memberName}?`;
    } else if (command === 'use-existing-sibling') {
      movingId = candidateId;
      nextParent = member[parentField] ?? null;
      message = `Move ${candidateName} beside ${memberName} as its sibling?`;
    } else return;

    const eligibility = relationCandidateEligibility(
      member,
      candidate,
      command.replace('use-existing-', ''),
    );
    if (!eligibility.eligible) {
      window.alert(eligibility.reason || 'That relationship is not allowed.');
      return;
    }

    if (nextParent != null && String(nextParent) !== '') {
      let cursor = find(nextParent);
      const visited = new Set();
      while (cursor) {
        const cursorId = String(cursor?.[idField] ?? '');
        if (!cursorId || visited.has(cursorId)) break;
        if (cursorId === String(movingId)) {
          window.alert('That relationship would create a hierarchy cycle.');
          return;
        }
        visited.add(cursorId);
        const parentId = cursor?.[parentField];
        if (parentId == null || String(parentId) === '') break;
        cursor = find(parentId);
      }
    }
    if (options.confirm !== false && !window.confirm(message)) return;
    replaceEntries(
      entries().map((entry) =>
        String(entry?.[idField] ?? '') === String(movingId)
          ? { ...entry, [parentField]: nextParent }
          : { ...entry },
      ),
      'relate-existing-member',
    );
  };

  const openExistingEntrySelector = (memberId, relation = 'sibling') => {
    const member = find(memberId);
    if (!member) return;

    const source = allReferenceEntries();
    if (!source.length) {
      window.alert('No existing entries are available for selection.');
      return;
    }

    const selector = window.ManatOS?.popup?.recordSelector;
    const template = workspace.querySelector('[data-record-selector-template]');
    if (!selector?.open || !(template instanceof HTMLTemplateElement)) return;

    const memberName = resolveEntryName(member) || String(memberId);
    selector.open({
      template,
      source,
      invocation: {
        entityName: entityContext?.name || entityMetadata?.name || undefined,
        purpose: 'select',
        caller: {
          surfaceRef: pagePath,
          ...(entityContext?.name || entityMetadata?.name
            ? { entityName: entityContext?.name || entityMetadata?.name }
            : {}),
          recordId: String(memberId),
        },
        presentation: {
          title: `Select ${entityLabel} to place as ${memberName} ${relation}`,
          layout: 'subtle',
        },
        behavior: { selection: 'single', autofocus: true },
      },
      eligibility: (candidate) => {
        const candidateId = String(candidate?.[idField] ?? candidate?.id ?? candidate?.value ?? '');
        if (!candidateId || candidateId === String(memberId)) {
          return {
            eligible: false,
            visible: false,
            reason: 'The source entry cannot be selected for this relationship.',
          };
        }

        const result = relationCandidateEligibility(member, candidate, relation);
        return {
          eligible: result.eligible,
          visible: result.eligible,
          reason: result.reason || '',
        };
      },
      initialSelection: null,
      factsForCandidate: (candidate) => {
        const candidateId = String(candidate?.[idField] ?? candidate?.id ?? candidate?.value ?? '');
        return { alreadyInContext: Boolean(candidateId && find(candidateId)) };
      },
      onSelect: (candidate) => {
        const candidateId = String(candidate?.[idField] ?? candidate?.id ?? candidate?.value ?? '');
        if (!candidateId) return false;

        if (find(candidateId)) {
          relateExistingNode(`use-existing-${relation}`, memberId, candidateId, { confirm: false });
        } else {
          addDatabaseEntryForRelation(candidate, memberId, relation);
        }
        return true;
      },
    });
  };

  return Object.freeze({
    enumOptionFor,
    removeNode,
    clearParent,
    moveNode,
    allReferenceEntries,
    hydrateMissingOriginalSnapshots,
    relationCandidateEligibility,
    addDatabaseEntryForRelation,
    relateExistingNode,
    openExistingEntrySelector,
  });
};
