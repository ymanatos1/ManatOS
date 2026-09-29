(() => {
  'use strict';

  const ctx = window.ManatOS?.ctx;
  const surfaceRuntime = window.ManatOS?.entrySurfaces;
  if (!ctx || !surfaceRuntime?.register) return;

  const instances = new WeakMap();
  const instancesByPath = new Map();

  const install = (form) => {
    if (!(form instanceof HTMLFormElement)) return false;
    if (instances.has(form)) return true;

    const leafPath = () => {
      let node = ctx.value?.ui?.level;
      if (!node) return null;
      let path = 'ctx.ui.level';
      while (node?.level) {
        node = node.level;
        path += '.level';
      }
      return path;
    };

    const entryPath = form.dataset.ctxScopePath || leafPath();
    const surface = entryPath ? ctx.get(entryPath) : null;
    if (!entryPath || !surface || surface.control?.kind !== 'entry') return false;

    const owners = new Set(['entry-bootstrap']);
    let releaseUserInputBlock = window.ManatOS?.uiHost?.setUserInputBlocked?.(
      entryPath,
      'entry-initialization',
      true,
    );
    const remoteOwners = new Set();
    let remoteObserved = false;
    let busyOwned = false;
    let busyPaintPending = false;
    const remoteEndsAwaitingPaint = new Set();
    const minimumRemoteBusyVisibleMs = 160;
    let settled = false;
    let releasePaint;
    const painted = new Promise((resolve) => {
      releasePaint = resolve;
    });

    const publish = () => {
      const pendingOwners = [...owners];
      form.dataset.initializationOwners = pendingOwners.join(',');
      form.dataset.initializationRemoteObserved =
        pendingOwners.length && remoteObserved ? 'true' : 'false';
      form.classList.toggle('manatos-entry-initializing', pendingOwners.length > 0);
      form.dataset.initializationVisibility = pendingOwners.length ? 'pending' : 'ready';
      form.setAttribute('aria-busy', String(pendingOwners.length > 0));
      form.dispatchEvent(
        new CustomEvent('manatos:form-initialization-changed', {
          bubbles: true,
          detail: {
            owners: pendingOwners,
            pending: pendingOwners.length,
            phase: pendingOwners.length ? 'initializing' : 'settled',
            remotePending: remoteOwners.size,
            remoteObserved: pendingOwners.length ? remoteObserved : false,
          },
        }),
      );
      if (!pendingOwners.length && !settled) {
        settled = true;
        if (busyOwned) {
          window.ManatOS?.busy?.hide?.();
          busyOwned = false;
        }
        remoteOwners.clear();
        remoteObserved = false;
        form.dataset.initializationRemoteObserved = 'false';
        form.classList.remove('manatos-entry-initializing');
        form.dataset.initializationVisibility = 'ready';
        releaseUserInputBlock?.();
        releaseUserInputBlock = null;
        form.dispatchEvent(new Event('manatos:form-initialization-settled', { bubbles: true }));
        if (document.body.classList.contains('entry-popup-host') && parent !== window) {
          const token = form.querySelector('input[name="_entryToken"]')?.value || '';
          if (token) {
            parent.postMessage(
              { type: 'manatos:entry-popup-ready', token },
              window.location.origin,
            );
          }
        }
      }
    };

    const begin = (owner) => {
      if (!owner) return;
      owners.add(String(owner));
      settled = false;
      publish();
    };

    const end = (owner) => {
      owners.delete(String(owner));
      publish();
    };

    const beginRemote = (owner = 'remote-expression') => {
      if (!owners.size) return;
      const remoteOwner = `remote:${String(owner)}`;
      remoteObserved = true;
      if (!busyOwned) {
        const creating = surface.control.mode === 'create';
        window.ManatOS?.busy?.show?.({
          title: creating ? 'Initializing new entry…' : 'Initializing entry…',
          message: creating
            ? 'Please wait while the new entry UI is being prepared.'
            : 'Please wait while the entry UI is being prepared.',
          icon: 'bi-arrow-repeat',
        });
        busyOwned = true;
        busyPaintPending = true;

        // `show()` can be followed by a very fast localhost/API response before the
        // browser has painted even once. Keep any remote-owner release queued
        // through one actual painted frame so genuine remote initialization has a
        // visible busy affordance instead of being opened and closed off-screen.
        const busyShownAt = performance.now();
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const releaseAfterMinimumDwell = () => {
              busyPaintPending = false;
              for (const pendingOwner of remoteEndsAwaitingPaint) {
                remoteOwners.delete(pendingOwner);
                owners.delete(`remote:${pendingOwner}`);
              }
              remoteEndsAwaitingPaint.clear();
              publish();
            };
            const elapsed = performance.now() - busyShownAt;
            const remaining = Math.max(0, minimumRemoteBusyVisibleMs - elapsed);
            if (remaining > 0) {
              window.setTimeout(releaseAfterMinimumDwell, remaining);
            } else {
              releaseAfterMinimumDwell();
            }
          });
        });
      }
      remoteOwners.add(String(owner));
      // Remote capability work is itself an initialization owner. This guarantees
      // the surface stays locked and the spinner cannot settle before the remote
      // expression returns, even if the caller's broader owner finishes first.
      owners.add(remoteOwner);
      publish();
    };

    const endRemote = (owner = 'remote-expression') => {
      const ownerKey = String(owner);
      if (busyPaintPending) {
        remoteEndsAwaitingPaint.add(ownerKey);
        return;
      }
      const remoteOwner = `remote:${ownerKey}`;
      remoteOwners.delete(ownerKey);
      owners.delete(remoteOwner);
      publish();
    };

    const readyForWork = async () => painted;

    const instance = Object.freeze({
      entryPath,
      begin,
      end,
      beginRemote,
      endRemote,
      readyForWork,
      get pending() {
        return owners.size > 0;
      },
      get pendingOwners() {
        return Object.freeze([...owners]);
      },
    });
    instances.set(form, instance);
    instancesByPath.set(entryPath, instance);

    publish();

    // Fast/local initialization is released after the first paint boundary.
    // There is deliberately no artificial delay: only a real remote capability
    // reached during initialization opens the global busy overlay.
    requestAnimationFrame(() => {
      releasePaint?.();
      owners.delete('entry-bootstrap');
      publish();
    });

    return true;
  };

  const primary = () => {
    const form = document.querySelector('form[data-v2-entry-form]');
    return form instanceof HTMLFormElement ? instances.get(form) || null : null;
  };
  const facade = {
    forForm: (form) => (form instanceof HTMLFormElement ? instances.get(form) || null : null),
    forPath: (path) => instancesByPath.get(String(path || '')) || null,
    begin: (...args) => primary()?.begin(...args),
    end: (...args) => primary()?.end(...args),
    beginRemote: (...args) => primary()?.beginRemote(...args),
    endRemote: (...args) => primary()?.endRemote(...args),
    readyForWork: (...args) => primary()?.readyForWork(...args),
    get entryPath() {
      return primary()?.entryPath || null;
    },
    get pending() {
      return primary()?.pending === true;
    },
    get pendingOwners() {
      return primary()?.pendingOwners || Object.freeze([]);
    },
  };

  window.ManatOS.entryInitialization = Object.freeze(facade);
  surfaceRuntime.register('entry-initialization', install);
})();
