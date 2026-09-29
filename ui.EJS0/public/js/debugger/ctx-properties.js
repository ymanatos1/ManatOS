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

  const renderNodeProperties = (body, properties) => {
    const entries = properties && typeof properties === 'object' ? Object.entries(properties) : [];
    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'ctx-debug-properties-empty';
      empty.textContent = 'No properties.';
      body.appendChild(empty);
      return;
    }
    for (const [key, value] of entries) {
      appendPropertyRow(body, { label: key, value: value === null ? 'null' : String(value) });
    }
  };

  const renderAttributes = (body, attributes) => {
    const values = Array.isArray(attributes) ? attributes : [];
    if (!values.length) {
      const empty = document.createElement('div');
      empty.className = 'ctx-debug-properties-empty';
      empty.textContent = 'No attributes.';
      body.appendChild(empty);
      return;
    }
    const list = document.createElement('ul');
    list.className = 'ctx-debug-attribute-list';
    for (const attribute of values) {
      const item = document.createElement('li');
      item.textContent = String(attribute);
      item.title = `CTX semantic attribute: ${String(attribute)}`;
      list.appendChild(item);
    }
    body.appendChild(list);
  };

  const renderSubscribers = (body, summary) => {
    const displayCtxPath = (path) =>
      path === '*' ? '*' : window.ManatOS?.debug?.ctxPath?.display?.(path) || path;

    const categories = Object.freeze([
      Object.freeze({
        key: 'direct',
        label: 'Direct',
        tooltip:
          'Exact-path registrations: the subscriber explicitly registered the currently selected CTX path.',
      }),
      Object.freeze({
        key: 'dependent',
        label: 'Dependents',
        tooltip:
          'Path-dependent registrations: a registered dependency path overlaps the selected CTX path, but is not an exact or global registration.',
      }),
      Object.freeze({
        key: 'global',
        label: 'Global',
        tooltip:
          'Global registrations: the subscriber registered * and therefore observes changes anywhere in CTX.',
      }),
    ]);

    const registrations = summary?.registrations ?? [];
    const byCategory = Object.fromEntries(
      categories.map((category) => [
        category.key,
        registrations.filter((subscriber) => subscriber.match === category.key),
      ]),
    );

    const preferred = body.dataset.ctxSubscriberTab;
    const activeCategory = categories.some((category) => category.key === preferred)
      ? preferred
      : categories.find((category) => byCategory[category.key].length)?.key || 'direct';
    body.dataset.ctxSubscriberTab = activeCategory;

    const tabs = document.createElement('div');
    tabs.className = 'ctx-debug-subscriber-tabs';
    tabs.setAttribute('role', 'tablist');

    const content = document.createElement('div');
    content.className = 'ctx-debug-subscriber-tab-content';

    const renderCategory = (categoryKey) => {
      body.dataset.ctxSubscriberTab = categoryKey;
      tabs.querySelectorAll('[data-subscriber-category]').forEach((button) => {
        const active = button.dataset.subscriberCategory === categoryKey;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-selected', String(active));
      });
      content.replaceChildren();

      const categoryRegistrations = byCategory[categoryKey] || [];
      if (!categoryRegistrations.length) {
        const empty = document.createElement('div');
        empty.className = 'ctx-debug-properties-empty';
        empty.textContent = 'No registrations in this category.';
        content.appendChild(empty);
        return;
      }

      const list = document.createElement('ul');
      list.className = 'ctx-debug-subscriber-list';
      for (const subscriber of categoryRegistrations) {
        const item = document.createElement('li');
        const name = document.createElement('strong');
        name.textContent = subscriber.label || subscriber.kind;
        const kind = document.createElement('span');
        kind.className = 'ctx-debug-subscriber-kind';
        kind.textContent = ` [${subscriber.kind}]`;
        const paths = document.createElement('span');
        paths.className = 'ctx-debug-subscriber-paths';
        const rawPaths = subscriber.paths.join(', ');
        paths.textContent = ` ${subscriber.paths.map(displayCtxPath).join(', ')}`;
        item.title = [
          `Subscriber: ${subscriber.label || subscriber.kind}`,
          `Kind: ${subscriber.kind}`,
          `Registration: ${subscriber.match}`,
          `Path${subscriber.paths.length === 1 ? '' : 's'}: ${rawPaths}`,
        ].join('\n');
        item.append(name, kind, paths);
        list.appendChild(item);
      }
      content.appendChild(list);
    };

    for (const category of categories) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ctx-debug-subscriber-tab';
      button.classList.toggle('has-registrations', byCategory[category.key].length > 0);
      button.dataset.subscriberCategory = category.key;
      button.setAttribute('role', 'tab');
      button.title = category.tooltip;
      const count = byCategory[category.key].length;
      button.textContent = count > 0 ? `${category.label} (${count})` : category.label;
      button.addEventListener('click', () => renderCategory(category.key));
      tabs.appendChild(button);
    }

    body.append(tabs, content);
    renderCategory(activeCategory);
  };

  const render = ({
    panel,
    body,
    activeTab = 'main',
    rows = [],
    properties = {},
    attributes = [],
    subscribers,
    onNavigate,
  }) => {
    if (!(body instanceof HTMLElement)) return;
    setActiveTab(panel, activeTab);
    body.replaceChildren();
    if (activeTab === 'properties') {
      renderNodeProperties(body, properties);
      return;
    }
    if (activeTab === 'attributes') {
      renderAttributes(body, attributes);
      return;
    }
    if (activeTab === 'subscribers') {
      renderSubscribers(body, subscribers);
      return;
    }
    for (const row of rows) appendPropertyRow(body, row, onNavigate);
  };

  window.ManatOS.debug.ctxProperties = Object.freeze({ render, setActiveTab });
})();
