/* Generic working-hierarchy relationship and placement runtime.
 *
 * Bridges typed graph/relationship semantics to persisted-candidate overlay and
 * the existing-entry selector integration. It deliberately does not
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
  organizationSurface,
  entries,
  find,
  resolveEntryName,
  isEditing,
}) => {
  const removeNode = (memberId) => {
    if (isEditing() || !memberId) return;
    const result = organizationSurface.removeMember(String(memberId), 'remove-member');
    if (!result.changed && result.reason) window.ManatOS?.alertPopup?.show?.(result.reason);
  };

  const restoreNode = (memberId) => {
    if (isEditing() || !memberId) return;
    const result = organizationSurface.restoreRecycledMember(
      String(memberId),
      'restore-recycled-member',
    );
    if (!result.changed && result.reason) window.ManatOS?.alertPopup?.show?.(result.reason);
  };

  const clearParent = (memberId) => {
    if (isEditing() || !memberId) return;
    const row = find(memberId);
    if (!row || row?.[parentField] == null || String(row[parentField]) === '') return;
    organizationSurface.reparentMember(String(memberId), null, 'clear-parent');
  };

  const moveNode = (memberId, targetId) => {
    if (isEditing() || !memberId || !targetId || String(memberId) === String(targetId)) return;
    const moving = find(memberId);
    const target = find(targetId);
    if (!moving || !target) return;
    const eligibility = organizationSurface.relationshipEligibility(moving, target, 'parent');
    if (!eligibility.eligible) return;
    organizationSurface.reparentMember(String(memberId), target[idField], 'move-member');
  };

  const allReferenceEntries = () => {
    const referenceData =
      runtime.resolve(
        `$.${String(pagePath).replace(/^ctx\.?/, '')}.data.resources.referenceData`,
      ) ?? {};
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

  const hydrateMissingOriginalSnapshots = () =>
    organizationSurface.hydrateOriginalSnapshots(
      allReferenceEntries(),
      'hydrate-existing-originals',
    );

  const relationCandidateEligibility = (member, candidate, relation) =>
    organizationSurface.relationshipEligibility(member, candidate, relation);

  const addDatabaseEntryForRelation = (candidate, memberId, relation) => {
    if (isEditing()) return false;
    const result = organizationSurface.addExistingMemberForRelation(
      candidate,
      String(memberId),
      relation,
      `add-existing-entry-${relation}`,
    );
    if (!result.changed && result.reason) window.ManatOS?.alertPopup?.show?.(result.reason);
    return result.changed;
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
      window.ManatOS?.alertPopup?.show?.(eligibility.reason || 'That relationship is not allowed.');
      return;
    }

    if (options.confirm !== false && !window.confirm(message)) return;
    organizationSurface.reparentMember(String(movingId), nextParent, 'relate-existing-member');
  };

  const openExistingEntrySelector = (memberId, relation = 'sibling') => {
    const member = find(memberId);
    if (!member) return;

    const source = allReferenceEntries();
    if (!source.length) {
      window.ManatOS?.alertPopup?.show?.('No existing entries are available for selection.');
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
      onSelect: (surfaceResult) => {
        const candidate = surfaceResult?.value;
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
    enumOptionFor: (record) => organizationSurface.relationshipTypeOption(record),
    removeNode,
    restoreNode,
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
