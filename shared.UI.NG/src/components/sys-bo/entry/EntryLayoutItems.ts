/**
 * Entry item type/registration exports only. Each concrete renderer now lives
 * beside its matching HTML template, making ownership and breakpoints local.
 */
import type { UiEntryLayoutItem } from '@manatos/shared-ui';
export type EntryLayoutField = Extract<UiEntryLayoutItem, { kind: 'field' }>;
export type EntryLayoutDeferred = Extract<UiEntryLayoutItem, { kind: 'deferred' }>;
export type EntryLayoutGroup = Extract<
  UiEntryLayoutItem,
  { content: readonly UiEntryLayoutItem[] }
>;
export { EntryLayoutFieldComponent } from './EntryLayoutFieldComponent';
export { EntryLayoutDeferredComponent } from './EntryLayoutDeferredComponent';
export { EntryLayoutBreakComponent } from './EntryLayoutBreakComponent';
export { EntryLayoutSpacerComponent } from './EntryLayoutSpacerComponent';
export { EntryLayoutGroupComponent } from './EntryLayoutGroupComponent';
