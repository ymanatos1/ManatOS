import { semanticEqual } from './v2/dirty.js';
import { flattenWorkspaceMutations } from './v2/workspace-transaction.js';
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Per-user outage recovery.
 *
 * One IndexedDB record is the sole outage-recovery authority for a user. It owns
 * the ordered UI-level descriptors and each level's recoverable user changes.
 * Large picture/pictures POST payloads therefore stay inside the same package
 * without localStorage quota pressure or a parallel blob/draft authority.
 */

const browserWindow = window as typeof window & { ManatOS?: any; bootstrap?: any };
browserWindow.ManatOS ||= {};

export class WorkspaceRecoveryController {
  install(): void {
    const VERSION = 2;
    const DB_NAME = 'manatos-workspace-recovery';
    const STORE_NAME = 'packages';
    const currentUserId = () =>
      document.querySelector('meta[name="manatos-user-id"]')?.getAttribute('content') ||
      document.body?.dataset.userId ||
      'anonymous';

    // Hosted entry documents expose their own entryRecovery adapter. The owning
    // top window is the only outage-package authority.
    if (document.body.classList.contains('entry-popup-host')) return;

    const openDatabase = () =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, VERSION);
        request.addEventListener('upgradeneeded', () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
        });
        request.addEventListener('success', () => resolve(request.result));
        request.addEventListener('error', () => reject(request.error));
      });

    const withStore = async (mode: any, work: any) => {
      const db = await openDatabase();
      try {
        return await new Promise<any>((resolve, reject) => {
          const transaction = db.transaction(STORE_NAME, mode);
          const store = transaction.objectStore(STORE_NAME);
          let result;
          try {
            result = work(store);
          } catch (error) {
            reject(error);
            return;
          }
          transaction.addEventListener('complete', () => resolve(result));
          transaction.addEventListener('error', () => reject(transaction.error));
          transaction.addEventListener('abort', () => reject(transaction.error));
        });
      } finally {
        db.close();
      }
    };

    const readPackage = async (userId: any) => {
      if (!userId || userId === 'anonymous') return null;
      const db = await openDatabase();
      try {
        return await new Promise<any>((resolve, reject) => {
          const transaction = db.transaction(STORE_NAME, 'readonly');
          const request = transaction.objectStore(STORE_NAME).get(userId);
          request.addEventListener('success', () => {
            const value = request.result;
            resolve(value?.version === VERSION && value?.userId === userId ? value : null);
          });
          request.addEventListener('error', () => reject(request.error));
        });
      } finally {
        db.close();
      }
    };

    const writePackage = async (recoveryPackage: any) => {
      await withStore('readwrite', (store: any) =>
        store.put(recoveryPackage, recoveryPackage.userId),
      );
      return recoveryPackage;
    };

    const removePackage = async (userId: any) => {
      if (!userId || userId === 'anonymous') return;
      await withStore('readwrite', (store: any) => store.delete(userId));
    };

    const consumeRecoveredPackage = async (recoveryPackage: any) => {
      const userId = recoveryPackage?.userId;
      const savedAt = recoveryPackage?.savedAt;
      if (!userId || userId === 'anonymous' || !savedAt) return false;
      const db = await openDatabase();
      try {
        return await new Promise<boolean>((resolve, reject) => {
          const transaction = db.transaction(STORE_NAME, 'readwrite');
          const store = transaction.objectStore(STORE_NAME);
          const request = store.get(userId);
          let consumed = false;
          request.addEventListener('success', () => {
            const current = request.result;
            if (
              current?.version === VERSION &&
              current?.userId === userId &&
              current.savedAt === savedAt
            ) {
              store.delete(userId);
              consumed = true;
            }
          });
          request.addEventListener('error', () => reject(request.error));
          transaction.addEventListener('complete', () => resolve(consumed));
          transaction.addEventListener('error', () => reject(transaction.error));
          transaction.addEventListener('abort', () => reject(transaction.error));
        });
      } finally {
        db.close();
      }
    };

    const currentUrl = () => `${location.pathname}${location.search}${location.hash}`;
    const RECOVERY_CYCLE_KEY = 'manatos.workspace-recovery.cycle.v1';

    type RecoveryCycle = {
      userId: string;
      savedAt: string;
      levelIndex: number;
      resumeUrl: string;
    };

    const readRecoveryCycle = (): RecoveryCycle | null => {
      try {
        const raw = sessionStorage.getItem(RECOVERY_CYCLE_KEY);
        if (!raw) return null;
        const value = JSON.parse(raw);
        if (
          !value ||
          typeof value.userId !== 'string' ||
          typeof value.savedAt !== 'string' ||
          !Number.isInteger(value.levelIndex) ||
          typeof value.resumeUrl !== 'string'
        ) {
          sessionStorage.removeItem(RECOVERY_CYCLE_KEY);
          return null;
        }
        return value;
      } catch {
        sessionStorage.removeItem(RECOVERY_CYCLE_KEY);
        return null;
      }
    };

    const clearRecoveryCycle = () => sessionStorage.removeItem(RECOVERY_CYCLE_KEY);

    const continueRecoveryAt = (recoveryPackage: any, levelIndex: number, resumeUrl: string) => {
      const userId = String(recoveryPackage?.userId || '');
      const savedAt = String(recoveryPackage?.savedAt || '');
      if (!userId || !savedAt || !resumeUrl) {
        throw new Error('Recovery continuation requires a package identity and target URL.');
      }
      sessionStorage.setItem(
        RECOVERY_CYCLE_KEY,
        JSON.stringify({
          userId,
          savedAt,
          levelIndex: Math.max(0, Number(levelIndex) || 0),
          resumeUrl,
        } satisfies RecoveryCycle),
      );
    };

    const matchingRecoveryCycle = (recoveryPackage: any) => {
      const cycle = readRecoveryCycle();
      if (
        !cycle ||
        cycle.userId !== recoveryPackage?.userId ||
        cycle.savedAt !== recoveryPackage?.savedAt
      ) {
        if (cycle) clearRecoveryCycle();
        return null;
      }
      return cycle;
    };

    const selectedNavigation = (root = document) =>
      [...root.querySelectorAll('[data-navigation-track-path][data-navigation-track-value]')]
        .filter(
          (element) =>
            element.classList.contains('active') ||
            element.getAttribute('aria-selected') === 'true',
        )
        .map((element) => ({
          statePath: element.getAttribute('data-navigation-track-path'),
          value: element.getAttribute('data-navigation-track-value'),
        }))
        .filter((entry) => entry.statePath && entry.value);

    const restoreNavigation = async (entries: any[] = [], root = document) => {
      for (const entry of entries) {
        const target = [
          ...root.querySelectorAll('[data-navigation-track-path][data-navigation-track-value]'),
        ].find(
          (element) =>
            element.getAttribute('data-navigation-track-path') === entry?.statePath &&
            element.getAttribute('data-navigation-track-value') === entry?.value,
        );
        if (!(target instanceof HTMLElement)) continue;
        const tab = browserWindow.bootstrap?.Tab?.getOrCreateInstance(target);
        if (!tab) continue;
        const shown = new Promise((resolve) => {
          target.addEventListener('shown.bs.tab', () => resolve(true), { once: true });
          window.setTimeout(() => resolve(false), 2_000);
        });
        tab.show();
        await shown;
      }
    };

    const pageLevelsInRestoreOrder = () => {
      const result: any[] = [];
      let node = browserWindow.ManatOS?.ctx?.value?.ui?.level;
      let path = 'ctx.ui.level';
      while (node) {
        const control = node.control || {};
        if (control.host === 'popup') break;
        result.push({
          path,
          control: {
            id: control.id || null,
            host: control.host || null,
            kind: control.kind || null,
            mode: control.mode || null,
            name: control.name || null,
            path: control.path || null,
            scope: control.scope || null,
            invocation: control.invocation || {},
            presentation: control.presentation || {},
            supportsUserChanges: control.supportsUserChanges === true,
            ...(control.entityKey ? { entityKey: control.entityKey } : {}),
            ...(control.entityName ? { entityName: control.entityName } : {}),
            ...(control.recordId ? { recordId: control.recordId } : {}),
          },
          state: { navigation: node.state?.navigation || null },
          restore: { type: 'base' },
        });
        node = node.level;
        path += '.level';
      }
      if (result.length) result[result.length - 1].state.navigation = selectedNavigation();
      return result;
    };

    const popupLevelsInRestoreOrder = () =>
      [
        ...(browserWindow.ManatOS?.popup?.entry?.snapshotDescriptors?.() || []).map(
          (descriptor: any) => ({
            path: descriptor.path || null,
            control: {
              host: 'popup',
              kind: 'entry',
              mode: descriptor.mode || 'view',
              name: descriptor.title || 'entry',
              invocation: descriptor.invocation || {},
              supportsUserChanges: descriptor.mode !== 'view',
              ...(descriptor.entityKey ? { entityKey: descriptor.entityKey } : {}),
            },
            state: { navigation: descriptor.navigation || [] },
            userChanges: descriptor.userChanges || null,
            restore: { type: 'entry', descriptor },
            order: Number(descriptor.order || 0),
          }),
        ),
        ...(browserWindow.ManatOS?.popup?.runtime?.snapshotDescriptors?.() || []).map(
          (descriptor: any) => ({
            control: {
              host: 'popup',
              kind: 'modal',
              mode: 'view',
              name: descriptor.popupId || 'modal',
              invocation: descriptor.invocation || {},
              supportsUserChanges: false,
            },
            state: { controls: descriptor.controls || [] },
            userChanges: null,
            restore: { type: 'modal', descriptor },
            order: Number(descriptor.order || 0),
          }),
        ),
      ].sort((left, right) => left.order - right.order);

    const clearLegacyOutageDrafts = (userId: any) => {
      try {
        const prefixes = [`manatos:entry-draft:${userId}:`, 'manatos.workspace-recovery.'];
        for (let index = localStorage.length - 1; index >= 0; index -= 1) {
          const key = localStorage.key(index);
          if (key && prefixes.some((prefix) => key.startsWith(prefix)))
            localStorage.removeItem(key);
        }
      } catch {
        // The IndexedDB package remains authoritative even if legacy cleanup is unavailable.
      }
    };

    const captureUserChanges = (level: any) => {
      if (!level?.control?.supportsUserChanges || !level?.path) return null;
      const registered = browserWindow.ManatOS?.uiHost?.getUserChanges?.(level.path) ?? null;
      if (registered != null) return registered;
      return browserWindow.ManatOS?.surfaceRecovery?.capture?.(level) ?? null;
    };

    const recoveryUrlFromLevel = (level: any) => {
      const registered = level?.path
        ? browserWindow.ManatOS?.uiHost?.recoveryUrl?.(level.path)
        : null;
      if (typeof registered === 'string' && registered) return registered;
      return browserWindow.ManatOS?.surfaceRecovery?.recoveryUrl?.(level) ?? null;
    };

    const recoveryRootUrl = (levels: any[]) => {
      // A routed child/owner-return transport may be POST-only and therefore is
      // not a valid recovery landing page. Let the owning recoverable surface
      // publish its canonical GET route; otherwise preserve the current URL.
      for (const level of [...levels].reverse()) {
        if (level?.restore?.type !== 'base' || !level?.path) continue;
        const url = recoveryUrlFromLevel(level);
        if (url) return url;
      }
      return currentUrl();
    };

    const collectAndGentleClose = async (userId: any) => {
      const levels = [...pageLevelsInRestoreOrder(), ...popupLevelsInRestoreOrder()];

      // Capture the complete outage transaction before mutating or closing any
      // surface. The IndexedDB package is the single recovery authority.
      for (const level of levels) {
        if (level.restore?.type !== 'base' || !level.path) continue;
        level.userChanges = captureUserChanges(level);
        const liveDirty = browserWindow.ManatOS?.ctx?.get?.(`${level.path}.state.dirty`) === true;
        if (level.control.supportsUserChanges && liveDirty && level.userChanges == null) {
          throw new Error(
            `Recovery capture is incomplete for dirty surface ${level.control.path || level.path}.`,
          );
        }
      }

      const hasUserChanges = levels.some((level) => level.userChanges != null);
      const recoveryPackage = hasUserChanges
        ? {
            version: VERSION,
            userId,
            savedAt: new Date().toISOString(),
            rootUrl: recoveryRootUrl(levels),
            levels,
          }
        : null;

      // Persist first. No dirty reset, Close/Cancel path, or UI disposal may run
      // before the authoritative recovery package is safely committed.
      if (recoveryPackage) await writePackage(recoveryPackage);

      // The recovery package is now authoritative. Dispose the captured UI through
      // the canonical lifecycle with an explicit discard decision. Do not rewrite
      // semantic baselines or dirty state merely to make the old UI closable.
      clearLegacyOutageDrafts(userId);
      try {
        const disposed = await browserWindow.ManatOS?.uiHost?.disposeAll?.(
          hasUserChanges ? 'system-unavailable' : 'system-unavailable-clean',
          { decision: 'discard' },
        );
        if (disposed !== true) {
          console.error('Recovery could not dispose the captured UI through canonical lifecycle.');
        }
      } catch (error) {
        // Recovery is already durable. A stale live-runtime disposal failure must
        // never suppress the system-unavailable presentation or invalidate the
        // captured package that will be offered after fresh authentication.
        console.error('Recovery UI disposal failed after the workspace was persisted.', error);
      } finally {
        // Typed UiLevel disposal owns semantic lifecycle. Popup runtime owns only
        // the final physical DOM retirement required by the outage boundary.
        browserWindow.ManatOS?.popup?.runtime?.retireAllVisibleModals?.();
        browserWindow.ManatOS?.popup?.runtime?.retireAllPhysicalSurfaces?.();
      }
      return recoveryPackage;
    };

    const invalidateLocalIdentity = () => {
      const runtime = browserWindow.ManatOS?.ctx;
      if (runtime?.replace && runtime.get?.('ctx.user') !== undefined) {
        runtime.replace('ctx.user', null, {
          source: 'system-unavailable-local-logout',
          triggerPath: 'ctx.user',
        });
      }
      const meta = document.querySelector('meta[name="manatos-user-id"]');
      if (meta) meta.setAttribute('content', 'anonymous');
      if (document.body) {
        document.body.dataset.userId = 'anonymous';
        document.body.classList.remove('authenticated');
        document.body.classList.add('anonymous');
      }
    };

    const markUnavailableAndDispose = async () => {
      const userId = currentUserId();
      if (!userId || userId === 'anonymous') return null;
      browserWindow.ManatOS?.busy?.show?.({
        title: 'Preserving your workspace…',
        message: 'ManatOS is safely storing your unsaved work before closing the unavailable UI.',
        icon: 'bi-cloud-arrow-down',
      });
      try {
        const recoveryPackage = await collectAndGentleClose(userId);
        invalidateLocalIdentity();
        return recoveryPackage;
      } finally {
        browserWindow.ManatOS?.busy?.hide?.();
      }
    };

    const recoveryModal = () => {
      let modal = document.getElementById('workspaceRecoveryModal');
      if (modal instanceof HTMLElement) return modal;
      modal = document.createElement('div');
      modal.id = 'workspaceRecoveryModal';
      modal.className = 'modal';
      modal.tabIndex = -1;
      modal.setAttribute('aria-hidden', 'true');
      modal.dataset.popupPurpose = 'workspace-recovery';
      modal.dataset.surfaceKind = 'custom';
      modal.dataset.popupInvocation = JSON.stringify({
        purpose: 'workspace-recovery',
        behavior: { recoverable: false },
      });
      modal.innerHTML = `
      <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header"><h2 class="modal-title fs-5" data-v2-layout-caption="surface">Recover previous workspace?</h2></div>
          <div class="modal-body" data-v2-layout-region="content">
            <div class="d-flex align-items-center gap-3" data-v2-layout-component-instance="summary">
              <div
                class="position-relative flex-shrink-0 d-flex align-items-center justify-content-center rounded-circle bg-primary-subtle border border-primary-subtle"
                aria-hidden="true"
                data-workspace-recovery-prompt-illustration
                style="width:4.5rem;height:4.5rem;"
              >
                <i class="bi bi-window-stack text-primary" style="font-size:2rem"></i>
                <span class="position-absolute bottom-0 end-0 rounded-circle bg-body border shadow-sm d-flex align-items-center justify-content-center" style="width:1.9rem;height:1.9rem;">
                  <i class="bi bi-arrow-counterclockwise text-success"></i>
                </span>
              </div>
              <div>
                <p class="mb-2">ManatOS found UI state and unsaved changes saved during the outage.</p>
                <p class="text-secondary small mb-0" data-workspace-recovery-time></p>
              </div>
            </div>
            <div class="mt-3" data-workspace-recovery-plan data-v2-layout-component-instance="report"></div>
          </div>
          <div class="modal-footer" data-v2-layout-actions="surface">
            <button type="button" class="btn btn-outline-danger" data-workspace-recovery-forget data-v2-layout-action="forget">Forget it</button>
            <button type="button" class="btn btn-primary" data-workspace-recovery-restore data-v2-layout-action="recover">Recover workspace</button>
          </div>
        </div>
      </div>`;
      document.body.append(modal);
      browserWindow.ManatOS?.popup?.runtime?.registerBootstrapModal?.(modal);
      return modal;
    };

    const recoverySuccessModal = () => {
      let modal = document.getElementById('workspaceRecoverySuccessModal');
      if (modal instanceof HTMLElement) return modal;

      modal = document.createElement('div');
      modal.className = 'modal fade';
      modal.id = 'workspaceRecoverySuccessModal';
      modal.tabIndex = -1;
      modal.setAttribute('aria-labelledby', 'workspaceRecoverySuccessModalLabel');
      modal.dataset.popupPurpose = 'workspace-recovery-success';
      modal.dataset.surfaceKind = 'custom';
      modal.dataset.popupInvocation = JSON.stringify({
        purpose: 'workspace-recovery-success',
        behavior: { recoverable: false },
      });
      modal.innerHTML = `
      <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header bg-success-subtle">
            <h5 class="modal-title" id="workspaceRecoverySuccessModalLabel" data-v2-layout-caption="surface">
              <i class="bi bi-check-circle me-2" aria-hidden="true"></i>Workspace restored
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body py-4" data-v2-layout-region="content">
            <div class="d-flex align-items-center justify-content-center gap-4 flex-wrap flex-sm-nowrap" data-v2-layout-component-instance="summary">
              <div
                class="position-relative flex-shrink-0 d-flex align-items-center justify-content-center"
                aria-hidden="true"
                data-workspace-recovery-illustration
                style="width: 11.5rem; height: 8.5rem;"
              >
                <div class="position-absolute start-0 top-50 translate-middle-y rounded-4 border bg-body shadow-sm" style="width:5.2rem;height:5.6rem;transform:translateY(-50%) rotate(-7deg)!important;">
                  <div class="border-bottom px-2 py-1 d-flex gap-1"><span class="rounded-circle bg-danger-subtle" style="width:.45rem;height:.45rem"></span><span class="rounded-circle bg-warning-subtle" style="width:.45rem;height:.45rem"></span><span class="rounded-circle bg-success-subtle" style="width:.45rem;height:.45rem"></span></div>
                  <div class="p-2 text-primary"><i class="bi bi-diagram-3-fill fs-4"></i><div class="mt-1 d-flex gap-1"><span class="badge text-bg-light border">6</span><span class="badge bg-warning text-dark"><i class="bi bi-pencil-fill"></i></span></div></div>
                  <span class="position-absolute top-100 start-50 translate-middle badge rounded-pill bg-warning text-dark shadow-sm"><i class="bi bi-cloud-slash me-1"></i>unsaved</span>
                </div>
                <div class="position-absolute top-50 start-50 translate-middle d-flex flex-column align-items-center text-primary">
                  <i class="bi bi-arrow-repeat" style="font-size:2.3rem"></i>
                  <span class="small fw-semibold text-body-secondary">recover</span>
                </div>
                <div class="position-absolute end-0 top-50 translate-middle-y rounded-circle bg-success-subtle border border-success-subtle shadow d-flex align-items-center justify-content-center" style="width:4.8rem;height:4.8rem;">
                  <i class="bi bi-box-arrow-in-down-left text-success" style="font-size:2.25rem"></i>
                  <i class="bi bi-stars text-warning position-absolute top-0 end-0 fs-5"></i>
                  <span class="position-absolute top-100 start-50 translate-middle badge rounded-pill bg-success"><i class="bi bi-check2 me-1"></i>restored</span>
                </div>
              </div>
              <div class="text-center flex-grow-1">
                <div class="position-relative d-inline-flex align-items-center justify-content-center mb-2" aria-hidden="true" style="width: 5rem; height: 5rem;">
                  <i class="bi bi-check-circle-fill text-success" style="font-size: 4.25rem; line-height: 1;"></i>
                  <i class="bi bi-stars text-warning position-absolute top-0 end-0" style="font-size: 1.5rem;"></i>
                  <i class="bi bi-stars text-warning position-absolute bottom-0 start-0" style="font-size: 1rem;"></i>
                </div>
                <div class="fw-semibold fs-5">Your unsaved changes are restored!</div>
                <div class="text-body-secondary small mt-1" data-workspace-recovery-success-summary></div>
              </div>
            </div>
            <div class="mt-4" data-workspace-recovery-report data-v2-layout-component-instance="report"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-primary" data-bs-dismiss="modal">OK</button>
          </div>
        </div>
      </div>`;
      document.body.append(modal);
      browserWindow.ManatOS?.popup?.runtime?.registerBootstrapModal?.(modal);
      return modal;
    };

    const recoveryFieldChanges = (userChanges: any) => {
      if (userChanges?.format !== 'field-delta-v1' || !userChanges?.fields) {
        return structuredClone(userChanges);
      }
      return {
        format: userChanges.format,
        runtimeResources:
          userChanges.runtimeResources && typeof userChanges.runtimeResources === 'object'
            ? structuredClone(userChanges.runtimeResources)
            : {},
        fields: Object.fromEntries(
          Object.entries(userChanges.fields as Record<string, any>).map(([field, change]) => [
            field,
            {
              ...(Object.prototype.hasOwnProperty.call(change || {}, 'originalValue')
                ? { originalValue: structuredClone(change?.originalValue) }
                : {}),
              restoredValue: structuredClone(change?.value),
              ...(change?.component ? { component: structuredClone(change.component) } : {}),
            },
          ]),
        ),
      };
    };

    const recoverySurfaceCaption = (level: any) => {
      const presentation = level?.control?.presentation || {};
      const entityKey = String(level?.control?.entityKey || '').trim();
      const entityCaption = entityKey
        ? browserWindow.ManatOS?.semanticChangePresentation?.entityLabel?.(entityKey) || ''
        : '';
      const title = presentation.title || presentation.caption || entityCaption || '';
      const name = String(level?.control?.name || '').trim();
      if (level?.control?.kind === 'hierarchy' && level?.control?.recordId && level?.userChanges) {
        const identityField = String(level.userChanges.identityField || 'id');
        const focused = (level.userChanges.entries || []).find(
          (row: any) => String(row?.[identityField] ?? '') === String(level.control.recordId),
        );
        const focusedDescriptor = focused
          ? browserWindow.ManatOS?.semanticChangePresentation?.entryDescriptor?.(
              level.control.entityKey,
              focused,
              identityField,
            )
          : null;
        if (focusedDescriptor?.label) {
          const prefix = `${title || entityCaption || 'Organization'} — `;
          return {
            caption: `${prefix}${focusedDescriptor.label}`,
            entryDescriptor: { ...focusedDescriptor, prefix },
          };
        }
      }
      if (level?.control?.kind === 'hierarchy' && !title && name) {
        return { caption: name.charAt(0).toUpperCase() + name.slice(1), entryDescriptor: null };
      }
      const presentationName = name && name.toLowerCase() !== entityKey.toLowerCase() ? name : '';
      const caption =
        title && presentationName && presentationName.toLowerCase() !== String(title).toLowerCase()
          ? `${title} — ${presentationName}`
          : title || presentationName || entityKey || 'Surface';
      return { caption, entryDescriptor: null };
    };

    const restoredSurfaceData = (recoveryPackage: any) =>
      (recoveryPackage?.levels || []).map((level: any) => {
        const surfacePresentation = recoverySurfaceCaption(level);
        return {
          caption: surfacePresentation.caption,
          entryDescriptor: surfacePresentation.entryDescriptor,
          host: level.control?.host || null,
          kind: level.control?.kind || null,
          name: level.control?.name || null,
          hasChanges: level?.userChanges != null,
          ...(level.control?.entityKey ? { entityKey: level.control.entityKey } : {}),
          ...(level.control?.recordId ? { identity: String(level.control.recordId) } : {}),
          ...(level.path ? { ctxPath: level.path } : {}),
          ...(level.control?.path ? { surfacePath: level.control.path } : {}),
          changes: recoveryFieldChanges(level.userChanges),
          runtimeResources:
            level?.userChanges?.runtimeResources &&
            typeof level.userChanges.runtimeResources === 'object'
              ? structuredClone(level.userChanges.runtimeResources)
              : {},
        };
      });

    const recoveryHierarchyNode = (surface: any) => {
      const changes = surface?.changes || {};
      if (!['hierarchy-commit-v1', 'hierarchy-commit-v2'].includes(changes.format)) return null;
      const report = browserWindow.ManatOS?.semanticChangeReport?.hierarchy?.({
        entityKey: surface.entityKey,
        caption: surface.caption,
        identityField: String(changes.identityField || 'id'),
        entries: Array.isArray(changes.entries) ? changes.entries : [],
        entriesOriginal: Array.isArray(changes.entriesOriginal) ? changes.entriesOriginal : [],
        recycleBin: Array.isArray(changes.recycleBin) ? changes.recycleBin : [],
        workspaceTransaction: changes.workspaceTransaction,
        // After restart the captured CTX path no longer owns this surface. Rebuild
        // presentation from the captured semantic state against the current registry.
        ownerPath: null,
      });
      return report?.nodes?.[0] || null;
    };

    const recoveryFieldNode = (surface: any) => {
      const fields =
        surface?.changes?.format === 'field-delta-v1' ? surface.changes.fields || {} : null;
      if (!fields) return null;
      const report = browserWindow.ManatOS?.semanticChangeReport?.recoveredFieldDelta?.({
        entityKey: surface.entityKey,
        caption: surface.caption,
        fields,
        ownerPath: null,
        identity: surface.identity || null,
      });
      return report?.nodes?.[0] || null;
    };

    const recoveryEntityLabel = (entityKey: any, count: any) => {
      const label =
        browserWindow.ManatOS?.semanticChangePresentation?.entityLabel?.(String(entityKey || '')) ||
        String(entityKey || 'Related entries');
      if (count === 1 && label.endsWith('s')) return label.slice(0, -1);
      return label;
    };

    const recoveryReportModel = (surfaces: any) => {
      const nodes = surfaces.map((surface: any, surfaceIndex: number) => {
        const changedNode = surface.hasChanges
          ? recoveryHierarchyNode(surface) || recoveryFieldNode(surface)
          : null;
        return {
          ...(changedNode || {}),
          label: surface.caption || 'Recovered surface',
          ...(surface.entryDescriptor ? { entryDescriptor: surface.entryDescriptor } : {}),
          icon: changedNode?.icon || 'bi-window',
          emphasis: surface.hasChanges === true,
          expanded: surface.hasChanges === true,
          resourceScope: `recovery-surface:${surfaceIndex}`,
        };
      });
      const entityCounts = new Map();
      let fieldCount = 0;
      for (const surface of surfaces) {
        const entries = Array.isArray(surface?.changes?.entries) ? surface.changes.entries : [];
        const originals = Array.isArray(surface?.changes?.entriesOriginal)
          ? surface.changes.entriesOriginal
          : [];
        if (entries.length) {
          const identityField = String(surface?.changes?.identityField || 'id');
          const originalsById = new Map(
            originals.map((row: any) => [String(row?.[identityField] ?? ''), row]),
          );
          const changedEntries = entries.filter((row: any) => {
            const id = String(row?.[identityField] ?? '');
            const before = originalsById.get(id);
            return !before || !semanticEqual(before, row);
          });
          if (changedEntries.length) {
            const key = String(surface.entityKey || 'organization-members');
            entityCounts.set(key, (entityCounts.get(key) || 0) + changedEntries.length);
          }
        }
        const mutations = flattenWorkspaceMutations(surface?.changes?.workspaceTransaction);
        for (const mutation of mutations) {
          const key = String(mutation?.entityKey || 'related-entries');
          entityCounts.set(key, (entityCounts.get(key) || 0) + 1);
        }
        if (surface?.changes?.format === 'field-delta-v1') {
          fieldCount += Object.keys(surface.changes.fields || {}).length;
        }
      }
      const parts = [...entityCounts.entries()].map(
        ([entityKey, count]) => `${count} ${recoveryEntityLabel(entityKey, count)}`,
      );
      if (fieldCount)
        parts.push(`${fieldCount} ${fieldCount === 1 ? 'field change' : 'field changes'}`);
      return {
        summary: parts.length
          ? `Recovered ${parts.join(' · ')}. Expand below to review the restored data.`
          : 'Expand below to review the restored data.',
        nodes,
      };
    };

    const renderRecoveryPlan = (modal: HTMLElement, recoveryPackage: any) => {
      const surfaces = restoredSurfaceData(recoveryPackage);
      const report = modal.querySelector('[data-workspace-recovery-plan]');
      browserWindow.ManatOS?.semanticReportPresentation?.render?.(
        report,
        recoveryReportModel(surfaces),
        browserWindow.ManatOS?.semanticReportPresentation?.recovered?.(surfaces),
        {
          summary: `${surfaces.length} ${surfaces.length === 1 ? 'surface' : 'surfaces'} will be reopened in this order.`,
        },
      );
    };

    const presentRecoverySuccess = (recoveryPackage: any) => {
      const modal = recoverySuccessModal();
      const surfaces = restoredSurfaceData(recoveryPackage);
      const restoredAt = new Date().toISOString();
      modal.dataset.popupInvocation = JSON.stringify({
        purpose: 'workspace-recovery-success',
        behavior: { recoverable: false },
        data: { recovery: { restoredAt, surfaces } },
      });
      const reportModel = recoveryReportModel(surfaces);
      const summary = modal.querySelector('[data-workspace-recovery-success-summary]');
      if (summary) {
        const count = surfaces.length;
        summary.textContent = `${count} ${count === 1 ? 'surface' : 'surfaces'} recovered. ${reportModel.summary}`;
      }
      const report = modal.querySelector('[data-workspace-recovery-report]');
      browserWindow.ManatOS?.semanticReportPresentation?.render?.(
        report,
        reportModel,
        browserWindow.ManatOS?.semanticReportPresentation?.recovered?.(surfaces),
        { summary: 'Recovered data' },
      );
      let acknowledged = false;
      const onAcknowledge = (event: Event) => {
        if (
          !(event.target instanceof Element) ||
          !event.target.closest('[data-bs-dismiss="modal"]')
        )
          return;
        acknowledged = true;
      };
      modal.addEventListener('click', onAcknowledge);
      modal.addEventListener(
        'hidden.bs.modal',
        () => {
          modal.removeEventListener('click', onAcknowledge);
          if (!acknowledged) return;
          void (async () => {
            try {
              await consumeRecoveredPackage(recoveryPackage);
            } catch (error) {
              console.error('ManatOS could not retire the acknowledged recovery package.', error);
            } finally {
              clearRecoveryCycle();
            }
          })();
        },
        { once: true },
      );
      browserWindow.bootstrap?.Modal?.getOrCreateInstance(modal, {
        backdrop: 'static',
        keyboard: false,
      })?.show();
    };

    const offer = async (userId: any) => {
      const recoveryPackage = await readPackage(userId);
      if (!recoveryPackage) return 'none';
      return await new Promise((resolve) => {
        const modalElement = recoveryModal();
        const modal = browserWindow.bootstrap?.Modal?.getOrCreateInstance(modalElement, {
          backdrop: 'static',
          keyboard: false,
        });
        if (!modal) {
          resolve('none');
          return;
        }
        const time = modalElement.querySelector('[data-workspace-recovery-time]');
        if (time) time.textContent = `Saved ${new Date(recoveryPackage.savedAt).toLocaleString()}.`;
        renderRecoveryPlan(modalElement, recoveryPackage);
        const restore = modalElement.querySelector('[data-workspace-recovery-restore]');
        const forgetButton = modalElement.querySelector('[data-workspace-recovery-forget]');

        const cleanup = () => {
          restore?.removeEventListener('click', onRestore);
          forgetButton?.removeEventListener('click', onForget);
        };
        const onRestore = async () => {
          cleanup();
          modal.hide();
          // Start recovery in the current authenticated document. Missing base
          // surfaces are reconstructed by their typed provider from the captured
          // semantic state; the stored root URL is not itself a recovery target.
          const resumeUrl = currentUrl();
          const cycle: RecoveryCycle = {
            userId: recoveryPackage.userId,
            savedAt: recoveryPackage.savedAt,
            levelIndex: 0,
            resumeUrl,
          };
          continueRecoveryAt(recoveryPackage, 0, resumeUrl);
          resolve('restore');
          void restorePackage(recoveryPackage, cycle);
        };
        const onForget = async () => {
          cleanup();
          await removePackage(userId);
          clearRecoveryCycle();
          modal.hide();
          resolve('forget');
        };
        restore?.addEventListener('click', onRestore);
        forgetButton?.addEventListener('click', onForget);
        modal.show();
      });
    };

    const waitForBaseInitialization = async () => {
      const form = document.querySelector(
        'form.metadata-driven-record-form[data-dirty-guard="true"]',
      );
      if (!(form instanceof HTMLFormElement) || form.dataset.manatosBaselineCaptured === 'true')
        return;
      await new Promise((resolve) => {
        form.addEventListener('manatos:form-baseline-captured', resolve, { once: true });
        window.setTimeout(resolve, 15_000);
      });
    };

    const waitForDomQuiescence = async (root = document, quietMs = 120, timeoutMs = 2_000) => {
      const target = root instanceof Node ? root : document;
      await new Promise<void>((resolve) => {
        let quietTimer: number | null = null;
        let timeoutTimer: number | null = null;
        const finish = () => {
          observer.disconnect();
          if (quietTimer) window.clearTimeout(quietTimer);
          if (timeoutTimer) window.clearTimeout(timeoutTimer);
          resolve();
        };
        const scheduleQuiet = () => {
          if (quietTimer) window.clearTimeout(quietTimer);
          quietTimer = window.setTimeout(finish, quietMs);
        };
        const observer = new MutationObserver(scheduleQuiet);
        observer.observe(target, { childList: true, subtree: true, attributes: true });
        timeoutTimer = window.setTimeout(finish, timeoutMs);
        scheduleQuiet();
      });
    };

    const recoveryFailure = (message: any, level: any = null, cause: any = null) => {
      const levelName =
        level?.control?.name || level?.control?.entityName || level?.control?.path || 'UI level';
      const child = {
        description: `Restore ${levelName}`,
        userDescription: `Restoring ${levelName}`,
        status: 'failed',
        comments: [
          ...(level?.control?.path
            ? [{ name: 'path', value: level.control.path, sensitive: false }]
            : []),
          ...(level?.control?.kind
            ? [{ name: 'kind', value: level.control.kind, sensitive: false }]
            : []),
        ],
        children: [],
        errorCode: 'WORKSPACE_RECOVERY_FAILED',
        errorMessage: message,
      };
      return {
        name: 'WorkspaceRecoveryError',
        code: 'WORKSPACE_RECOVERY_FAILED',
        message,
        userMessage: message,
        retryable: true,
        cause: cause instanceof Error ? cause.message : cause ? String(cause) : null,
        operationTrace: [
          {
            description: 'Recover workspace',
            userDescription: 'Recovering your workspace',
            status: 'failed',
            comments: [],
            children: [child],
            errorCode: 'WORKSPACE_RECOVERY_FAILED',
            errorMessage: message,
          },
        ],
      };
    };

    const restorePackage = async (recoveryPackage: any, cycle: RecoveryCycle) => {
      if (cycle.resumeUrl !== currentUrl()) return false;
      const restoreIndex = Math.max(0, Number(cycle.levelIndex || 0));
      browserWindow.ManatOS?.busy?.show?.({
        title: 'Recovering your workspace…',
        message: 'ManatOS is restoring your pages and unsaved changes.',
        icon: 'bi-arrow-repeat',
      });
      try {
        await waitForBaseInitialization();
        const recoveryLevels = recoveryPackage.levels || [];
        for (let levelIndex = restoreIndex; levelIndex < recoveryLevels.length; levelIndex += 1) {
          const level = recoveryLevels[levelIndex];
          const type = level?.restore?.type;
          if (type === 'base') {
            if (Array.isArray(level.state?.navigation)) {
              await restoreNavigation(level.state.navigation);
              await waitForDomQuiescence(document);
            }
            if (level.userChanges && level.control?.path) {
              const currentPath = (() => {
                let node = browserWindow.ManatOS?.ctx?.value?.ui?.level;
                let path = 'ctx.ui.level';
                let semanticMatch: string | null = null;
                while (node) {
                  if (node.control?.path === level.control.path) return path;
                  if (
                    !semanticMatch &&
                    browserWindow.ManatOS?.surfaceRecovery?.matchesRecoveryTarget?.(level, node)
                  ) {
                    semanticMatch = path;
                  }
                  node = node.level;
                  path += '.level';
                }
                return semanticMatch;
              })();
              if (!currentPath) {
                const resumed = await browserWindow.ManatOS?.surfaceRecovery?.resumeMissing?.({
                  recoveryPackage,
                  level,
                  levelIndex,
                  continueRecoveryAt: (levelIndex: number, resumeUrl: string) =>
                    continueRecoveryAt(recoveryPackage, levelIndex, resumeUrl),
                  recoveryFailure,
                });
                if (resumed) return false;
                throw recoveryFailure(
                  `Recovery target is unavailable for ${level.control.path}.`,
                  level,
                );
              }
              const applied = await browserWindow.ManatOS?.uiHost?.applyUserChanges?.(
                currentPath,
                level.userChanges,
              );
              if (applied !== true) {
                throw recoveryFailure(
                  `Recovery changes could not be applied for ${level.control.path}.`,
                  level,
                );
              }
              await waitForDomQuiescence(document);
              const verified = await browserWindow.ManatOS?.uiHost?.verifyUserChanges?.(
                currentPath,
                level.userChanges,
              );
              if (verified !== true) {
                throw recoveryFailure(
                  `Recovered changes did not remain stable for ${level.control.path}.`,
                  level,
                );
              }
            }
          } else if (type === 'entry') {
            const descriptor = {
              ...(level.restore.descriptor || {}),
              userChanges: level.userChanges || null,
            };
            await browserWindow.ManatOS?.popup?.entry?.restoreDescriptor?.(descriptor);
          } else if (type === 'modal') {
            await browserWindow.ManatOS?.popup?.runtime?.restoreDescriptor?.(
              level.restore.descriptor,
            );
          }
        }
        /*
         * Every requested level has now been restored and verified, but the recovery
         * transaction remains open while the success report is visible. The exact
         * package is consumed only when the user explicitly closes that report.
         */
        window.dispatchEvent(new CustomEvent('manatos:workspace-recovered'));
        browserWindow.ManatOS?.busy?.hide?.();
        presentRecoverySuccess(recoveryPackage);
        return true;
      } catch (error) {
        const structured =
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'WORKSPACE_RECOVERY_FAILED'
            ? error
            : recoveryFailure(
                error instanceof Error ? error.message : 'The workspace could not be recovered.',
                null,
                error,
              );
        console.error('ManatOS workspace recovery failed.', error);
        // Recovery attempts are transient. The captured package remains authoritative and retryable.
        clearRecoveryCycle();
        browserWindow.ManatOS?.busy?.hide?.();
        browserWindow.ManatOS?.errors?.present?.(structured, {
          retry: () => {
            const retryUrl = currentUrl();
            const retryCycle: RecoveryCycle = {
              userId: recoveryPackage.userId,
              savedAt: recoveryPackage.savedAt,
              levelIndex: restoreIndex,
              resumeUrl: retryUrl,
            };
            continueRecoveryAt(recoveryPackage, restoreIndex, retryUrl);
            void restorePackage(recoveryPackage, retryCycle);
          },
        });
        return false;
      } finally {
        browserWindow.ManatOS?.busy?.hide?.();
      }
    };

    const considerRecoveryForCurrentUser = async () => {
      const userId = currentUserId();
      if (!userId || userId === 'anonymous') return;
      const recoveryPackage = await readPackage(userId);
      if (!recoveryPackage) return;
      const cycle = matchingRecoveryCycle(recoveryPackage);
      if (cycle && cycle.resumeUrl === currentUrl()) {
        await restorePackage(recoveryPackage, cycle);
        return;
      }
      clearRecoveryCycle();
      await offer(userId);
    };

    browserWindow.ManatOS.workspaceRecovery = Object.freeze({
      markUnavailableAndDispose,
      offer,
      readPackage,
      restorePackage,
    });

    window.addEventListener('load', () => void considerRecoveryForCurrentUser(), { once: true });
  }
}

export const workspaceRecoveryController = new WorkspaceRecoveryController();
