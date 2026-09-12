/**
 * Per-user outage recovery.
 *
 * One IndexedDB record is the sole outage-recovery authority for a user. It owns
 * the ordered UI-level descriptors and each level's recoverable user changes.
 * Large picture/pictures POST payloads therefore stay inside the same package
 * without localStorage quota pressure or a parallel blob/draft authority.
 */
(() => {
  'use strict';

  window.ManatOS ||= {};

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
    new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, VERSION);
      request.addEventListener('upgradeneeded', () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      });
      request.addEventListener('success', () => resolve(request.result));
      request.addEventListener('error', () => reject(request.error));
    });

  const withStore = async (mode, work) => {
    const db = await openDatabase();
    try {
      return await new Promise((resolve, reject) => {
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

  const readPackage = async (userId) => {
    if (!userId || userId === 'anonymous') return null;
    const db = await openDatabase();
    try {
      return await new Promise((resolve, reject) => {
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

  const writePackage = async (recoveryPackage) => {
    await withStore('readwrite', (store) => store.put(recoveryPackage, recoveryPackage.userId));
    return recoveryPackage;
  };

  const removePackage = async (userId) => {
    if (!userId || userId === 'anonymous') return;
    await withStore('readwrite', (store) => store.delete(userId));
  };

  const rootUrl = () => `${location.pathname}${location.search}${location.hash}`;

  const selectedNavigation = (root = document) =>
    [...root.querySelectorAll('[data-navigation-track-path][data-navigation-track-value]')]
      .filter(
        (element) =>
          element.classList.contains('active') || element.getAttribute('aria-selected') === 'true',
      )
      .map((element) => ({
        statePath: element.getAttribute('data-navigation-track-path'),
        value: element.getAttribute('data-navigation-track-value'),
      }))
      .filter((entry) => entry.statePath && entry.value);

  const restoreNavigation = async (entries = [], root = document) => {
    for (const entry of entries) {
      const target = [
        ...root.querySelectorAll('[data-navigation-track-path][data-navigation-track-value]'),
      ].find(
        (element) =>
          element.getAttribute('data-navigation-track-path') === entry?.statePath &&
          element.getAttribute('data-navigation-track-value') === entry?.value,
      );
      if (!(target instanceof HTMLElement)) continue;
      const tab = window.bootstrap?.Tab?.getOrCreateInstance(target);
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
    const result = [];
    let node = window.ManatOS?.ctx?.value?.ui?.level;
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
        state: { navigation: control.state?.navigation || null },
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
      ...(window.ManatOS?.popup?.entry?.snapshotDescriptors?.() || []).map((descriptor) => ({
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
      })),
      ...(window.ManatOS?.popup?.runtime?.snapshotDescriptors?.() || []).map((descriptor) => ({
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
      })),
    ].sort((left, right) => left.order - right.order);

  const clearLegacyOutageDrafts = (userId) => {
    try {
      const prefixes = [`manatos:entry-draft:${userId}:`, 'manatos.workspace-recovery.'];
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index);
        if (key && prefixes.some((prefix) => key.startsWith(prefix))) localStorage.removeItem(key);
      }
    } catch {
      // The IndexedDB package remains authoritative even if legacy cleanup is unavailable.
    }
  };

  const collectAndGentleClose = async (userId) => {
    const levels = [...pageLevelsInRestoreOrder(), ...popupLevelsInRestoreOrder()];

    // Capture the complete outage transaction before mutating or closing any
    // surface. The IndexedDB package is the single recovery authority.
    for (const level of levels) {
      if (level.restore?.type !== 'base' || !level.path) continue;
      level.userChanges = level.control.supportsUserChanges
        ? (window.ManatOS?.uiHost?.getUserChanges?.(level.path) ?? null)
        : null;
    }

    const hasUserChanges = levels.some((level) => level.userChanges != null);
    const recoveryPackage = hasUserChanges
      ? {
          version: VERSION,
          userId,
          savedAt: new Date().toISOString(),
          rootUrl: rootUrl(),
          restoreRequested: false,
          levels,
        }
      : null;

    // Persist first. No dirty reset, Close/Cancel path, or UI disposal may run
    // before the authoritative recovery package is safely committed.
    if (recoveryPackage) await writePackage(recoveryPackage);
    else await removePackage(userId);

    // Gentle-hard close deepest/newest first only after persistence.
    for (const level of [...levels].reverse()) {
      if (level.restore?.type === 'base' && level.path && level.control.supportsUserChanges) {
        await window.ManatOS?.uiHost?.prepareGentleClose?.(level.path);
      }
    }
    await window.ManatOS?.popup?.entry?.gentleCloseAll?.();
    await window.ManatOS?.popup?.runtime?.gentleCloseAllRecoverableModals?.();

    clearLegacyOutageDrafts(userId);
    window.ManatOS?.uiHost?.disposeAll?.(
      hasUserChanges ? 'system-unavailable' : 'system-unavailable-clean',
    );
    return recoveryPackage;
  };

  const invalidateLocalIdentity = () => {
    const runtime = window.ManatOS?.ctx;
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
    window.ManatOS?.busy?.show?.({
      title: 'Preserving your workspace…',
      message: 'ManatOS is safely storing your unsaved work before closing the unavailable UI.',
      icon: 'bi-cloud-arrow-down',
    });
    try {
      const recoveryPackage = await collectAndGentleClose(userId);
      invalidateLocalIdentity();
      return recoveryPackage;
    } finally {
      window.ManatOS?.busy?.hide?.();
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
    modal.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header"><h2 class="modal-title fs-5">Recover previous workspace?</h2></div>
          <div class="modal-body">
            <p class="mb-2">ManatOS found UI state and unsaved changes saved during the outage.</p>
            <p class="text-secondary small mb-0" data-workspace-recovery-time></p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-danger" data-workspace-recovery-forget>Forget it</button>
            <button type="button" class="btn btn-primary" data-workspace-recovery-restore>Recover workspace</button>
          </div>
        </div>
      </div>`;
    document.body.append(modal);
    return modal;
  };

  const offer = async (userId) => {
    const recoveryPackage = await readPackage(userId);
    if (!recoveryPackage) return 'none';

    return await new Promise((resolve) => {
      const modalElement = recoveryModal();
      const modal = window.bootstrap?.Modal?.getOrCreateInstance(modalElement, {
        backdrop: 'static',
        keyboard: false,
      });
      if (!modal) {
        resolve('none');
        return;
      }
      const time = modalElement.querySelector('[data-workspace-recovery-time]');
      if (time) time.textContent = `Saved ${new Date(recoveryPackage.savedAt).toLocaleString()}.`;
      const restore = modalElement.querySelector('[data-workspace-recovery-restore]');
      const forgetButton = modalElement.querySelector('[data-workspace-recovery-forget]');

      const cleanup = () => {
        restore?.removeEventListener('click', onRestore);
        forgetButton?.removeEventListener('click', onForget);
      };
      const onRestore = async () => {
        cleanup();
        modal.hide();
        await writePackage({ ...recoveryPackage, restoreRequested: true });
        resolve('restore');
        location.assign(recoveryPackage.rootUrl);
      };
      const onForget = async () => {
        cleanup();
        modal.hide();
        await removePackage(userId);
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
    await new Promise((resolve) => {
      let quietTimer = null;
      let timeoutTimer = null;
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

  const recoveryFailure = (message, level = null, cause = null) => {
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

  const restoreRequestedPackage = async (recoveryPackage) => {
    if (!recoveryPackage?.restoreRequested || recoveryPackage.rootUrl !== rootUrl()) return false;
    window.ManatOS?.busy?.show?.({
      title: 'Recovering your workspace…',
      message: 'ManatOS is restoring your pages and unsaved changes.',
      icon: 'bi-arrow-repeat',
    });
    try {
      await waitForBaseInitialization();
      for (const level of recoveryPackage.levels || []) {
        const type = level?.restore?.type;
        if (type === 'base') {
          if (Array.isArray(level.state?.navigation)) {
            await restoreNavigation(level.state.navigation);
            await waitForDomQuiescence(document);
          }
          if (level.userChanges && level.control?.path) {
            const currentPath = (() => {
              let node = window.ManatOS?.ctx?.value?.ui?.level;
              let path = 'ctx.ui.level';
              while (node) {
                if (node.control?.path === level.control.path) return path;
                node = node.level;
                path += '.level';
              }
              return null;
            })();
            if (!currentPath)
              throw recoveryFailure(
                `Recovery target is unavailable for ${level.control.path}.`,
                level,
              );
            const applied = await window.ManatOS?.uiHost?.applyUserChanges?.(
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
            const verified = await window.ManatOS?.uiHost?.verifyUserChanges?.(
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
          await window.ManatOS?.popup?.entry?.restoreDescriptor?.(descriptor);
        } else if (type === 'modal') {
          await window.ManatOS?.popup?.runtime?.restoreDescriptor?.(level.restore.descriptor);
        }
      }
      await removePackage(recoveryPackage.userId);
      window.dispatchEvent(new CustomEvent('manatos:workspace-recovered'));
      return true;
    } catch (error) {
      const structured =
        error && typeof error === 'object' && error.code === 'WORKSPACE_RECOVERY_FAILED'
          ? error
          : recoveryFailure(
              error instanceof Error ? error.message : 'The workspace could not be recovered.',
              null,
              error,
            );
      console.error('ManatOS workspace recovery failed.', error);
      // Keep the package and restoreRequested flag intact for another attempt.
      window.ManatOS?.busy?.hide?.();
      window.ManatOS?.errors?.present?.(structured, {
        retry: () => void restoreRequestedPackage(recoveryPackage),
      });
      return false;
    } finally {
      window.ManatOS?.busy?.hide?.();
    }
  };

  const considerRecoveryForCurrentUser = async () => {
    const userId = currentUserId();
    if (!userId || userId === 'anonymous') return;
    const recoveryPackage = await readPackage(userId);
    if (!recoveryPackage) return;
    if (recoveryPackage.restoreRequested) {
      await restoreRequestedPackage(recoveryPackage);
      return;
    }
    await offer(userId);
  };

  window.ManatOS.workspaceRecovery = Object.freeze({
    markUnavailableAndDispose,
    offer,
    readPackage,
    removePackage,
    restoreRequestedPackage,
  });

  window.addEventListener('load', () => void considerRecoveryForCurrentUser(), { once: true });
})();
