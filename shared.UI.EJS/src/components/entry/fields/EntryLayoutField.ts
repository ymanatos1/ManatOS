import { renderNativeComponent } from '../../native-template.js';
import { uiEntryFieldPresentation, type UiEntryLayoutItem } from '@manatos/shared-ui';
import type { MetadataLanguage } from '@manatos/shared';
import { renderFormField, entryLayoutSpan } from './FormField.js';
/** A Field layout item owns the FormField child slot. It resolves the canonical
 * field presentation, not its native typed control. Debug here when a Field
 * is missing; typed controls and Tools must remain child-owned. */
export function renderEntryLayoutField(
  item: UiEntryLayoutItem,
  entityKey: string,
  language: MetadataLanguage,
): string {
  if (!('field' in item)) throw new Error('Invalid Entry Field declaration.');
  const model = uiEntryFieldPresentation(entityKey, item.field, null, language, item.label);
  if (model && item.representation && item.representation !== 'default') {
    // The shared projection supplies data and semantics on each paint.
    const fieldName = item.field.replace(/[^a-zA-Z0-9]/g, '');
    const representation = item.representation.replace(/[^a-z-]/g, '');
    const layoutId = item.layoutId.replace(/[^a-zA-Z0-9-]/g, '');
    const related = (item.relatedFields ?? []).filter((name) =>
      /^[a-zA-Z][a-zA-Z0-9]*$/.test(name),
    );
    return renderNativeComponent(
      'EntryLayoutField',
      { Span: entryLayoutSpan(item.span) },
      {
        FormField: `<div class="manatos-entry-readonly-field" data-entry-layout-id="${layoutId}" data-entry-readonly-field="${fieldName}" data-entry-representation="${representation}" data-entry-related-fields="${related.join(',')}"><div class="manatos-entry-readonly-label"></div><div class="manatos-entry-readonly-value" data-ctx-field-container="${fieldName}"></div></div>`,
      },
    );
  }
  return model
    ? renderNativeComponent(
        'EntryLayoutField',
        { Span: entryLayoutSpan(item.span) },
        {
          FormField: renderFormField({ ...model, layoutId: item.layoutId }),
        },
      )
    : '';
}
