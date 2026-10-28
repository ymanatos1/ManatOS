import { resolveMetadataText, type MetadataLanguage } from '@manatos/shared';
import { UiSimpleFieldBehavior } from '../field-types.js';

/** Behavior display skeleton for EJS0's canonical pictures field component.
 * UIS FieldBehavior: Defines multi-picture field presentation and semantic parts; native PicturesField renders the ordered image collection. Never relocate semantic child composition to this policy object. */
export class PicturesFieldBehavior extends UiSimpleFieldBehavior {
  readonly type = 'pictures' as const;
  override readonly control = {
    input: 'none',
    semantic: true,
    tools: [],
    icon: 'images',
  } as const;
  override readonly editable = true;
  override formatText(value: unknown, language: MetadataLanguage): string {
    return value && (!Array.isArray(value) || value.length > 0)
      ? resolveMetadataText('@CM.Pictures', language)
      : '';
  }
  protected override formatValueHtml(value: unknown, language: MetadataLanguage): string {
    return value && (!Array.isArray(value) || value.length > 0)
      ? resolveMetadataText('@CM.Picture', language)
      : '—';
  }
}
