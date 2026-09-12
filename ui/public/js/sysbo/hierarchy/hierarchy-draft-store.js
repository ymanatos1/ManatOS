/* Browser persistence service for hierarchy create-workspace drafts. */
window.ManatOS = window.ManatOS || {};

window.ManatOS.createHierarchyDraftStore = ({
  userId,
  entityKey,
  hierarchyMode,
  hierarchyRootIdentity,
}) => {
  const prefix = 'manatos:hierarchy-draft:';
  const supported = hierarchyMode === 'create';
  const identity =
    hierarchyMode === 'create' ? 'create' : `edit:${hierarchyRootIdentity || 'unknown'}`;
  const storageKey = `${prefix}${userId}:${entityKey}:${identity}`;

  const compatiblePayload = (candidate) => {
    if (!candidate || typeof candidate !== 'object' || !Array.isArray(candidate.entries))
      return null;
    const recognizable = candidate.entries.filter(
      (row) => row && typeof row === 'object' && !Array.isArray(row),
    );
    if (!recognizable.length && candidate.entries.length) return null;
    return {
      savedAt: typeof candidate.savedAt === 'string' ? candidate.savedAt : null,
      entries: recognizable,
      entriesOriginal: Array.isArray(candidate.entriesOriginal)
        ? candidate.entriesOriginal.filter(
            (row) => row && typeof row === 'object' && !Array.isArray(row),
          )
        : null,
    };
  };

  const candidates = () => {
    if (!supported) return [];
    const result = [];
    try {
      const exact = localStorage.getItem(storageKey);
      if (exact) result.push({ key: storageKey, raw: exact });
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key || key === storageKey || !key.startsWith(prefix)) continue;
        const suffix = key.slice(prefix.length);
        const legacyCreateSuffix = `:${userId}:${entityKey}:new`;
        const stableCreateSuffix = `${userId}:${entityKey}:create`;
        if (!suffix.endsWith(legacyCreateSuffix) && suffix !== stableCreateSuffix) continue;
        result.push({ key, raw: localStorage.getItem(key) });
      }
    } catch {
      return [];
    }
    return result;
  };

  const save = (payload) => {
    if (!supported) return false;
    try {
      if (!payload?.entries?.length) {
        localStorage.removeItem(storageKey);
        return true;
      }
      localStorage.setItem(storageKey, JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  };

  const clearCreateDrafts = () => {
    if (!supported) return;
    try {
      const legacyCreateSuffix = `:${userId}:${entityKey}:new`;
      const stableCreateSuffix = `${userId}:${entityKey}:create`;
      const keys = [];
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key || !key.startsWith(prefix)) continue;
        const suffix = key.slice(prefix.length);
        if (
          key === storageKey ||
          suffix.endsWith(legacyCreateSuffix) ||
          suffix === stableCreateSuffix
        )
          keys.push(key);
      }
      keys.forEach((key) => localStorage.removeItem(key));
    } catch {
      /* Persistence cleanup must never block the owning workflow. */
    }
  };

  return Object.freeze({
    supported,
    storageKey,
    compatiblePayload,
    candidates,
    save,
    clearCreateDrafts,
  });
};
