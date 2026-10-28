import { renderNativeComponent } from '../../native-template.js';
import type { UiEntryLayoutItem } from '@manatos/shared-ui';
/** Concrete native collection renderer; selection and data remain owned by Entry. */
export function renderEntryLayoutCollection(
  item: Extract<UiEntryLayoutItem, { kind: 'collection' }>,
): string {
  return renderNativeComponent('EntryRelatedCollection', {
    Id: item.layoutId,
    Span: item.span,
    Reference: item.reference,
  });
}
