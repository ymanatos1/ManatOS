import { UiSimpleFieldBehavior, type UiFieldOption } from '../field-types.js';
import type { UiEmbeddedControlEvent } from '../../../runtime/component.js';

/** One editable calendar-duration value. The native component composes the three
 * year/month/day controls; this semantic behavior accepts only ISO duration
 * values and never makes their parts independent Entry data fields. */
export class DurationFieldBehavior extends UiSimpleFieldBehavior {
  readonly type = 'duration' as const;
  override readonly editable = true;
  override readonly control = {
    input: 'duration',
    semantic: true,
    tools: ['copy', 'revert', 'inspect-ctx', 'duration-zero', 'clear'],
    icon: 'clock',
    parts: [
      { id: 'years', kind: 'input', selector: '[data-duration-part="years"]' },
      { id: 'months', kind: 'input', selector: '[data-duration-part="months"]' },
      { id: 'days', kind: 'input', selector: '[data-duration-part="days"]' },
    ],
  } as const;

  override decodeControl(event: UiEmbeddedControlEvent): unknown | undefined {
    if (event.control !== 'duration') return undefined;
    if (event.value === '') return null;
    return /^P(?=\d+[YMD])(?:\d+Y)?(?:\d+M)?(?:\d+D)?$/.test(event.value) ? event.value : undefined;
  }

  override validate(
    value: unknown,
    required: boolean,
    options: readonly UiFieldOption[],
  ): readonly string[] {
    const issues = [...super.validate(value, required, options)];
    if (
      value != null &&
      value !== '' &&
      (typeof value !== 'string' || !/^P(?=\d+[YMD])(?:\d+Y)?(?:\d+M)?(?:\d+D)?$/.test(value))
    )
      issues.push('Invalid duration');
    return issues;
  }
}

/** Conservative ISO calendar-duration projection; invalid strings are not silently parsed. */
export function uiDurationParts(value: unknown): { years: string; months: string; days: string } {
  const match =
    typeof value === 'string' ? /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?$/.exec(value) : null;
  return { years: match?.[1] ?? '', months: match?.[2] ?? '', days: match?.[3] ?? '' };
}

/** Single canonical value from three native controls. Empty means no duration;
 * malformed/negative/non-integral parts produce no edit (undefined).
 */
export function uiDurationFromParts(parts: {
  years: string;
  months: string;
  days: string;
}): string | null | undefined {
  const values = [parts.years, parts.months, parts.days].map((text) => text.trim());
  if (values.every((text) => text === '')) return null;
  if (values.some((text) => text !== '' && !/^\d{1,15}$/.test(text))) return undefined;
  const [years, months, days] = values.map((text) => (text === '' ? '0' : String(BigInt(text))));
  return `P${years}Y${months}M${days}D`;
}
