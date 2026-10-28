import { resolveMetadataText, type MetadataLanguage } from '@manatos/shared';
import { UiSimpleFieldBehavior, escapeFieldHtml, type UiFieldOption } from '../field-types.js';

/** Boolean state is a Field behavior; ListCell never interprets entity-specific values.
 * UIS FieldBehavior: Translates checkbox intents and boolean display states; keep the typed control registration in BooleanFieldEmbedded and each native BooleanField template. Never relocate semantic child composition to this policy object. */
export class BooleanFieldBehavior extends UiSimpleFieldBehavior {
  readonly type = 'boolean' as const;
  override readonly editable = true;
  override readonly control = {
    input: 'checkbox',
    semantic: true,
    presentationSelector: '.manatos-form-switch-track',
    tools: [],
    icon: 'toggle-on',
  } as const;
  override filterOptions(language: MetadataLanguage): readonly UiFieldOption[] {
    return [
      { value: 'true', label: resolveMetadataText('@CM.Yes', language) },
      { value: 'false', label: resolveMetadataText('@CM.No', language) },
    ];
  }
  override decodeControl(
    event: import('../../../runtime/component.js').UiEmbeddedControlEvent,
  ): unknown | undefined {
    return event.control === 'checkbox' ? event.checked === true : undefined;
  }
  protected override formatValueHtml(value: unknown, language: MetadataLanguage): string {
    if (value === null || value === undefined || value === '') return '—';
    const truthy = value === true || value === 'true';
    const field = this.metadata?.fieldKey;
    const key =
      field === 'emailVerified'
        ? truthy
          ? 'Verified'
          : 'NotVerified'
        : field === 'enabled'
          ? truthy
            ? 'Enabled'
            : 'Disabled'
          : truthy
            ? 'Yes'
            : 'No';
    const label = resolveMetadataText(`@CM.${key}`, language);
    const icon = truthy ? 'check-circle-fill' : 'dash-circle';
    return `<span class="manatos-field-badge manatos-field-badge--${truthy ? 'success' : 'secondary'}"><i class="bi bi-${icon}" aria-hidden="true"></i> ${escapeFieldHtml(label)}</span>`;
  }
}
