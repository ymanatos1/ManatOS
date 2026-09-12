/* Pure hierarchy graph semantics shared by the browser workspace shell. */
window.ManatOS = window.ManatOS || {};

window.ManatOS.createHierarchyWorkspaceModel = ({
  idField,
  parentField,
  rootField,
  typeField,
  rootEligibleTrait,
  standAloneEligibleTrait,
  entityMetadata,
}) => {
  const withCalculatedHierarchy = (rows) => {
    const cloned = rows.map((row) => ({ ...row }));
    if (!rootField) return cloned;
    const byId = new Map(cloned.map((row) => [String(row?.[idField] ?? ''), row]));

    const rootFor = (row) => {
      const directParent = row?.[parentField];
      if (directParent == null || String(directParent) === '') return null;
      let cursorId = String(directParent);
      const visited = new Set([String(row?.[idField] ?? '')]);
      while (cursorId) {
        if (visited.has(cursorId)) return null;
        visited.add(cursorId);
        const cursor = byId.get(cursorId);
        if (!cursor) return cursorId;
        const parent = cursor[parentField];
        if (parent == null || String(parent) === '') return String(cursor[idField] ?? cursorId);
        cursorId = String(parent);
      }
      return null;
    };

    return cloned.map((row) => ({ ...row, [rootField]: rootFor(row) }));
  };

  const completion = (rows) => {
    if (!rows.length) return { complete: false, reason: 'The hierarchy has no members yet.' };
    const byId = new Map(rows.map((row) => [String(row?.[idField] ?? ''), row]));
    const roots = rows.filter((row) => {
      const parent = row?.[parentField];
      return parent == null || String(parent) === '' || !byId.has(String(parent));
    });
    if (roots.length !== 1) {
      return {
        complete: false,
        reason: roots.length
          ? 'The hierarchy has more than one root candidate.'
          : 'The hierarchy has no root candidate.',
      };
    }
    if (!typeField || !rootEligibleTrait || !standAloneEligibleTrait)
      return { complete: true, reason: null };
    const type = roots[0]?.[typeField];
    const field = entityMetadata?.fieldDefinition?.[typeField];
    const option = Array.isArray(field?.enumItems)
      ? field.enumItems.find((candidate) => candidate?.value === type)
      : null;
    const complete =
      option?.[rootEligibleTrait] === true ||
      (rows.length === 1 && option?.[standAloneEligibleTrait] === true);
    return {
      complete,
      reason: complete
        ? null
        : rows.length === 1
          ? 'This member type is not eligible to finalize a standalone hierarchy.'
          : 'This hierarchy needs an eligible root member type before it is finalized.',
    };
  };

  const normalizedRows = (rows) =>
    rows
      .map((row) => ({ ...row }))
      .sort((left, right) =>
        String(left?.[idField] ?? '').localeCompare(String(right?.[idField] ?? '')),
      );

  const sameRows = (left, right) =>
    JSON.stringify(normalizedRows(left)) === JSON.stringify(normalizedRows(right));

  return Object.freeze({
    withCalculatedHierarchy,
    completion,
    normalizedRows,
    sameRows,
  });
};
