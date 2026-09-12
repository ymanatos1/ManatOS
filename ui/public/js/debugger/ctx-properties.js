(() => {
  'use strict';

  window.ManatOS ||= {};
  window.ManatOS.debug ||= {};

  const setActiveTab = (panel, activeTab) => {
    panel?.querySelectorAll('[data-properties-tab]').forEach((button) => {
      const active = button.getAttribute('data-properties-tab') === activeTab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
  };

  const appendPropertyRow = (body, row, onNavigate) => {
    const element = document.createElement('div');
    element.className = 'ctx-debug-property-row';
    const label = document.createElement('span');
    label.className = 'ctx-debug-property-label';
    label.textContent = row.label;
    const value = document.createElement('span');
    value.className = 'ctx-debug-property-value';
    if (row.formula && typeof row.value === 'string' && window.ManatOS?.debug?.expression) {
      value.classList.add('ctx-debug-expression');
      window.ManatOS.debug.expression.highlightElement(value, row.value);
    } else {
      value.textContent = row.value ?? '';
    }
    if (row.linkPath) {
      value.classList.add('is-link');
      value.title = `Go to ${row.linkPath}`;
      value.addEventListener('click', () => onNavigate?.(row.linkPath));
    }
    element.append(label, value);
    body.appendChild(element);
  };

  const renderSubscribers = (body, summary) => {
    const displayCtxPath = (path) =>
      path === '*' ? '*' : window.ManatOS?.debug?.ctxPath?.display?.(path) || path;

    for (const [label, value] of [
      ['Total', String(summary?.total ?? 0)],
      ['Direct', String(summary?.direct ?? 0)],
      ['Dependent', String(summary?.dependent ?? 0)],
      ['Global', String(summary?.global ?? 0)],
    ]) {
      appendPropertyRow(body, { label, value });
    }

    const registrations = summary?.registrations ?? [];
    if (!registrations.length) {
      const empty = document.createElement('div');
      empty.className = 'ctx-debug-properties-empty';
      empty.textContent = 'No subscribers.';
      body.appendChild(empty);
      return;
    }

    const heading = document.createElement('div');
    heading.className = 'ctx-debug-subscriber-heading';
    heading.textContent = 'Registrations';
    body.appendChild(heading);
    const list = document.createElement('ul');
    list.className = 'ctx-debug-subscriber-list';
    for (const subscriber of registrations) {
      const item = document.createElement('li');
      const name = document.createElement('strong');
      name.textContent = subscriber.label || subscriber.kind;
      const kind = document.createElement('span');
      kind.className = 'ctx-debug-subscriber-kind';
      kind.textContent = ` [${subscriber.kind}${subscriber.match ? ` · ${subscriber.match}` : ''}]`;
      const paths = document.createElement('span');
      paths.className = 'ctx-debug-subscriber-paths';
      const rawPaths = subscriber.paths.join(', ');
      paths.textContent = ` ${subscriber.paths.map(displayCtxPath).join(', ')}`;
      paths.title = rawPaths;
      item.append(name, kind, paths);
      list.appendChild(item);
    }
    body.appendChild(list);
  };

  const render = ({ panel, body, activeTab = 'main', rows = [], subscribers, onNavigate }) => {
    if (!(body instanceof HTMLElement)) return;
    setActiveTab(panel, activeTab);
    body.replaceChildren();
    if (activeTab === 'subscribers') {
      renderSubscribers(body, subscribers);
      return;
    }
    for (const row of rows) appendPropertyRow(body, row, onNavigate);
  };

  window.ManatOS.debug.ctxProperties = Object.freeze({ render, setActiveTab });
})();
