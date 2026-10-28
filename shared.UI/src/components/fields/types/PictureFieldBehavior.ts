import { resolveMetadataText, type MetadataLanguage } from '@manatos/shared';
import { UiSimpleFieldBehavior } from '../field-types.js';

/** Behavior display skeleton for EJS0's canonical picture field component.
 * UIS FieldBehavior: Declares the single-picture preview contract; native PictureField owns thumbnail elements and API URLs are supplied by the authorized presentation. Never relocate semantic child composition to this policy object. */
export class PictureFieldBehavior extends UiSimpleFieldBehavior {
  readonly type = 'picture' as const;
  override readonly control = {
    input: 'none',
    semantic: true,
    tools: [],
    icon: 'image',
    parts: [
      { id: 'thumbnail', kind: 'value', selector: '[data-entry-photo-thumbnail]' },
      { id: 'empty', kind: 'value', selector: '[data-entry-photo-empty]' },
    ],
  } as const;
  override readonly editable = true;
  override formatText(value: unknown, language: MetadataLanguage): string {
    return value && (!Array.isArray(value) || value.length > 0)
      ? resolveMetadataText('@CM.Picture', language)
      : '';
  }
  protected override formatValueHtml(value: unknown, language: MetadataLanguage): string {
    return value && (!Array.isArray(value) || value.length > 0)
      ? resolveMetadataText('@CM.Picture', language)
      : '—';
  }
}
