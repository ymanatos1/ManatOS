/* eslint-disable @typescript-eslint/no-explicit-any */
import type { UiSurfaceRecoveryProvider } from './surface-recovery.js';
import { submitRecoveryPost } from './recovery-navigation.js';

const browserWindow = globalThis as any;
const supportedFormat = (changes: any) =>
  Boolean(changes && ['hierarchy-commit-v1', 'hierarchy-commit-v2'].includes(changes.format));
const identityFieldFor = (path: string) =>
  String(
    browserWindow.ManatOS?.ctx?.get?.(`${path}.data.resources.workspace.identityField`) || 'id',
  );
const surfaceFor = (path: string) =>
  browserWindow.ManatOS?.organizationHierarchySurface?.(path, {
    identityField: identityFieldFor(path),
  });
const recycleBinFor = (changes: any) => {
  if (Array.isArray(changes?.recycleBin)) return changes.recycleBin;
  if (!Array.isArray(changes?.entriesOriginal) || !Array.isArray(changes?.entries)) return [];
  const identityField = String(changes.identityField || 'id');
  const currentIds = new Set(
    changes.entries.map((row: any) => String(row?.[identityField] ?? '')).filter(Boolean),
  );
  return changes.entriesOriginal.filter((row: any) => {
    const identity = String(row?.[identityField] ?? '');
    return identity && !currentIds.has(identity);
  });
};

const capturePath = (path: string) => {
  const surface = surfaceFor(path);
  if (!surface || !surface.dirtyRuntime.evaluate()) return null;
  return {
    format: 'hierarchy-commit-v2',
    identityField: identityFieldFor(path),
    originalMemberId: String(
      browserWindow.ManatOS?.ctx?.get?.(`${path}.data.resources.workspace.originalMemberId`) || '',
    ),
    entries: structuredClone(surface.entries),
    entriesOriginal: structuredClone(surface.originalEntries),
    workspaceTransaction: structuredClone(surface.transactionSnapshot()),
    recycleBin: structuredClone(surface.recycleBin),
    runtimeResources: structuredClone(surface.recoverableRuntimeResourceSnapshot()),
  };
};

/** Canonical typed recovery adapter for one Organization/hierarchy UiLevel. */
export const organizationRecoveryAdapter = (path: string) => ({
  getUserChanges: () => capturePath(path),
  applyUserChanges(changes: any) {
    if (!supportedFormat(changes) || !Array.isArray(changes.entries)) return false;
    const surface = surfaceFor(path);
    if (!surface) return false;
    surface.replaceEntries(structuredClone(changes.entries), 'workspace-recovery');
    if (Array.isArray(changes.entriesOriginal)) {
      surface.replaceOriginalEntries(
        structuredClone(changes.entriesOriginal),
        'workspace-recovery-original',
      );
    }
    surface.replaceTransaction(
      changes.workspaceTransaction || { version: 1, mutations: [] },
      'workspace-recovery-transaction',
    );
    surface.replaceRecycleBin(
      structuredClone(recycleBinFor(changes)),
      'workspace-recovery-recycle-bin',
    );
    surface.replaceRuntimeResources(structuredClone(changes.runtimeResources || {}));
    surface.pruneRuntimeResources();
    return true;
  },
  verifyUserChanges(changes: any) {
    if (!supportedFormat(changes) || !Array.isArray(changes.entries)) return false;
    const surface = surfaceFor(path);
    if (!surface || !surface.sameRows(surface.entries, changes.entries)) return false;
    if (
      Array.isArray(changes.entriesOriginal) &&
      !surface.sameRows(surface.originalEntries, changes.entriesOriginal)
    )
      return false;
    if (changes.format === 'hierarchy-commit-v2') {
      if (
        !surface.sameTransactionSnapshot(
          changes.workspaceTransaction || { version: 1, mutations: [] },
        )
      )
        return false;
      if (!surface.sameRows(surface.recycleBin, recycleBinFor(changes))) return false;
      if (
        JSON.stringify(surface.runtimeResourceSnapshot()) !==
        JSON.stringify(changes.runtimeResources || {})
      )
        return false;
      const expectedOriginalMemberId = String(changes.originalMemberId || '');
      const actualOriginalMemberId = String(
        browserWindow.ManatOS?.ctx?.get?.(`${path}.data.resources.workspace.originalMemberId`) ||
          '',
      );
      if (actualOriginalMemberId !== expectedOriginalMemberId) return false;
      if (changes.entries.length && expectedOriginalMemberId) {
        const hierarchyRootId = String(
          browserWindow.ManatOS?.ctx?.get?.(`${path}.data.resources.workspace.hierarchyRootId`) ||
            '',
        );
        if (!hierarchyRootId) return false;
      }
    }
    return true;
  },
});

