import {
  allSysBOMetadata,
  relationshipForField,
  entryPhotoField,
  prepareEntryRepresentation,
  resolveMetadataText,
  type PreparedEntryRepresentation,
  type MetadataLanguage,
} from '@manatos/shared';
import {
  UiSimpleFieldBehavior,
  escapeFieldHtml,
  uiFieldIcon,
  type UiFieldMetadataContext,
  type UiFieldReferences,
} from '../field-types.js';

const isGuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** A reference knows its target once, never looks up metadata for each row.
 * UIS FieldBehavior: Resolves target metadata and canonical Entry representation (name/icons/existing photo); native ReferenceField owns the visible child elements. Never relocate semantic child composition to this policy object. */
export class ReferenceFieldBehavior extends UiSimpleFieldBehavior {
  readonly type = 'reference' as const;
  override readonly editable = true;
  override readonly control = {
    input: 'select',
    semantic: false,
    presentationSelector: '.manatos-reference-selection-line',
    tools: ['copy', 'revert', 'inspect-ctx', 'clear'],
    icon: 'link-45deg',
    parts: [
      { id: 'icons', kind: 'value', selector: '[data-entry-reference-icons]' },
      { id: 'photo', kind: 'value', selector: '[data-entry-reference-photo]' },
      { id: 'name', kind: 'value', selector: '[data-entry-reference-name]' },
    ],
  } as const;
  override decodeControl(
    event: import('../../../runtime/component.js').UiEmbeddedControlEvent,
  ): unknown | undefined {
    if (event.control !== 'select' || !this.targetEntityKey) return undefined;
    return isGuid(event.value) ? event.value : undefined;
  }
  private targetEntity: UiFieldMetadataContext['entity'] | null = null;
  private _targetEntityKey: string | null = null;
  private representation: PreparedEntryRepresentation | null = null;
  private photoField: string | null = null;
  get targetEntityKey(): string | null {
    return this._targetEntityKey;
  }

  override prepare(context: UiFieldMetadataContext): void {
    super.prepare(context);
    this.targetEntity = null;
    this._targetEntityKey = null;
    this.representation = null;
    this.photoField = null;
    const direct = relationshipForField(context.entity, context.fieldKey);
    const targetKey =
      direct?.relationship.references.objectKey ?? context.field.inverseRelationship?.objectKey;
    if (!targetKey) return;
    const target = allSysBOMetadata[targetKey as keyof typeof allSysBOMetadata];
    if (!target) return;
    this.targetEntity = target as unknown as UiFieldMetadataContext['entity'];
    this._targetEntityKey = targetKey;
    this.representation = prepareEntryRepresentation(this.targetEntity, null);
    this.photoField = entryPhotoField(this.targetEntity);
  }

  protected override formatValueHtml(
    value: unknown,
    language: MetadataLanguage,
    _row?: Readonly<Record<string, unknown>>,
    references?: UiFieldReferences,
    showAsLink = false,
  ): string {
    void _row;
    if (value === null || value === undefined || value === '') return '—';
    const id = String(value);
    const targetKey = this.targetEntityKey;
    const record = targetKey
      ? references?.[targetKey]?.find(
          (entry) => String(entry.id ?? '').toLowerCase() === id.toLowerCase(),
        )
      : undefined;
    if (!record || !this.representation) {
      const label = resolveMetadataText('@CM.Unknown', language);
      return `<span class="manatos-field-reference-unknown" title="${label}">${label}</span>`;
    }
    const representation = this.representation(record, { language });
    const caption = escapeFieldHtml(representation.name || String(record.name ?? id));
    const icons = representation.icons.map(uiFieldIcon).filter(Boolean).join(' ');
    // A picture may be an already-authorized URL or an object exposing its URL.
    const photo = representation.photo;
    const url =
      typeof photo === 'string'
        ? photo
        : photo && typeof photo === 'object' && !Array.isArray(photo)
          ? (photo as { url?: unknown }).url
          : null;
    const canonicalSource =
      !url &&
      photo &&
      typeof photo === 'object' &&
      !Array.isArray(photo) &&
      targetKey &&
      this.photoField
        ? `/_manatos/auth/resources/picture/${encodeURIComponent(targetKey)}/${encodeURIComponent(id)}/${encodeURIComponent(this.photoField)}?variant=thumbnail&revision=${encodeURIComponent(String((photo as Readonly<Record<string, unknown>>).revision ?? ''))}`
        : null;
    const pictureUrl = typeof url === 'string' ? url : canonicalSource;
    const safePhoto =
      typeof pictureUrl === 'string' &&
      (/^https:\/\/[^\s<>"']+$/i.test(pictureUrl) || /^\/(?!\/)[^\s<>"']+$/.test(pictureUrl))
        ? `<img class="manatos-field-reference-photo" src="${escapeFieldHtml(pictureUrl)}" alt="" loading="lazy" />`
        : '';
    const html = `<span class="manatos-field-reference">${icons ? `${icons} ` : ''}${safePhoto}${caption}</span>`;
    return !showAsLink && targetKey && isGuid(id)
      ? `<a class="manatos-field-entry-name" href="/bo/${encodeURIComponent(targetKey)}/${encodeURIComponent(id)}">${html}</a>`
      : html;
  }
}
