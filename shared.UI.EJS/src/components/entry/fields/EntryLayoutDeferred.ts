import { renderNativeComponent } from '../../native-template.js';
import type { UiEntryLayoutItem } from '@manatos/shared-ui';
import type { MetadataLanguage } from '@manatos/shared';
import { entryLayoutSpan } from './FormField.js';
/** Deferred entry content owns the unresolved-reference placeholder and its
 * localized text. It must not invent another entry-state owner or silently
 * mount an unsupported editor. Debug here when a deferred item is shown. */
export function renderEntryLayoutDeferred(
  item: UiEntryLayoutItem,
  _entityKey: string,
  language: MetadataLanguage,
): string {
  if (!('reference' in item)) throw new Error('Invalid deferred layout declaration.');
  return renderNativeComponent('EntryDeferred', {
    Id: item.layoutId,
    Span: entryLayoutSpan(item.span),
    Reference: item.reference,
    Message: language === 'EL' ? 'Δεν έχει μεταφερθεί ακόμη' : 'Not yet available in this editor',
  });
}
