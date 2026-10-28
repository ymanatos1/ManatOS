import { UiSimpleFieldBehavior, escapeFieldHtml, uiFieldIcon } from '../field-types.js';

/** Email-specific compact badge; escaping and URL handling remain framework-neutral.
 * UIS FieldBehavior: Encapsulates email validation and safe display formatting; native EmailField declares the actual email input. Never relocate semantic child composition to this policy object. */
export class EmailFieldBehavior extends UiSimpleFieldBehavior {
  readonly type = 'email' as const;
  override readonly editable = true;
  override readonly control = {
    input: 'text',
    semantic: false,
    tools: ['copy', 'revert', 'inspect-ctx', 'trim', 'clear'],
    icon: 'envelope',
  } as const;
  protected override formatValueHtml(value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    const address = String(value).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return escapeFieldHtml(address);
    return `<a class="manatos-field-badge manatos-field-badge--email" href="mailto:${encodeURIComponent(address)}">${uiFieldIcon('envelope')} ${escapeFieldHtml(address)}</a>`;
  }
}
