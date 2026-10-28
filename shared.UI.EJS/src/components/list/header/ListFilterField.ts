import type { ListNativeRoute } from '../ListNativeInteractions.js';
import type { MetadataLanguage } from '@manatos/shared';
import { renderNativeComponent } from '../../native-template.js';

/** Concrete List Filter Field: renders its label and native select/input.
 * List native interactions dispatch control changes to ListFilterFieldEmbedded.
 * UIS ownership: one named filter input/selection and its validated field-change intent.
 */
export function renderListFilterField(
  filter: {
    readonly field: string;
    readonly caption: string;
    readonly options: readonly { readonly value: string; readonly label: string }[];
  },
  language: MetadataLanguage,
): string {
  // Concrete Field chooses its native option/text child; their HTML lives in
  // dedicated templates, not concatenated markup inside this renderer.
  const control = filter.options.length
    ? renderNativeComponent(
        'ListFilterSelect',
        { Field: filter.field, All: language === 'EL' ? 'Όλα' : 'All' },
        {
          Options: filter.options
            .map((option) =>
              renderNativeComponent('ListFilterOption', {
                Value: option.value,
                Label: option.label,
              }),
            )
            .join(''),
        },
      )
    : renderNativeComponent('ListFilterText', { Field: filter.field });
  return renderNativeComponent(
    'ListFilterField',
    { Field: filter.field, Caption: filter.caption },
    { Control: control },
  );
}

/** One Field's input/select supplies its name and value to semantic filtering.
 * updateListFilterField owns its focused control; the shared router must
 * not also mutate this value or rebuild the Filter panel.
 */
export const listFilterFieldValueRoutes: readonly ListNativeRoute[] = [
  {
    selector: '[data-list-filter-name]',
    kind: 'list-filter-field',
    fieldAttribute: 'data-list-filter-name',
  },
];

/** Reconcile this filter's native input/select without replacing the focused
 * control. Filter collection/docking remain ListFilter responsibilities; this
 * leaf alone owns its displayed value. Debug here for value/focus drift after
 * canonical #data.filters changes. */
export function updateListFilterField(panel: HTMLElement, field: string, value: string): void {
  const node = Array.from(
    panel.querySelectorAll<HTMLElement>('[data-list-layout="ListFilterField"]'),
  ).find((candidate) => candidate.dataset['listFilterField'] === field);
  const control = node?.querySelector<HTMLInputElement | HTMLSelectElement>(
    '[data-list-filter-name]',
  );
  if (control && control !== control.ownerDocument.activeElement && control.value !== value)
    control.value = value;
}
