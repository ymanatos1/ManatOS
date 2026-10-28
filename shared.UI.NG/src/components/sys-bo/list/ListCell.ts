import { Component, inject, input } from '@angular/core';
import { ListContext } from './ListContext';
import type { MetadataLanguage } from '@manatos/shared';
import {
  createUiFieldBehavior,
  UI_ENTRY_RELATED_VIEW_ACTION_FIELD,
  type UiFieldReferences,
  escapeFieldHtml,
} from '@manatos/shared-ui';
/** Type-specific behavior field HTML from the canonical field registry.
 * UIS ownership: one column value within a specific indexed row; the field formatter supplies the value markup. */
@Component({
  selector: 'manatos-list-cell',
  standalone: true,
  templateUrl: './ListCell.html',
})
export class ListCell {
  protected readonly relatedViewField = UI_ENTRY_RELATED_VIEW_ACTION_FIELD;
  readonly index = input.required<number>();
  readonly cellIndex = input.required<number>();
  readonly field = input.required<string>();
  private readonly context = inject(ListContext, { optional: true });
  readonly embeddedRow = input<Readonly<Record<string, unknown>> | null>(null);
  readonly embeddedEntityKey = input('');
  readonly embeddedLanguage = input<MetadataLanguage>('EN');
  readonly embeddedReferences = input<UiFieldReferences>({});
  protected html(): string {
    const embedded = this.embeddedRow();
    const row = embedded ?? this.context?.level()?.data.list[this.index()];
    const value = row?.[this.field()];
    const behavior = embedded
      ? createUiFieldBehavior(this.embeddedEntityKey(), this.field())
      : this.context?.fieldBehaviorForColumn(this.cellIndex());
    const level = this.context?.level();
    const primaryInSelector = level?.control.host === 'popup' && behavior?.isPrimaryField === true;
    const html =
      behavior?.formatHtml(
        value,
        embedded ? this.embeddedLanguage() : (this.context?.language() ?? 'EN'),
        row,
        embedded ? this.embeddedReferences() : level?.data.references,
        behavior?.isPrimaryField === true && !primaryInSelector,
      ) ?? escapeFieldHtml(value ?? '—');
    return primaryInSelector ? `<strong class="manatos-list-selector-name">${html}</strong>` : html;
  }
}
