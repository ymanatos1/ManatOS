/**
 * Angular Field renderer registry. Each concrete Field owns its native template.
 * FormField selects an implementation through this registry; adding a Field
 * never requires modifying a parent template or adding a type switch.
 */
import type { Type } from '@angular/core';
import type { SysBOFieldType } from '@manatos/shared';
import { BooleanField } from './types/BooleanField';
import { DateField } from './types/DateField';
import { DatetimeField } from './types/DatetimeField';
import { DurationField } from './types/DurationField';
import { EmailField } from './types/EmailField';
import { EnumField } from './types/EnumField';
import { GuidField } from './types/GuidField';
import { NumberField } from './types/NumberField';
import { PictureField } from './types/PictureField';
import { PicturesField } from './types/PicturesField';
import { ReferenceField } from './types/ReferenceField';
import { RichTextField } from './types/RichTextField';
import { TelephoneField } from './types/TelephoneField';
import { TextField } from './types/TextField';
import { VersionField } from './types/VersionField';

export interface UiNgFieldControl {
  readonly field: import('@angular/core').InputSignal<
    import('@manatos/shared-ui').UiEntryFieldPresentation
  >;
}

export const ngEntryFieldRegistry: ReadonlyMap<SysBOFieldType, Type<UiNgFieldControl>> = new Map<
  SysBOFieldType,
  Type<UiNgFieldControl>
>([
  ['boolean', BooleanField],
  ['date', DateField],
  ['datetime', DatetimeField],
  ['duration', DurationField],
  ['email', EmailField],
  ['enum', EnumField],
  ['guid', GuidField],
  ['number', NumberField],
  ['picture', PictureField],
  ['pictures', PicturesField],
  ['reference', ReferenceField],
  ['richText', RichTextField],
  ['telephone', TelephoneField],
  ['string', TextField],
  ['version', VersionField],
]);
