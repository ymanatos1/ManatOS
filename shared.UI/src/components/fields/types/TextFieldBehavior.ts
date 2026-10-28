import type { MetadataLanguage } from '@manatos/shared';
import { UiSimpleFieldBehavior, escapeFieldHtml } from '../field-types.js';

/** Text presentation is reusable; the common Behavior wrapper owns row-entry links.
 * UIS FieldBehavior: Owns plain-text value formatting/decoding with the shared Field contract; native TextField owns input/textarea markup. Never relocate semantic child composition to this policy object. */
export class TextFieldBehavior extends UiSimpleFieldBehavior {
  readonly type = 'string' as const;
  override readonly editable = true;
  override readonly control = {
    input: 'text',
    semantic: false,
    tools: ['copy', 'revert', 'inspect-ctx', 'trim', 'clear'],
    icon: 'fonts',
  } as const;
  protected override formatValueHtml(value: unknown, _language: MetadataLanguage): string {
    void _language;
    return value === null || value === undefined || value === '' ? '—' : escapeFieldHtml(value);
  }
}
