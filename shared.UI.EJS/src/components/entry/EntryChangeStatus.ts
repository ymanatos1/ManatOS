import { renderNativeComponent } from '../native-template.js';
import { multilingual } from '@manatos/shared-ui';
import type { MetadataLanguage } from '@manatos/shared';

/** Shared BO Entry status semantics with Angular; no independent dirty calculation. */
export function renderEntryChangeStatus(): string {
  return renderNativeComponent('EntryChangeStatus');
}
export function updateEntryChangeStatus(
  host: HTMLElement,
  dirty: boolean,
  language: MetadataLanguage,
): void {
  const control = host.querySelector<HTMLButtonElement>('[data-entry-review-changes]');
  if (!control) return;
  control.disabled = !dirty;
  const text = multilingual(language, []).resolve(dirty ? '@CM.UnsavedChanges' : '@CM.NoChanges');
  control.setAttribute('aria-label', text);
  const label = control.querySelector<HTMLElement>('[data-entry-change-label]');
  if (label) label.textContent = text;
  const icon = control.querySelector<HTMLElement>('i');
  if (icon) icon.className = `bi ${dirty ? 'bi-pencil-square' : 'bi-check-circle'}`;
}
