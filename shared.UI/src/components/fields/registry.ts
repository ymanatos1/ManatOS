import {
  allSysBOMetadata,
  allSysBOUIMetadata,
  type MetadataLanguage,
  type SysBOFieldType,
} from '@manatos/shared';
import {
  type UiFieldBehavior,
  type UiFieldMetadataContext,
  type UiFieldReferences,
} from './field-types.js';
import { GuidFieldBehavior } from './types/GuidFieldBehavior.js';
import { TextFieldBehavior } from './types/TextFieldBehavior.js';
import { EmailFieldBehavior } from './types/EmailFieldBehavior.js';
import { TelephoneFieldBehavior } from './types/TelephoneFieldBehavior.js';
import { BooleanFieldBehavior } from './types/BooleanFieldBehavior.js';
import { NumberFieldBehavior } from './types/NumberFieldBehavior.js';
import { DateFieldBehavior } from './types/DateFieldBehavior.js';
import { DatetimeFieldBehavior } from './types/DatetimeFieldBehavior.js';
import { DurationFieldBehavior } from './types/DurationFieldBehavior.js';
import { VersionFieldBehavior } from './types/VersionFieldBehavior.js';
import { EnumFieldBehavior } from './types/EnumFieldBehavior.js';
import { ReferenceFieldBehavior } from './types/ReferenceFieldBehavior.js';
import { PictureFieldBehavior } from './types/PictureFieldBehavior.js';
import { PicturesFieldBehavior } from './types/PicturesFieldBehavior.js';
import { RichTextFieldBehavior } from './types/RichTextFieldBehavior.js';

/** The existing 15 semantic Field kinds retain distinct behavior classes. */
export const uiFieldBehavior: ReadonlyMap<SysBOFieldType, new () => UiFieldBehavior> = new Map<
  SysBOFieldType,
  new () => UiFieldBehavior
>([
  ['guid', GuidFieldBehavior],
  ['string', TextFieldBehavior],
  ['email', EmailFieldBehavior],
  ['telephone', TelephoneFieldBehavior],
  ['boolean', BooleanFieldBehavior],
  ['number', NumberFieldBehavior],
  ['date', DateFieldBehavior],
  ['datetime', DatetimeFieldBehavior],
  ['duration', DurationFieldBehavior],
  ['version', VersionFieldBehavior],
  ['enum', EnumFieldBehavior],
  ['reference', ReferenceFieldBehavior],
  ['picture', PictureFieldBehavior],
  ['pictures', PicturesFieldBehavior],
  ['richText', RichTextFieldBehavior],
]);

/** No global instance/cache: the real Surface component owns the prepared behavior. */
export function createUiFieldBehavior(entityKey: string, fieldKey: string): UiFieldBehavior {
  const entity = allSysBOMetadata[entityKey as keyof typeof allSysBOMetadata];
  const field = entity?.fieldDefinition[fieldKey];
  if (!entity || !field || field.sensitive) throw new Error('Unknown or unavailable Field.');
  const constructor = uiFieldBehavior.get(field.type);
  if (!constructor) throw new Error(`Unsupported Field type: ${field.type}`);
  const instance = new constructor();
  const context: UiFieldMetadataContext = {
    entityKey,
    fieldKey,
    entity: entity as unknown as UiFieldMetadataContext['entity'],
    field,
    ui: allSysBOUIMetadata[entityKey as keyof typeof allSysBOUIMetadata] ?? null,
  };
  instance.prepare(context);
  return instance;
}

/** Compatibility entry point for non-component callers; List/Entry use prepared instances. */
export function formatUiListFieldHtml(
  entityKey: string,
  field: string,
  value: unknown,
  language: MetadataLanguage,
  row?: Readonly<Record<string, unknown>>,
  references?: UiFieldReferences,
): string {
  const behavior = createUiFieldBehavior(entityKey, field);
  return behavior.formatHtml(value, language, row, references, behavior.isPrimaryField);
}