/** Recovery provider used when a live hierarchy UiLevel has no browser adapter (for example under a full-page owned Entry). */
export const organizationRecoveryProvider: UiSurfaceRecoveryProvider = {
  id: 'organization-hierarchy',
  matches: (level) => level?.control?.kind === 'hierarchy' && Boolean(level?.path),
  capture: (level) => capturePath(level.path),
  matchesRecoveryTarget(storedLevel, liveLevel) {
    const stored = storedLevel?.control || {};
    const live = liveLevel?.control || {};
    if (stored.kind !== 'hierarchy' || live.kind !== 'hierarchy') return false;
    if (String(stored.entityKey || '') !== String(live.entityKey || '')) return false;
    if (String(stored.mode || '') !== String(live.mode || '')) return false;
    if (String(stored.name || '') !== String(live.name || '')) return false;
    if (stored.mode === 'edit') {
      return Boolean(stored.recordId) && String(stored.recordId) === String(live.recordId || '');
    }
    return stored.mode === 'create';
  },

  recoveryUrl(level) {
    const invocationUrl = String(level?.control?.invocation?.recoveryUrl || '');
    if (invocationUrl) return invocationUrl;
    const entityKey = String(level?.control?.entityKey || '');
    if (!entityKey) return null;
    if (level?.control?.mode === 'create')
      return `/bo/${encodeURIComponent(entityKey)}/hierarchy/new`;
    const recordId = String(level?.control?.recordId || '');
    return recordId
      ? `/bo/${encodeURIComponent(entityKey)}/${encodeURIComponent(recordId)}/hierarchy`
      : null;
  },
  async resumeMissing({ recoveryPackage, level, levelIndex, continueRecoveryAt, recoveryFailure }) {
    const changes = level?.userChanges;
    if (!supportedFormat(changes) || !Array.isArray(changes.entries)) return false;
    const entityKey = String(level?.control?.entityKey || '');
    if (!entityKey) return false;
    const csrf = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
    if (!csrf) {
      throw recoveryFailure(
        'Recovery cannot reconstruct the Organization workspace without CSRF state.',
        level,
      );
    }

    // A hierarchy workspace can contain draft identities that have never existed
    // in storage. Reconstruct the owner from its captured aggregate through the
    // canonical owner-return route; never GET a draft identity as if persisted.
    const identityField = String(changes.identityField || 'id');
    const recordId = String(level?.control?.recordId || '');
    const target = `/bo/${encodeURIComponent(entityKey)}/owned/return`;
    continueRecoveryAt(levelIndex, target);
    submitRecoveryPost(target, {
      _csrf: csrf,
      id: recordId,
      _ownerEntries: JSON.stringify(changes.entries || []),
      _ownerEntriesOriginal: JSON.stringify(changes.entriesOriginal || []),
      _ownerFields: JSON.stringify({
        focusedMemberId: recordId,
        originalMemberId: String(changes.originalMemberId || ''),
      }),
      _ownerName: String(level?.control?.name || 'organization'),
      _ownerKind: String(level?.control?.kind || 'hierarchy'),
      _ownerMode: String(level?.control?.mode || 'edit'),
      _ownerIdentityField: identityField,
      _ownerWorkspaceTransaction: JSON.stringify(
        changes.workspaceTransaction || { version: 1, mutations: [] },
      ),
      _ownerRecycleBin: JSON.stringify(changes.recycleBin || []),
      _ownerRuntimeResources: JSON.stringify(changes.runtimeResources || {}),
      _ownerRecoveryUrl: String(recoveryPackage?.rootUrl || ''),
    });
    return true;
  },
};
