import { renderNativeComponent } from '../native-template.js';
import type { UiEntryTab } from '@manatos/shared-ui';
import { renderEntryLayout } from './fields/FormField.js';

/** EJS adapter only; active-tab mutation is delegated to shared EntryRuntime.
 * UIS ownership: the canonical tab navigation and per-tab child mounts; tab visibility is recalculated from metadata and permissions. */
export function renderEntryTabs(tabs: readonly UiEntryTab[]): string {
  return renderNativeComponent(
    'EntryTabs',
    {},
    {
      Tabs: tabs
        .map((tab) =>
          renderNativeComponent('EntryTab', {
            Id: tab.id,
            Icon: tab.icon ?? 'info-circle',
            Label: tab.label,
          }),
        )
        .join(''),
    },
  );
}

/** Tabs owns the companion Panel child markup and metadata order. The host
 * decides when to re-mount on a changed tab signature; the child owns HOW its
 * tab and corresponding semantic Entry layout are expressed in native HTML.
 */
export function renderEntryPanels(
  tabs: readonly UiEntryTab[],
  entityKey: string,
  language: import('@manatos/shared').MetadataLanguage,
): string {
  return tabs
    .map((tab, index) =>
      renderNativeComponent(
        'EntryPanel',
        { Id: tab.id, Index: index },
        { Layout: renderEntryLayout(tab.layout, entityKey, language) },
      ),
    )
    .join('');
}

/** Project only tab selection/accessibility, without modifying canonical state. */
export function updateEntryTabs(
  element: HTMLElement,
  tabs: readonly UiEntryTab[],
  selected: string,
): void {
  for (const button of element.querySelectorAll<HTMLElement>('[data-entry-tab]')) {
    button.setAttribute('aria-selected', String(button.dataset['entryTab'] === selected));
  }
  for (const [index, tab] of tabs.entries()) {
    const section = element.querySelector<HTMLElement>(`[data-entry-tab-index="${index}"]`);
    if (section) section.hidden = tab.id !== selected;
  }
}

/** Tab-native selection intent; only EntryRuntime commits the active-tab state. */
export function selectEntryTab(target: Element, select: (id: string) => void): boolean {
  const tab = target.closest<HTMLElement>('[data-entry-tab]');
  if (!tab) return false;
  select(tab.dataset['entryTab'] ?? '');
  return true;
}
