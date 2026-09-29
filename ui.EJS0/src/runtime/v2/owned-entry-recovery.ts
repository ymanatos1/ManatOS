/* eslint-disable @typescript-eslint/no-explicit-any */
import type { UiSurfaceRecoveryProvider } from './surface-recovery.js';
import { submitRecoveryPost } from './recovery-navigation.js';

export const ownedEntryRecoveryProvider: UiSurfaceRecoveryProvider = {
  id: 'owned-page-entry',
  matches: (level) => level?.control?.kind === 'entry' && level?.control?.host === 'page',
  async resumeMissing({ recoveryPackage, level, levelIndex, continueRecoveryAt, recoveryFailure }) {
    const levels = recoveryPackage?.levels || [];
    const owner = [...levels.slice(0, levelIndex)]
      .reverse()
      .find((candidate: any) => candidate?.control?.kind === 'hierarchy');
    const changes = owner?.userChanges;
    if (!owner || !['hierarchy-commit-v1', 'hierarchy-commit-v2'].includes(changes?.format))
      return false;
    const entityKey = String(level.control.entityKey || owner.control.entityKey || '');
    const recordId = String(level.control.recordId || '');
    if (!entityKey || !recordId) return false;
    const target = `/bo/${encodeURIComponent(entityKey)}/owned-entry/${encodeURIComponent(recordId)}`;
    const csrf = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
    if (!csrf)
      throw recoveryFailure('Recovery cannot reopen the owned Entry without CSRF state.', level);

    continueRecoveryAt(levelIndex, target);
    const fields: Record<string, string> = {
      _csrf: csrf,
      _ownerEntries: JSON.stringify(changes.entries || []),
      _ownerEntriesOriginal: JSON.stringify(changes.entriesOriginal || []),
      _ownerFields: JSON.stringify({
        focusedMemberId: recordId,
        originalMemberId: String(changes.originalMemberId || ''),
      }),
      _ownerName: String(owner.control.name || 'organization'),
      _ownerKind: String(owner.control.kind || 'hierarchy'),
      _ownerMode: String(owner.control.mode || 'edit'),
      _ownerIdentityField: String(changes.identityField || 'id'),
      _ownerWorkspaceTransaction: JSON.stringify(
        changes.workspaceTransaction || { version: 1, mutations: [] },
      ),
      _ownerRecycleBin: JSON.stringify(changes.recycleBin || []),
      _ownerRuntimeResources: JSON.stringify(changes.runtimeResources || {}),
      _ownerRecoveryUrl: String(recoveryPackage.rootUrl || ''),
    };
    submitRecoveryPost(target, fields);
    return true;
  },
};
