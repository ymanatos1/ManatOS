import {
  enumItemsForField,
  resolveMetadataText,
  canonicalEnumMetadata,
  isEmptyEntryFieldValue,
  type MetadataLanguage,
} from '@manatos/shared';
import {
  UiSimpleFieldBehavior,
  escapeFieldHtml,
  uiFieldIcon,
  type UiFieldOption,
} from '../field-types.js';

/** UIS FieldBehavior: Resolves inline options and subsystem enums through one prepared option map for validation, labels, icons and control decoding; do not duplicate values in CTX or split Field implementations. Never relocate semantic child composition to this policy object. */
export class EnumFieldBehavior extends UiSimpleFieldBehavior {
  readonly type = 'enum' as const;
  override readonly editable = true;
  override readonly control = {
    input: 'select',
    semantic: false,
    presentationSelector: '.manatos-enum-trigger',
    tools: ['copy', 'revert', 'inspect-ctx', 'clear'],
    icon: 'list-ul',
  } as const;
  override decodeControl(
    event: import('../../../runtime/component.js').UiEmbeddedControlEvent,
  ): unknown | undefined {
    if (event.control !== 'select') return undefined;
    if (event.value === '') return null;
    // Both globally declared enums and inline values use the same prepared map.
    return this.items.has(event.value) ? event.value : undefined;
  }
  private readonly items = new Map<string, ReturnType<typeof enumItemsForField>[number]>();

  override prepare(context: Parameters<UiSimpleFieldBehavior['prepare']>[0]): void {
    super.prepare(context);
    this.items.clear();
    for (const item of enumItemsForField(context.field)) this.items.set(String(item.value), item);
  }
  override filterOptions(language: MetadataLanguage): readonly UiFieldOption[] {
    return Array.from(this.items.values(), (item) => ({
      value: String(item.value),
      label: resolveMetadataText(item.label ?? String(item.value), language),
      ...(item.icon ? { icon: item.icon } : {}),
    }));
  }
  override validate(
    value: unknown,
    required: boolean,
    options: readonly UiFieldOption[],
  ): readonly string[] {
    const issues = [...super.validate(value, required, options)];
    if (this.metadata?.field.enum && !canonicalEnumMetadata(this.metadata.field.enum))
      issues.push('Unavailable declared enum');
    if (
      !isEmptyEntryFieldValue(value) &&
      options.length > 0 &&
      !options.some((item) => item.value === String(value))
    )
      issues.push('Invalid option');
    return issues;
  }
  /** The enum item's icon is prepared alongside its caption and tone. */
  iconFor(value: unknown): string | undefined {
    return this.items.get(String(value))?.icon;
  }
  override formatText(value: unknown, language: MetadataLanguage): string {
    if (value === null || value === undefined || value === '') return '';
    const item = this.items.get(String(value));
    return item?.label ? resolveMetadataText(item.label, language) : String(value);
  }
  protected override formatValueHtml(value: unknown, language: MetadataLanguage): string {
    if (value === null || value === undefined || value === '') return '—';
    const item = this.items.get(String(value));
    const label = this.formatText(value, language);
    const icon = uiFieldIcon(item?.icon);
    const tone =
      item?.tone && /^(primary|secondary|success|danger|warning|info)$/.test(item.tone)
        ? ` manatos-field-badge manatos-field-badge--${item.tone}`
        : '';
    return `<span class="manatos-field-enum${tone}">${icon ? `${icon} ` : ''}${escapeFieldHtml(label)}</span>`;
  }
}
