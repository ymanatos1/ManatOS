import { UiSimpleFieldBehavior, escapeFieldHtml } from '../field-types.js';

/** Behavior display skeleton for EJS0's canonical richText field component.
 * UIS FieldBehavior: Enforces rich-text value safety and display conversion; editor markup remains in each native RichTextField. Never relocate semantic child composition to this policy object. */
export class RichTextFieldBehavior extends UiSimpleFieldBehavior {
  readonly type = 'richText' as const;
  override readonly control = {
    input: 'none',
    semantic: false,
    tools: [],
    icon: 'file-richtext',
  } as const;
  protected override formatValueHtml(value: unknown): string {
    return value === null || value === undefined || value === '' ? '—' : escapeFieldHtml(value);
  }
}
