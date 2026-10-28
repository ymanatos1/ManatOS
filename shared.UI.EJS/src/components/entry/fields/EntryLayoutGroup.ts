import { renderNativeComponent } from '../../native-template.js';
import type { UiEntryLayoutItem } from '@manatos/shared-ui';
import type { MetadataLanguage } from '@manatos/shared';
import { renderEntryLayout, entryLayoutSpan } from './FormField.js';
/** Column/inline groups own ordered child composition and the concrete group
 * template. Recursive rendering uses the same registered layout renderer map;
 * do not rebuild children in EntryPageHost. Debug the Content slot here. */
export function renderEntryLayoutGroup(
  item: UiEntryLayoutItem,
  entityKey: string,
  language: MetadataLanguage,
): string {
  if (!('content' in item)) throw new Error('Invalid Entry layout group declaration.');
  return renderNativeComponent(
    'EntryGroup',
    { Id: item.layoutId, Span: entryLayoutSpan(item.span) },
    {
      Content: renderEntryLayout(item.content, entityKey, language),
    },
  );
}
