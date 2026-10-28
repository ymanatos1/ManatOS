import {
  uiEntryTabs,
  uiEntrySummaryRows,
  uiEntryRelatedCollection,
  uiEntryRelatedViews,
  uiEntryRelatedListProjection,
  uiEntryRelatedViewActionColumn,
  createUiFieldBehavior,
  type UiEntryLevel,
} from '@manatos/shared-ui';
import { resolveMetadataText, type MetadataLanguage } from '@manatos/shared';
import { renderNativeComponent } from '../native-template.js';
import { renderListColumnsRow } from '../list/columns/ListColumnsRow.js';
import { renderListRow } from '../list/ListRow.js';

/** Native presentation only. The canonical rows live in the parent Entry #data. */
export function updateEntrySections(
  scope: HTMLElement,
  level: UiEntryLevel,
  entityKey: string,
  language: MetadataLanguage,
): void {
  const tabs = uiEntryTabs(entityKey, language, {
    mode: level.state.entry.mode,
    permissions: level.state.entry.permissions,
    record: level.data.current,
    viewKey: level.state.entry.uiViewKey,
  });
  for (const [index, tab] of tabs.entries()) {
    const panel = scope.querySelector<HTMLElement>(`[data-entry-tab-index="${index}"]`);
    if (!panel) continue;
    if (tab.layoutMode === 'summary') {
      const host = panel.querySelector<HTMLElement>('[data-entry-summary]');
      if (host) {
        const rows = uiEntrySummaryRows(
          entityKey,
          tab.fields,
          level.data.current,
          language,
          level.data.references,
          level.state.entry.uiViewKey,
        );
        host.replaceChildren();
        for (const row of rows) {
          const label = document.createElement('div');
          label.className = 'manatos-entry-summary-label';
          label.textContent = `${row.label}:`;
          const value = document.createElement('div');
          value.className = 'manatos-entry-summary-value';
          value.dataset['ctxFieldContainer'] = row.field;
          if (row.field === 'id') {
            const icon = document.createElement('i');
            icon.className = 'bi bi-fingerprint';
            icon.setAttribute('aria-hidden', 'true');
            value.append(icon);
            const code = document.createElement('code');
            code.className = 'manatos-entry-summary-id';
            code.title = row.text;
            code.textContent = row.text;
            value.append(code);
          } else {
            if (row.field === 'createdBy' || row.field === 'updatedBy') {
              const icon = document.createElement('i');
              icon.className = 'bi bi-person-circle';
              icon.setAttribute('aria-hidden', 'true');
              value.append(icon);
            }
            value.append(document.createTextNode(row.text));
          }
          host.append(label, value);
        }
      }
    }
    for (const host of panel.querySelectorAll<HTMLElement>('[data-entry-related]')) {
      const key = host.dataset['entryRelated'] ?? '';
      const collection = uiEntryRelatedCollection(entityKey, key, level.state.entry.uiViewKey);
      if (!collection) continue;
      const views = uiEntryRelatedViews(collection, language);
      const selected =
        level.data.relatedCollections?.[key]?.viewKey ??
        collection.relatedListView ??
        views[0]?.key;
      const view = views.find((candidate) => candidate.key === selected) ?? views[0];
      if (!view) continue;
      const resource = level.data.relatedCollections?.[key];
      host.replaceChildren();
      const header = document.createElement('header');
      header.className = 'manatos-entry-related-header';
      const icon = document.createElement('i');
      if (collection.icon) {
        icon.className = `bi bi-${collection.icon}`;
        icon.setAttribute('aria-hidden', 'true');
        header.append(icon);
      }
      const title = document.createElement('strong');
      title.textContent = resolveMetadataText(collection.label, language);
      header.append(title);
      const selector = document.createElement('div');
      selector.className = 'manatos-entry-related-views';
      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'manatos-list-btn';
      trigger.dataset['entryRelatedViewTrigger'] = key;
      trigger.setAttribute('aria-expanded', 'false');
      const triggerIcon = document.createElement('i');
      triggerIcon.className = 'bi bi-grid';
      triggerIcon.setAttribute('aria-hidden', 'true');
      trigger.append(
        triggerIcon,
        document.createTextNode(`${language === 'EL' ? 'Προβολή' : 'View'} (${view.label})`),
      );
      const menu = document.createElement('div');
      menu.className = 'manatos-entry-related-view-menu';
      menu.hidden = true;
      menu.setAttribute('role', 'group');
      for (const candidate of views) {
        const option = document.createElement('button');
        option.type = 'button';
        option.dataset['entryRelatedViewOption'] = candidate.key;
        option.dataset['entryRelatedKey'] = key;
        option.textContent = candidate.label;
        option.setAttribute('aria-pressed', String(candidate.key === view.key));
        menu.append(option);
      }
      selector.append(trigger, menu);
      header.append(selector);
      host.append(header);
      if (!resource || resource.loading || resource.error) {
        const message = document.createElement('p');
        message.className = 'manatos-entry-related-empty';
        message.textContent = resource?.error ?? (language === 'EL' ? 'Φόρτωση…' : 'Loading…');
        if (resource?.error) message.setAttribute('role', 'alert');
        host.append(message);
        continue;
      }
      const { columns, rows } = uiEntryRelatedListProjection(view, resource.rows);
      if (!rows.length) {
        const empty = document.createElement('p');
        empty.className = 'manatos-entry-related-empty';
        empty.textContent =
          language === 'EL' ? 'Δεν υπάρχουν σχετικές εγγραφές.' : 'No related entries.';
        host.append(empty);
        continue;
      }
      const entity = collection.relatedEntityKey ?? collection.entityKey;
      const displayColumns = [...columns, uiEntryRelatedViewActionColumn(language)];
      const behaviors = columns.map((column) => createUiFieldBehavior(entity, column.field));
      const references = { ...level.data.references, ...resource.references };
      const list = document.createElement('div');
      list.innerHTML = renderNativeComponent('List', {}, { Header: '', Pagination: '' });
      const root = list.firstElementChild;
      if (!(root instanceof HTMLElement)) throw new Error('Invalid List component template.');
      root.classList.add('manatos-list-embedded');
      if (view.layout === 'panel-list') root.classList.add('manatos-list-panel-layout');
      root.style.setProperty('--manatos-list-column-count', String(displayColumns.length));
      const heading = root.querySelector<HTMLElement>('[data-list-table-heading]');
      const body = root.querySelector<HTMLElement>('.manatos-list-rows');
      if (!heading || !body) throw new Error('List template missing its ColumnsRow or Row slot.');
      heading.innerHTML = renderListColumnsRow(displayColumns);
      body.innerHTML = rows
        .map((row, index) =>
          renderListRow(row, index, displayColumns, language, (i) => behaviors[i], references),
        )
        .join('');
      for (const [index, row] of rows.entries()) {
        if (typeof row['id'] !== 'string') continue;
        const node = body.querySelector<HTMLElement>(`[data-list-row-index="${index}"]`);
        if (node) {
          node.dataset['entryRelatedId'] = row['id'];
          node.dataset['entryRelatedKey'] = key;
        }
      }
      host.append(root);
    }
  }
}
