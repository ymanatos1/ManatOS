import {
  multilingual,
  localizedChangeReport,
  type UiChangeDetail,
  type UiChangeNode,
  type UiChangeReport,
} from '@manatos/shared-ui';

const validIcon = (icon: string | undefined): string =>
  icon && /^[a-z0-9-]+$/.test(icon) ? icon : 'dot';

/** DOM-only recursive report view; all record values are textContent, never HTML. */
export function renderHierarchicalReport(
  host: HTMLElement,
  report: UiChangeReport,
  language: 'EN' | 'EL',
  preservedExpansion: ReadonlyMap<string, boolean> = new Map(),
): void {
  report = localizedChangeReport(report, language);
  const doc = host.ownerDocument;
  const tr = (value: string) => multilingual(language, []).resolve(`@CM.${value}`);
  const make = (tag: string, className = '', text?: string): HTMLElement => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  host.dataset.popupLayoutId = 'change-report-tree';
  const frame = make('div', 'ejs-change-report-frame');
  const toolbar = make('div', 'ejs-change-report-toolbar');
  toolbar.append(make('span', 'ejs-change-report-summary', report.summary));
  const tree = make('div', 'ejs-change-report-tree');
  tree.setAttribute('role', 'group');
  const toggleAll = (expanded: boolean): void => {
    for (const details of tree.querySelectorAll<HTMLDetailsElement>('details'))
      details.open = expanded;
  };
  for (const [key, expanded] of [
    ['ChangesExpandAll', true],
    ['ChangesCollapseAll', false],
  ] as const) {
    const button = make('button', '', tr(key)) as HTMLButtonElement;
    button.type = 'button';
    button.addEventListener('click', () => toggleAll(expanded));
    toolbar.append(button);
  }
  frame.append(toolbar, tree);
  host.append(frame);
  const writeValue = (slot: HTMLElement, value: NonNullable<UiChangeDetail['from']>): void => {
    if (
      value.imageUrl &&
      (/^https:\/\/[^\s<>"']+$/i.test(value.imageUrl) ||
        /^\/(?!\/)[^\s<>"']+$/.test(value.imageUrl))
    ) {
      const img = doc.createElement('img');
      img.src = value.imageUrl;
      img.alt = '';
      slot.append(img);
    }
    if (value.icon) {
      const icon = make('i', `bi bi-${validIcon(value.icon)}`);
      icon.setAttribute('aria-hidden', 'true');
      slot.append(icon);
    }
    slot.append(doc.createTextNode(value.label));
  };
  const appendNode = (parent: HTMLElement, node: UiChangeNode, parentPath = ''): void => {
    const path = `${parentPath}/${node.id}`;
    const group = doc.createElement('details');
    group.className = 'ejs-change-report-node';
    group.dataset.changeNodePath = path;
    group.open = preservedExpansion.get(path) ?? node.expanded === true;
    const caption = doc.createElement('summary');
    const icon = make('i', `bi bi-${validIcon(node.icon)}`);
    icon.setAttribute('aria-hidden', 'true');
    caption.append(icon, doc.createTextNode(` ${node.label}`));
    if (node.status) caption.append(make('span', 'ejs-change-report-status', node.status));
    if (node.count !== undefined)
      caption.append(make('span', 'ejs-change-report-count', String(node.count)));
    group.append(caption);
    const content = make('div', 'ejs-change-report-children');
    for (const detail of node.details ?? []) {
      const row = make('div', 'ejs-change-report-detail');
      row.append(make('span', 'ejs-change-report-label', detail.label));
      if (detail.from) {
        const from = make(
          'span',
          `ejs-change-report-value${detail.from.tone === 'success' ? ' ejs-change-report-success' : detail.from.tone === 'danger' ? ' ejs-change-report-danger' : ''}`,
        );
        writeValue(from, detail.from);
        row.append(from, make('i', 'bi bi-arrow-right'));
      }
      const after = detail.to ?? detail.value;
      if (after) {
        const to = make(
          'span',
          `ejs-change-report-value${after.tone === 'success' ? ' ejs-change-report-success' : after.tone === 'danger' ? ' ejs-change-report-danger' : ''}`,
        );
        writeValue(to, after);
        row.append(to);
      }
      content.append(row);
    }
    for (const child of node.children ?? []) appendNode(content, child, path);
    group.append(content);
    parent.append(group);
  };
  for (const node of report.nodes) appendNode(tree, node);
}
