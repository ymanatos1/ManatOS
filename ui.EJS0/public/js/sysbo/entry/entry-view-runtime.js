(() => {
  'use strict';

  const surfaceRuntime = window.ManatOS?.entrySurfaces;
  const ctx = window.ManatOS?.ctx;
  if (!surfaceRuntime?.register || !ctx) return;

  const tabMemory = new Map();
  const memoryFor = (path) => {
    let memory = tabMemory.get(path);
    if (!memory) {
      memory = new Map();
      tabMemory.set(path, memory);
    }
    return memory;
  };

  const activeTab = (form) =>
    form.querySelector('.entity-tabs [data-v2-tab-id].active')?.dataset?.v2TabId || null;

  const removePageTools = () => document.querySelector('[data-entry-page-view-tools]')?.remove();

  const copyToolsDescriptor = (source, target) => {
    target.dataset.surfaceToolsAnchor = '';
    target.dataset.surfaceToolsKind = 'entry';
    target.dataset.surfaceToolsDirection = 'end';
    target.dataset.entryUiViewKey = source.dataset.entryUiViewKey || '';
    target.dataset.entryUiViewCatalog = source.dataset.entryUiViewCatalog || '[]';
    const form = source.closest('form[data-v2-entry-form]');
    if (form?.dataset?.ctxScopePath) target.dataset.surfaceToolsCtxPath = form.dataset.ctxScopePath;
  };

  const syncPageTools = (form) => {
    removePageTools();
    if (
      form.querySelector(':scope > div:not([data-entry-view-tools-caption-source]) > .entity-tabs')
    ) {
      window.ManatOS?.surfaceTools?.refresh?.(form);
      return;
    }
    const source = form.querySelector(
      '[data-entry-view-tools-caption-source] [data-surface-tools-anchor][data-surface-tools-kind="entry"]',
    );
    const titlebar = document.querySelector('.workspace-titlebar');
    if (!(source instanceof HTMLElement) || !(titlebar instanceof HTMLElement)) return;
    const tools = document.createElement('div');
    tools.dataset.entryPageViewTools = '';
    copyToolsDescriptor(source, tools);
    titlebar.append(tools);
    window.ManatOS?.surfaceTools?.render?.(tools);
  };

  const layoutTabs = (surface) => {
    const regions = Array.isArray(surface?.layout?.regions) ? surface.layout.regions : [];
    const tabs = regions.find((region) => region?.role === 'tabs' || region?.key === 'tabs');
    return Array.isArray(tabs?.children) ? tabs.children.filter((tab) => tab?.kind === 'tab') : [];
  };

  const reconcileTabs = (form, surface, requestedTab = null) => {
    const tabs = layoutTabs(surface);
    if (!tabs.length) return;
    const ids = new Set(tabs.map((tab) => String(tab.key || '')));
    const nav = form.querySelector('.entity-tabs');
    const content = form.querySelector('.entity-tab-content');
    if (!(nav instanceof HTMLElement) || !(content instanceof HTMLElement)) return;

    for (const button of nav.querySelectorAll('[data-v2-tab-id]')) {
      const id = button.dataset.v2TabId || '';
      const item = button.closest('.nav-item');
      if (item instanceof HTMLElement && id !== 'debugging') item.hidden = !ids.has(id);
    }
    for (const pane of content.querySelectorAll(':scope > .tab-pane')) {
      if (!(pane instanceof HTMLElement) || pane.matches('[data-v2-developer-debugging-pane]'))
        continue;
      const labelledBy = pane.getAttribute('aria-labelledby');
      const id = labelledBy
        ? form.querySelector(`#${CSS.escape(labelledBy)}`)?.dataset?.v2TabId
        : [...nav.querySelectorAll('[data-v2-tab-id]')].find(
            (button) => button.getAttribute('data-bs-target') === `#${pane.id}`,
          )?.dataset?.v2TabId;
      if (id) pane.hidden = !ids.has(id);
    }

    const targetId = ids.has(requestedTab) ? requestedTab : String(tabs[0]?.key || '');
    const target = [...nav.querySelectorAll('[data-v2-tab-id]')].find(
      (button) => button.dataset.v2TabId === targetId && !button.closest('.nav-item')?.hidden,
    );
    if (target instanceof HTMLButtonElement) target.click();
  };

  const activateMaterializedScripts = (host) => {
    for (const inertScript of [...host.querySelectorAll('script')]) {
      const script = document.createElement('script');
      for (const attribute of [...inertScript.attributes]) {
        script.setAttribute(attribute.name, attribute.value);
      }
      script.textContent = inertScript.textContent;
      inertScript.replaceWith(script);
    }
  };

  const rematerializationUrl = (form, viewKey, path) => {
    const source = String(form.dataset.entryMaterializeUrl || window.location.href || '').trim();
    if (!source) return null;
    const url = new URL(source, window.location.origin);
    url.searchParams.set('_entryDirectHost', '1');
    url.searchParams.set('_entryCtxPath', path);
    url.searchParams.set('_entryUIView', viewKey);
    return url;
  };

  const rematerialize = async (form, viewKey, path) => {
    const url = rematerializationUrl(form, viewKey, path);
    if (!url) throw new Error('Entry UI-view rematerialization URL is unavailable.');
    const response = await fetch(url, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.success !== true || !payload?.data?.html) {
      throw new Error(
        payload?.error?.message ||
          `Entry UI-view rematerialization failed (HTTP ${response.status}).`,
      );
    }

    const template = document.createElement('template');
    template.innerHTML = String(payload.data.html).trim();
    const nextForm = template.content.querySelector('form[data-v2-entry-form]');
    if (!(nextForm instanceof HTMLFormElement)) {
      throw new Error('Rematerialized entry markup did not contain an Entry form.');
    }
    if (nextForm.dataset.ctxScopePath !== path) {
      throw new Error('Rematerialized entry markup belongs to a different CTX owner.');
    }

    // Semantic state/view ownership has already changed in typed runtime. This event
    // disposes only browser adapters bound to the old physical materialization.
    form.dispatchEvent(new CustomEvent('manatos:entry-view-disposing'));
    nextForm.dataset.entryMaterializeUrl = String(form.dataset.entryMaterializeUrl || '');
    form.replaceWith(nextForm);
    activateMaterializedScripts(nextForm);
    surfaceRuntime.scan(nextForm);
    return nextForm;
  };

  const refreshViewActions = (form, key) => {
    const hidden = form.querySelector('input[name="_entryUIView"]');
    if (hidden instanceof HTMLInputElement) hidden.value = key;
    form.dataset.uiViewKey = key;
    for (const anchor of form.querySelectorAll(
      '[data-surface-tools-anchor][data-surface-tools-kind="entry"]',
    )) {
      if (!(anchor instanceof HTMLElement)) continue;
      anchor.dataset.entryUiViewKey = key;
      window.ManatOS?.surfaceTools?.render?.(anchor);
    }
  };

  const install = (form) => {
    if (!(form instanceof HTMLFormElement)) return false;
    // The form carries the canonical UiLevel path emitted by the entry renderer.
    // Keep the PAGE framing root on that exact owner instead of relying on EJS
    // fallback depth guesses (notably Account, whose entry is the root page level).
    const pageComponent = form.closest('[data-entry-page-component]');
    if (pageComponent instanceof HTMLElement && form.dataset.ctxScopePath) {
      pageComponent.dataset.ctxScopePath = form.dataset.ctxScopePath;
    }

    /*
     * DOM ownership is part of the physical surface contract.  Initial PAGE · ENTRY
     * materialization can run before the typed UiRuntime has finished adopting and
     * activating the bootstrap UiLevel.  Publish the same idempotent surface-ready
     * signal used by later popup materialization only after the browser has had a
     * frame to complete that startup boundary.  Consumers (notably the CTX debugger)
     * can then reconcile canonical CTX ownership with the final stamped DOM without
     * depending on a one-shot form-state event or on opening a popup first.
     */
    requestAnimationFrame(() => {
      window.dispatchEvent(
        new CustomEvent('manatos:ui-surface-rendered', {
          detail: { path: form.dataset.ctxScopePath || null },
        }),
      );
    });

    syncPageTools(form);

    form.addEventListener('shown.bs.tab', (event) => {
      const tab = event.target instanceof HTMLElement ? event.target.dataset.v2TabId : null;
      const key = form.querySelector('input[name="_entryUIView"]')?.value || '';
      const path = form.dataset.ctxScopePath || '';
      if (tab && key && path) memoryFor(path).set(key, tab);
    });

    const switchView = async (key) => {
      key = String(key || '').trim();
      if (!key) return;
      const currentKey = form.querySelector('input[name="_entryUIView"]')?.value || '';
      if (key === currentKey) return;
      const path = form.dataset.ctxScopePath || '';
      const surface = path ? ctx.get?.(path) : null;
      if (!surface || surface.control?.kind !== 'entry') return;

      const selectedTab = activeTab(form);
      if (selectedTab && currentKey) memoryFor(path).set(currentKey, selectedTab);
      try {
        const switched = window.ManatOS?.uiHostV2?.switchEntryView?.({ path, viewKey: key });
        if (!switched) throw new Error('Typed UI-view switch authority is unavailable.');
        const updated = ctx.get(path);
        refreshViewActions(form, switched.viewKey);
        const nextForm = await rematerialize(form, switched.viewKey, path);
        reconcileTabs(nextForm, updated, memoryFor(path).get(switched.viewKey) || selectedTab);
        syncPageTools(nextForm);
        window.dispatchEvent(
          new CustomEvent('manatos:entry-view-rematerialized', {
            detail: { form: nextForm, previousForm: form, viewKey: switched.viewKey },
          }),
        );
      } catch (error) {
        // Keep semantic and physical presentation generations aligned if the
        // browser materialization request fails after the typed switch.
        if (currentKey) {
          try {
            window.ManatOS?.uiHostV2?.switchEntryView?.({ path, viewKey: currentKey });
          } catch (rollbackError) {
            console.error('[ManatOS] Entry UI view rollback failed.', rollbackError);
          }
        }
        console.error('[ManatOS] Entry UI view switch failed.', error);
      }
    };
    form.addEventListener('manatos:entry-ui-view-request', (event) => {
      if (!(event instanceof CustomEvent)) return;
      void switchView(event.detail?.viewKey);
    });
    return true;
  };

  window.ManatOS?.surfaceTools?.register?.('entry-ui-view', {
    resolve(anchor, context) {
      if (
        !(anchor instanceof HTMLElement) ||
        anchor.dataset.surfaceToolsKind !== 'entry' ||
        context?.surface?.control?.kind !== 'entry'
      )
        return null;
      let catalog = [];
      try {
        catalog = JSON.parse(anchor.dataset.entryUiViewCatalog || '[]');
      } catch {
        catalog = [];
      }
      const current = anchor.dataset.entryUiViewKey || '';
      const currentView = catalog.find((view) => view?.key === current);
      return {
        direction: anchor.dataset.surfaceToolsDirection,
        anchor,
        model: {
          groups: [
            {
              key: 'view',
              label: 'View',
              items: catalog.map((view) => {
                const compatible = Boolean(currentView) && view?.readOnly === currentView.readOnly;
                return {
                  key: String(view?.key || ''),
                  label: String(view?.label || view?.key || ''),
                  detail: String(view?.viewType || ''),
                  selected: view?.key === current,
                  enabled: compatible && view?.key !== current,
                  title: compatible ? '' : 'Different read-only view type',
                };
              }),
            },
          ],
        },
      };
    },
    invoke(result, group, key) {
      if (group !== 'view') return;
      const anchor = result?.anchor;
      const localForm = anchor?.closest?.('form[data-v2-entry-form]');
      const path = anchor?.dataset?.surfaceToolsCtxPath || '';
      const targetForm =
        localForm instanceof HTMLFormElement
          ? localForm
          : [...document.querySelectorAll('form[data-v2-entry-form]')].find(
              (candidate) =>
                candidate instanceof HTMLFormElement && candidate.dataset.ctxScopePath === path,
            );
      if (!(targetForm instanceof HTMLFormElement)) return;
      targetForm.dispatchEvent(
        new CustomEvent('manatos:entry-ui-view-request', { detail: { viewKey: key } }),
      );
    },
  });

  window.addEventListener('pagehide', () => {
    tabMemory.clear();
    removePageTools();
  });

  surfaceRuntime.register('entry-view', install);
})();
