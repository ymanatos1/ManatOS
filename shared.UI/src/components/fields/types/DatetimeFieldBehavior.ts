import type { MetadataLanguage } from '@manatos/shared';
import { UiSimpleFieldBehavior, escapeFieldHtml } from '../field-types.js';

/** Behavior display skeleton for EJS0's canonical datetime field component.
 * UIS FieldBehavior: Centralizes timestamp formatting/decoding semantics used by List and Entry; native DatetimeField owns the actual control. Never relocate semantic child composition to this policy object. */
export class DatetimeFieldBehavior extends UiSimpleFieldBehavior {
  readonly type = 'datetime' as const;
  override readonly editable = true;
  override readonly control = {
    input: 'text',
    semantic: true,
    tools: ['copy', 'revert', 'inspect-ctx', 'today', 'now', 'clear'],
    icon: 'calendar2-week',
  } as const;
  protected override formatValueHtml(value: unknown, language: MetadataLanguage): string {
    if (value === null || value === undefined || value === '') return '—';
    const date = new Date(String(value));
    return !Number.isNaN(date.getTime())
      ? escapeFieldHtml(
          new Intl.DateTimeFormat(language === 'EL' ? 'el-GR' : 'en-GB', {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: 'UTC',
          }).format(date),
        )
      : escapeFieldHtml(value);
  }
}

/** Preserve ISO date/time form without using localized text as a native input value. */
export function uiDatetimeInputValue(value: unknown): string {
  if (typeof value !== 'string') return '';
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) ? value.slice(0, 16) : '';
}
