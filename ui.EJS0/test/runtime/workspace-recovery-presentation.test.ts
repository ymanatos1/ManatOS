import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const source = (relativePath: string) =>
  readFile(resolve(testDirectory, '..', '..', relativePath), 'utf8');

describe('persistent per-user workspace recovery', () => {
  it('stores one IndexedDB package with levels in restore order and gentle-closes the live UI', async () => {
    const recovery = await source('src/runtime/workspace-recovery.ts');
    const popup = await source('public/js/popups/entry-popup.js');
    const ownedEntryRecovery = await source('src/runtime/v2/owned-entry-recovery.ts');
    const recoveryNavigation = await source('src/runtime/v2/recovery-navigation.ts');
    const popupRuntime = await source('public/js/popups/popup-runtime.js');
    const host = await source('public/js/runtime/ui-host-runtime.js');
    const surfaces = await source('public/js/sysbo/entry/entry-surface-runtime.js');
    const save = await source('public/js/sysbo/entry/save.js');
    const shell = await source('public/js/shell/shell.js');
    const popupPresentation = await source('src/browser/popup-presentation.ts');

    expect(recovery).toContain('export class WorkspaceRecoveryController');
    expect(recovery).toContain("const DB_NAME = 'manatos-workspace-recovery'");
    expect(recovery).toContain("const STORE_NAME = 'packages'");
    expect(recovery).toContain('transaction.objectStore(STORE_NAME).get(userId)');
    expect(recovery).toContain(
      'const levels = [...pageLevelsInRestoreOrder(), ...popupLevelsInRestoreOrder()]',
    );
    expect(recovery).toContain('level.userChanges = captureUserChanges(level)');
    expect(recovery).not.toContain('hierarchyChangesFromLiveLevel');
    expect(recovery).toContain('browserWindow.ManatOS?.surfaceRecovery?.capture?.(level)');
    expect(recovery).toContain('browserWindow.ManatOS?.uiHost?.getUserChanges?.(level.path)');
    expect(recovery).toContain('Recovery capture is incomplete for dirty surface');
    expect(recovery).not.toContain('prepareGentleClose?.(level.path)');
    expect(recovery).not.toContain('popup?.entry?.gentleCloseAll?.()');
    expect(recovery).not.toContain('gentleCloseAllRecoverableModals?.()');
    expect(recovery).toContain('retireAllVisibleModals?.()');
    expect(recovery).toContain('retireAllPhysicalSurfaces?.()');
    expect(recovery).toContain('await writePackage(recoveryPackage)');
    expect(recovery).not.toContain('else await removePackage(userId)');
    expect(recovery.indexOf('await writePackage(recoveryPackage)')).toBeLessThan(
      recovery.indexOf('await browserWindow.ManatOS?.uiHost?.disposeAll?.('),
    );
    expect(recovery.indexOf('await browserWindow.ManatOS?.uiHost?.disposeAll?.(')).toBeLessThan(
      recovery.indexOf('retireAllVisibleModals?.()'),
    );
    expect(recovery).toContain("runtime.replace('ctx.user', null");
    expect(recovery).toContain('await offer(userId)');
    expect(recovery).not.toContain('dismissedPackageSavedAt');
    expect(recovery).not.toContain('rememberDismissedPackage');
    expect(popup).toContain('resolvedInvocation.behavior?.recoverable !== false');
    expect(popup).toContain('popupPath,');
    expect(popup).toContain('path: entry.popupPath || null');
    expect(popup).toMatch(/activePopups\s*\.filter\(\(entry\) => entry\.recoverable !== false\)/);
    expect(recovery).toContain('await restorePackage(recoveryPackage, cycle)');
    expect(recovery).not.toContain('restoreRequested');
    expect(recovery).toContain("const RECOVERY_CYCLE_KEY = 'manatos.workspace-recovery.cycle.v1'");
    expect(recovery).toContain('sessionStorage.setItem(');
    expect(recovery).toContain('Your unsaved changes are restored!');
    expect(recovery).toContain('bi-check-circle-fill text-success');
    expect(recovery).toContain('data-workspace-recovery-illustration');
    expect(recovery).toContain('bi-diagram-3-fill');
    expect(recovery).toContain('bi-arrow-repeat');
    expect(recovery).toContain('bi-box-arrow-in-down-left');
    expect(recovery).toContain("icon: changedNode?.icon || 'bi-window'");
    expect(recovery).toContain('unsaved');
    expect(recovery).toContain('const restoredSurfaceData = (recoveryPackage: any) =>');
    expect(recovery).not.toContain('.filter((level: any) => level?.userChanges != null)');
    expect(recovery).toContain('hasChanges: level?.userChanges != null');
    expect(recovery).toContain('ctxPath: level.path');
    expect(recovery).toContain('surfacePath: level.control.path');
    expect(recovery).not.toContain('{ path: level.control.path }');
    expect(recovery).not.toContain('recoveryReportForLevel');
    expect(recovery).not.toContain('level.recoveryReport');
    expect(recovery).toContain('data-workspace-recovery-plan');
    expect(recovery).toContain('renderRecoveryPlan(modalElement, recoveryPackage)');
    expect(recovery).toContain(
      "summary: `${surfaces.length} ${surfaces.length === 1 ? 'surface' : 'surfaces'} will be reopened in this order.`",
    );
    expect(recovery).toContain('const recoveryFieldChanges = (userChanges: any) =>');
    expect(recovery).toContain('restoredValue: structuredClone(change?.value)');
    expect(recovery).toContain('caption,');
    expect(recovery).toContain('data: { recovery: { restoredAt, surfaces } }');
    expect(recovery).toContain('presentRecoverySuccess(recoveryPackage);');
    expect(recovery).toContain('const consumeRecoveredPackage = async (recoveryPackage: any) =>');
    expect(recovery).toContain('current.savedAt === savedAt');
    expect(recovery).toContain('await consumeRecoveredPackage(recoveryPackage);');
    expect(recovery).toContain("modal.addEventListener(\n        'hidden.bs.modal'");
    expect(recovery).not.toContain('consumePresentedPackage');
    expect(recovery).not.toContain('removePackage,\n      restorePackage');
    expect(recovery).toContain('presentRecoverySuccess(recoveryPackage);');
    expect(recovery).toContain("'hidden.bs.modal'");
    expect(recovery).toContain("modal.dataset.popupPurpose = 'workspace-recovery'");
    expect(recovery).toContain("modal.dataset.popupPurpose = 'workspace-recovery-success'");
    expect(recovery).toContain('data-workspace-recovery-prompt-illustration');
    expect(recovery).toContain('bi-arrow-counterclockwise');
    expect(recovery).toContain('registerBootstrapModal?.(modal)');
    expect(recovery).toContain('await waitForDomQuiescence(document)');
    expect(recovery).toContain('await browserWindow.ManatOS?.uiHost?.verifyUserChanges?.(');
    expect(recovery).toContain('browserWindow.ManatOS?.errors?.present?.(structured');
    expect(recovery).toContain("document.body.classList.contains('entry-popup-host')");

    expect(host).toContain('supportsUserChanges: supportsUserChanges === true');
    expect(host).toContain('getUserChanges(path)');
    expect(host).toContain('async applyUserChanges(path, changes)');
    expect(host).toContain('async verifyUserChanges(path, changes)');
    expect(surfaces).toContain('const recoveryAdapters = new WeakMap()');
    expect(surfaces).toContain('registerRecoveryAdapter');
    expect(surfaces).toContain('recoveryAdapter');
    expect(save).toContain('surfaceRuntime.registerRecoveryAdapter?.(form, recoveryAdapter)');
    expect(host).toContain('prepareGentleClose(path)');
    expect(host).toContain('recoveryUrl(path)');
    expect(host).toContain("async disposeAll(source = 'ui-host', options = {})");
    expect(recovery).toContain('const recoveryRootUrl = (levels: any[]) =>');
    expect(recovery).not.toContain('const storedRecoveryRootUrl = (recoveryPackage: any) =>');
    expect(recovery).toContain('void restorePackage(recoveryPackage, cycle)');
    expect(recovery).not.toContain('resumeOwnedEntryRecovery');
    expect(recovery).toContain('browserWindow.ManatOS?.surfaceRecovery?.resumeMissing?.({');
    expect(ownedEntryRecovery).toContain('submitRecoveryPost(target, fields)');
    expect(recoveryNavigation).toContain('form.requestSubmit()');
    expect(recovery).toContain("level?.control?.kind === 'hierarchy'");
    expect(recovery).toContain('await browserWindow.ManatOS?.uiHost?.disposeAll?.(');
    expect(recovery).toContain("{ decision: 'discard' }");
    expect(recovery).not.toContain('prepareGentleClose?.(level.path)');
    expect(recovery).toContain('Recovery UI disposal failed after the workspace was persisted.');
    expect(recovery).toContain('finally {');
    expect(host).toContain('shouldConfirmCancellation(path = currentUserChangePath())');
    expect(host).toContain('cancellationPresentation(path = currentUserChangePath())');
    expect(host).toContain('async discardUserChanges(path = currentUserChangePath())');
    expect(host).toContain('return isDirty(path) && recoverableChanges(path) != null');
    expect(host).toContain('async saveUserChanges(path = currentUserChangePath())');
    expect(shell).toContain("event.target.closest('[data-cancel-operation]')");
    expect(shell).not.toContain('? () => form.requestSubmit(trigger)');
    expect(shell).toContain('HTMLFormElement.prototype.submit.call(form)');
    expect(shell).toContain('requestCloseTrigger(trigger)');
    expect(shell).toContain('trigger?.dataset?.surfaceClosePath');
    expect(shell).toContain('trigger?.dataset?.surfaceCloseHref');
    expect(shell).toContain('window.ManatOS.surfaceClosure = Object.freeze({');
    expect(shell).toContain('requestTrigger: requestCloseTrigger');
    expect(shell).toContain('requestWithContinuation: requestCloseWithContinuation');
    expect(shell).not.toContain('pending.trigger.click()');
    expect(shell).toContain("uiHost?.closePath?.(path, 'surface-close-request')");
    expect(shell).toContain("event.target.closest('a[href]')");
    expect(shell).toContain('const drainUserChangeSurfacesForNavigation = async (');
    expect(shell).toContain('destinationHref,');
    expect(host).toContain('const currentSurfacePath = () => uiLeaf()?.path || null;');
    expect(shell).toContain(
      'const userChangePath = window.ManatOS?.uiHost?.currentUserChangePath?.() || null;',
    );
    expect(shell).toContain('const path = window.ManatOS?.uiHost?.currentSurfacePath?.() || null;');
    expect(shell).toContain('const surfaceCloseTriggerForPath = (path) =>');
    expect(shell).toContain("root.querySelector('[data-cancel-operation]')");
    expect(shell).toContain('const closeContinuation = closeContinuationForTrigger(closeTrigger);');
    expect(shell).toContain('await requestSurfaceClose(closeTrigger, closeContinuation, path);');
    expect(shell).toContain(
      "const NAVIGATION_CONTINUATION_KEY = 'manatos.ui.navigationContinuation.v1';",
    );
    expect(shell).toContain('sessionStorage.setItem(NAVIGATION_CONTINUATION_KEY, String(href))');
    expect(shell).toContain('setNavigationContinuation(destinationHref);');
    expect(shell).toContain('setNavigationContinuation(null);');
    expect(shell).toContain("if (typeof closeContinuation === 'function') return false;");
    expect(shell).toContain('if (window.ManatOS?.ctx?.get?.(path) !== undefined) {');
    expect(shell).toContain('setNavigationContinuation(null);\n        return false;');
    expect(shell).not.toContain("uiHost?.closePath?.(path, 'navigation-surface-close')");
    expect(shell).toContain('pendingCancellation.decisionRequired = true');
    expect(shell).toContain('void drainUserChangeSurfacesForNavigation(');
    expect(shell).not.toContain(
      'requestSurfaceClose(anchor, () => window.location.assign(destination.href)',
    );
    expect(shell).toContain('window.location.assign(destination.href)');
    expect(shell).toContain("window.addEventListener('beforeunload'");
    expect(shell).toContain("new CustomEvent('manatos:surface-cancellation-confirmed'");
    expect(shell).toContain('data-surface-cancel-action="discard"');
    expect(shell).toContain('data-surface-cancel-action="save"');
    expect(shell).toContain('data-surface-cancel-review');
    expect(shell).toContain("'[data-form-state-indicator], [data-hierarchy-state-indicator]'");
    expect(shell).toContain('indicator.click()');
    // Browser chrome only presents the decision requested by the typed close authority.
    // It may project labels/message from the pending UiLevel, but must not decide dirty state.
    expect(shell).toContain("window.addEventListener('manatos:ui-close-decision-required'");
    expect(shell).toContain('showPendingCancellation();');
    expect(shell).toContain(
      'if (!pendingCancellation || pendingCancellation.path !== String(handle.path)) return;',
    );
    expect(shell).toContain('uiHost?.cancellationPresentation?.(pending.path)');
    expect(shell).toContain(
      "uiHost?.closePath?.(\n          pending.path,\n          'surface-cancellation',\n          action",
    );
    expect(shell).not.toContain('discardUserChanges?.(pending.path)');
    expect(shell).not.toContain('uiHost.saveUserChanges(pending.path)');
    expect(shell).toContain("modal.dataset.popupPurpose = 'unsaved-changes'");
    expect(shell).toContain("purpose: 'unsaved-changes'");
    expect(popup).toContain('const gentleCloseAll = async () =>');
    expect(popup).toContain('const restoreDescriptor = async (descriptor) =>');
    expect(popupRuntime).toContain('gentleCloseAllRecoverableModals');
    expect(popupRuntime).toContain('retireAllVisibleModals');
    expect(popupRuntime).toContain('popupRecoverable(invocation)');
    expect(popupRuntime).toContain('canonicalPopupPresentation(invocation)?.recoverable !== false');
    expect(popupRuntime).toContain('if (!popupRecoverable(invocation)) return true;');
    expect(popupRuntime).toContain('releaseModalFocus(modal)');
    expect(popupPresentation).toContain("'hierarchy-commit': Object.freeze({");
    expect(popupPresentation).toContain("'workspace-recovery': Object.freeze({");
    expect(popupPresentation).toContain("'workspace-recovery-success': Object.freeze({");
    expect(popupPresentation.match(/recoverable: false/g)?.length).toBeGreaterThanOrEqual(5);
    expect(popupRuntime).toContain('data:');
    expect(popupRuntime).toContain('invocation?.data');
    expect(popupRuntime).toContain('registerPhysicalSurfaceRetirer');
    expect(popupRuntime).toContain('registerRecoveryRestorer');
    expect(popupRuntime).toContain('const semanticRestorer = recoveryRestorers.get(purpose)');
    expect(popupRuntime).toContain('await semanticRestorer(descriptor)');
    expect(popupRuntime).toContain('retireAllPhysicalSurfaces');
    expect(popupRuntime).toContain("document.querySelectorAll('.modal-backdrop')");
  });

  it('keeps hierarchy Create/Edit working sets recoverable while transient quick-entry popups opt out', async () => {
    const hierarchy = await source('public/js/sysbo/hierarchy/hierarchy-workspace.js');
    const typedRecovery = await source('src/runtime/v2/organization-recovery.ts');
    expect(typedRecovery).toContain("format: 'hierarchy-commit-v2'");
    expect(typedRecovery).toContain('entries: structuredClone(surface.entries)');
    expect(typedRecovery).toContain('entriesOriginal: structuredClone(surface.originalEntries)');
    expect(typedRecovery).toContain(
      'workspaceTransaction: structuredClone(surface.transactionSnapshot())',
    );
    expect(typedRecovery).toContain('surface.replaceRecycleBin(');
    expect(typedRecovery).toContain(
      'runtimeResources: structuredClone(surface.recoverableRuntimeResourceSnapshot())',
    );
    expect(typedRecovery).toContain('surface.replaceRuntimeResources(');
    expect(typedRecovery).toContain('verifyUserChanges(changes: any)');
    expect(typedRecovery).toContain('surface.sameRows(surface.entries, changes.entries)');
    expect(typedRecovery).toContain(
      'surface.sameRows(surface.originalEntries, changes.entriesOriginal)',
    );
    expect(hierarchy).toContain('...typedRecoveryAdapter');
    expect(hierarchy).toContain('behavior: { recoverable: false }');
    expect(hierarchy).toContain('async saveUserChanges()');
    expect(hierarchy).toContain('cancellationPresentation()');
    expect(hierarchy).toContain("discardLabel: 'Keep draft & leave'");
    expect(hierarchy).toContain('return saveWorkspaceDraft();');
    expect(hierarchy).toContain(
      "window.addEventListener('manatos:ui-level-disposing', disposeHierarchyWorkspace)",
    );
    expect(hierarchy).toContain(
      'window.removeEventListener(hierarchyCtxEventName, onHierarchyCtxChange)',
    );
    expect(hierarchy).toContain('unregisterRecoveryAdapter?.()');
  });

  it('captures only dirty fields and restores specialized fields through the component contract', async () => {
    const save = await source('public/js/sysbo/entry/save.js');
    const fields = await source('public/js/sysbo/entry/fields/picture-fields.js');
    const host = await source('public/js/runtime/ui-host-runtime.js');
    const formRuntime = await source('public/js/sysbo/entry/form-runtime.js');
    const surfaces = await source('public/js/sysbo/entry/entry-surface-runtime.js');

    expect(save).toContain('field.dirty !== true');
    expect(save).toContain("format: 'field-delta-v1'");
    expect(save).toContain('window.ManatOS?.fieldRecovery?.captureField?.(form, key)');
    expect(save).toContain('window.ManatOS?.setUiRuntimeResourceForPath?.(pagePath, key, value)');
    expect(save).toMatch(
      /window\.ManatOS\?\.fieldRecovery\?\.applyField\?\.\(\s*form,\s*key,\s*change,?\s*\)/,
    );
    expect(save).toMatch(
      /window\.ManatOS\?\.fieldRecovery\?\.verifyField\?\.\(\s*form,\s*key,\s*change,?\s*\)/,
    );
    expect(fields).toContain('captureField(form, key)');
    expect(fields).toContain('applyField: applyComponentRecovery');
    expect(fields).toContain('verifyField: verifyComponentRecovery');
    expect(fields).toContain('savePayload: payload.value');
    expect(formRuntime).toContain("control.dataset.ctxValueType === 'json'");
    expect(formRuntime).toContain('return JSON.parse(control.value);');
    expect(fields).toContain('rememberPendingResource(root, descriptor, pendingReplacement)');
    expect(host).toContain('registerRecoveryAdapter');
    expect(host).toContain('async applyUserChanges(path, changes)');
    expect(host).toContain('async verifyUserChanges(path, changes)');
    expect(surfaces).toContain('const recoveryAdapters = new WeakMap()');
    expect(surfaces).toContain('registerRecoveryAdapter');
    expect(surfaces).toContain('recoveryAdapter');
    expect(save).toContain('surfaceRuntime.registerRecoveryAdapter?.(form, recoveryAdapter)');
  });
});
