(() => {
  'use strict';

  /**
   * One debugger-only CTX path presentation contract.
   * Canonical runtime paths stay unchanged; this helper only renders the
   * compact developer notation used by the main CTX viewer and rooted views.
   *
   * `$level` has the same meaning here as it has in expression resolution: the
   * deepest active UI level. Parent/bootstrap levels therefore remain visibly
   * rooted under `$ui.level` instead of being mislabeled as the active level.
   */
  const staticAliases = [
    ['ctx.user', '$user'],
    ['ctx.company', '$company'],
    ['ctx.system', '$system'],
    ['ctx.entities', '$entities'],
    ['ctx.ui', '$ui'],
    ['ctx', '$'],
  ];

  const activeLevelPath = () => {
    let level = window.ManatOS?.ctx?.value?.ui?.level;
    if (!level || typeof level !== 'object' || Array.isArray(level)) return null;
    let path = 'ctx.ui.level';
    while (level?.level && typeof level.level === 'object' && !Array.isArray(level.level)) {
      level = level.level;
      path += '.level';
    }
    return path;
  };

  const aliasPath = (canonical, prefix, alias) => {
    if (canonical === prefix) return alias;
    if (canonical.startsWith(`${prefix}.`) || canonical.startsWith(`${prefix}[`))
      return `${alias}${canonical.slice(prefix.length)}`;
    return null;
  };

  const display = (path) => {
    const canonical = String(path || 'ctx');
    const levelPath = activeLevelPath();
    if (levelPath) {
      const active = aliasPath(canonical, levelPath, '$level');
      if (active) return active;
    }
    for (const [prefix, alias] of staticAliases) {
      const shown = aliasPath(canonical, prefix, alias);
      if (shown) return shown;
    }
    return canonical;
  };

  const nameFromDisplayPath = (path) => {
    const semantic = path.match(/\[(?:"([^"]+)"|'([^']+)')\]$/);
    if (semantic) return semantic[1] || semantic[2];
    const indexed = path.match(/\[(\d+)\]$/);
    if (indexed) return `[${indexed[1]}]`;
    if (!path.includes('.') && path.startsWith('$')) return path;
    return path.split('.').at(-1) || path;
  };

  const parts = (path) => {
    const shown = display(path);
    const name = nameFromDisplayPath(shown);
    return {
      text: shown,
      prefix: shown.slice(0, Math.max(0, shown.length - name.length)),
      name,
    };
  };

  const render = (element, path) => {
    if (!(element instanceof Element)) return;
    const shown = parts(path);
    const strong = document.createElement('strong');
    strong.textContent = shown.name;
    element.replaceChildren(document.createTextNode(shown.prefix), strong);
    element.title = shown.text;
  };

  window.ManatOS ||= {};
  window.ManatOS.debug ||= {};
  window.ManatOS.debug.ctxPath = Object.freeze({ display, parts, render });
})();
