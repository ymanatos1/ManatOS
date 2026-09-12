(() => {
  'use strict';

  /**
   * One debugger-only CTX path presentation contract.
   * Canonical runtime paths stay unchanged; this helper only renders the
   * compact developer notation used by the main CTX viewer and rooted views.
   */
  const aliases = [
    ['ctx.ui.level', '$level'],
    ['ctx.user', '$user'],
    ['ctx.company', '$company'],
    ['ctx.system', '$system'],
    ['ctx.entities', '$entities'],
    ['ctx.ui', '$ui'],
    ['ctx', '$'],
  ];

  const display = (path) => {
    const canonical = String(path || 'ctx');
    for (const [prefix, alias] of aliases) {
      if (canonical === prefix) return alias;
      if (canonical.startsWith(`${prefix}.`) || canonical.startsWith(`${prefix}[`))
        return `${alias}${canonical.slice(prefix.length)}`;
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
