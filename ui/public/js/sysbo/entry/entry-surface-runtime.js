(() => {
  'use strict';

  window.ManatOS = window.ManatOS || {};

  const installers = new Map();
  const installed = new WeakMap();

  const entryForms = (root = document) => {
    const forms = [];
    if (root instanceof HTMLFormElement && root.matches('form[data-v2-entry-form]'))
      forms.push(root);
    if (typeof root?.querySelectorAll === 'function') {
      root.querySelectorAll('form[data-v2-entry-form]').forEach((form) => {
        if (form instanceof HTMLFormElement) forms.push(form);
      });
    }
    return forms;
  };

  const installForm = (form) => {
    if (!(form instanceof HTMLFormElement)) return;
    let names = installed.get(form);
    if (!names) {
      names = new Set();
      installed.set(form, names);
    }
    for (const [name, installer] of installers) {
      if (names.has(name)) continue;
      const result = installer(form);
      if (result !== false) names.add(name);
    }
  };

  const scan = (root = document) => entryForms(root).forEach(installForm);

  const register = (name, installer) => {
    const key = String(name || '').trim();
    if (!key || typeof installer !== 'function')
      throw new TypeError('Entry surface runtime registration requires a name and installer.');
    if (installers.has(key))
      throw new Error(`Entry surface runtime '${key}' is already registered.`);
    installers.set(key, installer);
    scan(document);
  };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof Element) scan(node);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.ManatOS.entrySurfaces = Object.freeze({ register, scan, installForm });
})();
