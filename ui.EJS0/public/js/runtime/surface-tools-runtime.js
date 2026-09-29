(() => {
  'use strict';

  const providers = new Map();
  const mounted = new WeakMap();

  const normalizeModel = (model) => {
    if (!model || typeof model !== 'object') return null;
    const groups = Array.isArray(model.groups)
      ? model.groups
          .map((group) => ({
            key: String(group?.key || '').trim(),
            label: String(group?.label || '').trim(),
            items: Array.isArray(group?.items)
              ? group.items
                  .map((item) => ({
                    key: String(item?.key || '').trim(),
                    label: String(item?.label || '').trim(),
                    detail: String(item?.detail || '').trim(),
                    selected: item?.selected === true,
                    enabled: item?.enabled !== false,
                    title: String(item?.title || '').trim(),
                  }))
                  .filter((item) => item.key && item.label)
              : [],
          }))
          .filter((group) => group.key && group.label && group.items.length)
      : [];
    return groups.length ? { groups } : null;
  };

  const menu = (model, invoke, direction = 'end') => {
    const root = document.createElement('div');
    root.className = 'dropdown';
    root.dataset.surfaceToolsMenu = '';
    const button = document.createElement('button');
    button.className = 'btn btn-sm btn-outline-secondary';
    button.type = 'button';
    button.dataset.bsToggle = 'dropdown';
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', 'Surface tools');
    button.title = 'Tools';
    button.innerHTML = '<i class="bi bi-tools" aria-hidden="true"></i>';
    root.append(button);

    const outer = document.createElement('ul');
    outer.className = `dropdown-menu dropdown-menu-${direction} ui-view-tools-menu`;
    for (const group of model.groups) {
      const li = document.createElement('li');
      li.className = 'dropdown-submenu ui-view-tools-submenu';
      const toggle = document.createElement('button');
      toggle.className = 'dropdown-item dropdown-toggle';
      toggle.type = 'button';
      toggle.setAttribute('aria-haspopup', 'true');
      toggle.innerHTML = `${group.label} <i class="bi bi-chevron-${direction === 'end' ? 'left' : 'right'} ms-auto" aria-hidden="true"></i>`;
      li.append(toggle);
      const inner = document.createElement('ul');
      inner.className = `ui-view-tools-view-menu${direction === 'start' ? ' ui-view-tools-view-menu-end' : ''}`;
      for (const item of group.items) {
        const itemLi = document.createElement('li');
        const action = document.createElement('button');
        action.className = 'dropdown-item d-flex align-items-center';
        action.type = 'button';
        action.dataset.surfaceToolGroup = group.key;
        action.dataset.surfaceToolKey = item.key;
        action.disabled = !item.enabled;
        if (item.title) action.title = item.title;
        const check = document.createElement('i');
        check.className = `bi bi-check-lg me-2${item.selected ? '' : ' invisible'}`;
        check.setAttribute('aria-hidden', 'true');
        action.append(check, document.createTextNode(item.label));
        if (item.detail) {
          const detail = document.createElement('span');
          detail.className = 'text-body-secondary ms-2 small';
          detail.textContent = item.detail;
          action.append(detail);
        }
        action.addEventListener('click', () => invoke(group.key, item.key));
        itemLi.append(action);
        inner.append(itemLi);
      }
      li.append(inner);
      outer.append(li);
    }
    root.append(outer);
    return root;
  };

  const surfaceContext = (anchor) => {
    const localForm = anchor.closest?.('form[data-v2-entry-form]');
    const explicitPath =
      anchor.dataset.surfaceToolsCtxPath || localForm?.dataset?.ctxScopePath || '';
    let path = explicitPath;
    if (!path) {
      let level = window.ManatOS?.ctx?.value?.ui?.level;
      if (level) {
        path = 'ctx.ui.level';
        while (level?.level) {
          level = level.level;
          path += '.level';
        }
      }
    }
    const surface = path ? window.ManatOS?.ctx?.get?.(path) : null;
    return Object.freeze({ path, surface });
  };

  const resolve = (anchor) => {
    const context = surfaceContext(anchor);
    for (const provider of providers.values()) {
      const result = provider.resolve?.(anchor, context);
      if (result) return { provider, result: { ...result, context } };
    }
    return null;
  };

  const render = (anchor) => {
    if (!(anchor instanceof HTMLElement)) return false;
    const resolved = resolve(anchor);
    const model = normalizeModel(resolved?.result?.model);
    anchor.replaceChildren();
    if (!resolved || !model) {
      mounted.delete(anchor);
      anchor.hidden = true;
      return false;
    }
    anchor.hidden = false;
    const direction = resolved.result.direction === 'start' ? 'start' : 'end';
    anchor.append(
      menu(
        model,
        (group, key) => resolved.provider.invoke?.(resolved.result, group, key),
        direction,
      ),
    );
    mounted.set(anchor, resolved);
    return true;
  };

  const refresh = (root = document) => {
    if (root instanceof HTMLElement && root.matches('[data-surface-tools-anchor]')) render(root);
    root.querySelectorAll?.('[data-surface-tools-anchor]').forEach(render);
  };

  const register = (key, provider) => {
    const name = String(key || '').trim();
    if (!name || !provider?.resolve)
      throw new Error('Surface tools provider requires a key and resolver.');
    providers.set(name, provider);
    refresh();
    return () => providers.delete(name);
  };

  window.ManatOS = window.ManatOS || {};
  window.ManatOS.surfaceTools = Object.freeze({ register, refresh, render });

  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) if (node instanceof Element) refresh(node);
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
