import type { MetadataLanguage } from '@manatos/shared';
import { UiSimpleFieldBehavior, escapeFieldHtml } from '../field-types.js';

/** Behavior display skeleton for EJS0's canonical number field component.
 * UIS FieldBehavior: Centralizes numeric decoding, validation and formatting; native NumberField retains the actual input and focus. Never relocate semantic child composition to this policy object. */
export class NumberFieldBehavior extends UiSimpleFieldBehavior {
  readonly type = 'number' as const;
  override readonly editable = true;
  override readonly control = {
    input: 'number',
    semantic: false,
    tools: ['copy', 'revert', 'inspect-ctx', 'zero', 'clear'],
    icon: '123',
  } as const;
  override decodeControl(
    event: import('../../../runtime/component.js').UiEmbeddedControlEvent,
  ): unknown | undefined {
    if (event.control !== 'number') return undefined;
    if (event.value === '') return null;
    const value = Number(event.value);
    return Number.isFinite(value) ? value : undefined;
  }
  protected override formatValueHtml(value: unknown, language: MetadataLanguage): string {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value !== 'number' || !Number.isFinite(value)) return escapeFieldHtml(value);
    return escapeFieldHtml(
      new Intl.NumberFormat(language === 'EL' ? 'el-GR' : 'en-GB').format(value),
    );
  }
}
