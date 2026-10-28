import { renderNativeComponent } from '../../native-template.js';
import type { UiEntryLayoutItem } from '@manatos/shared-ui';
/** Concrete native Summary renderer; no independent record state. */
export function renderEntryLayoutSummary(
  item: Extract<UiEntryLayoutItem, { kind: 'summary' }>,
): string {
  return renderNativeComponent('EntrySummary', { Id: item.layoutId, Span: item.span });
}
