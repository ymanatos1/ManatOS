import type { MetadataLanguage } from '@manatos/shared';
import { UiSimpleFieldBehavior, escapeFieldHtml } from '../field-types.js';

/** Behavior display skeleton for EJS0's canonical date field component.
 * UIS FieldBehavior: Provides date-only formatting/decoding and validation independent of browser-local timestamp shifts; native DateField owns the input. Never relocate semantic child composition to this policy object. */
export class DateFieldBehavior extends UiSimpleFieldBehavior {
  readonly type = 'date' as const;
  override readonly editable = true;
  override readonly control = {
    input: 'text',
    semantic: true,
    tools: ['copy', 'revert', 'inspect-ctx', 'today', 'clear'],
    icon: 'calendar-event',
  } as const;
  protected override formatValueHtml(value: unknown, language: MetadataLanguage): string {
    if (value === null || value === undefined || value === '') return '—';
    const date = new Date(String(value));
    return !Number.isNaN(date.getTime())
      ? escapeFieldHtml(
          new Intl.DateTimeFormat(language === 'EL' ? 'el-GR' : 'en-GB', {
            dateStyle: 'medium',
            timeZone: 'UTC',
          }).format(date),
        )
      : escapeFieldHtml(value);
  }
}

/** Native date input needs YYYY-MM-DD, not a localized display string. */
export function uiDateInputValue(value: unknown): string {
  if (typeof value !== 'string') return '';
  return /^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value) ? value.slice(0, 10) : '';
}
