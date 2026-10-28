import { renderNativeComponent } from '../native-template.js';
import type { MetadataLanguage } from '@manatos/shared';
import {
  escapeFieldHtml,
  UI_ENTRY_RELATED_VIEW_ACTION_FIELD,
  type UiFieldBehavior,
  type UiFieldReferences,
} from '@manatos/shared-ui';
/** Behavior canonical field presentation. HTML is escaped inside each field class.
 * UIS ownership: one column value within a specific indexed row; the field formatter supplies the value markup. */
export function renderListCell(
  behavior: UiFieldBehavior | undefined,
  field: string,
  value: unknown,
  index: number,
  language: MetadataLanguage,
  row?: Readonly<Record<string, unknown>>,
  references?: UiFieldReferences,
): string {
  const html =
    field === UI_ENTRY_RELATED_VIEW_ACTION_FIELD
      ? `<button type="button" class="manatos-list-btn" data-entry-related-view-row>${language === 'EL' ? 'Προβολή' : 'View'}</button>`
      : (behavior?.formatHtml(value, language, row, references, behavior.isPrimaryField) ??
        escapeFieldHtml(value ?? '—'));
  return renderNativeComponent('ListCell', { Index: index }, { Value: html });
}
