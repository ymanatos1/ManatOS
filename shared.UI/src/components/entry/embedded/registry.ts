import { UiEmbeddedComponentRegistry } from '../../../runtime/component.js';
import {
  EntryEmbedded,
  EntryTabsEmbedded,
  EntryTabEmbedded,
  EntryDeferredEmbedded,
  EntrySummaryEmbedded,
  EntryRelatedCollectionEmbedded,
  EntryRelatedListEmbedded,
  EntryRelatedListColumnsEmbedded,
  EntryRelatedListHeaderEmbedded,
  EntryRelatedListRowEmbedded,
  EntryRelatedListCellEmbedded,
  EntryLayoutGroupEmbedded,
  EntryLayoutSlotEmbedded,
  EntryActionsEmbedded,
  EntryChangeStatusEmbedded,
  type EntryDefinition,
} from './Entry.js';
import { BooleanFieldEmbedded } from './types/BooleanField.js';
import { DateFieldEmbedded } from './types/DateField.js';
import { DatetimeFieldEmbedded } from './types/DatetimeField.js';
import { DurationFieldEmbedded } from './types/DurationField.js';
import { EmailFieldEmbedded } from './types/EmailField.js';
import { EnumFieldEmbedded } from './types/EnumField.js';
import { GuidFieldEmbedded } from './types/GuidField.js';
import { NumberFieldEmbedded } from './types/NumberField.js';
import { PictureFieldEmbedded } from './types/PictureField.js';
import { PicturesFieldEmbedded } from './types/PicturesField.js';
import { ReferenceFieldEmbedded } from './types/ReferenceField.js';
import { RichTextFieldEmbedded } from './types/RichTextField.js';
import { TelephoneFieldEmbedded } from './types/TelephoneField.js';
import { TextFieldEmbedded } from './types/TextField.js';
import { VersionFieldEmbedded } from './types/VersionField.js';

/** Auth, List and Entry all use this one Surface-managed embedded lifecycle.
 * UIS ownership: every Entry semantic layout owner, typed Field and Field Tools, not a host-level shortcut. */
export function createEntryEmbeddedRegistry(): UiEmbeddedComponentRegistry {
  const registry = new UiEmbeddedComponentRegistry()
    .register('entry', {
      dataPath: 'data.current',
      statusPath: 'state.entry',
      create: (definition) => new EntryEmbedded(definition as EntryDefinition),
    })
    .register('entry-tabs', {
      dataPath: 'data.current',
      statusPath: 'state.entry',
      create: (definition) => new EntryTabsEmbedded(definition as EntryDefinition),
    })
    .register('entry-tab', {
      dataPath: 'data.current',
      statusPath: 'state.entry',
      create: (definition) => new EntryTabEmbedded(definition as EntryDefinition),
    })
    .register('entry-layout-group', {
      dataPath: 'data.current',
      statusPath: 'state.entry',
      create: (d) => new EntryLayoutGroupEmbedded(d as EntryDefinition),
    })
    .register('entry-layout-slot', {
      dataPath: 'data.current',
      create: (d) => new EntryLayoutSlotEmbedded(d as EntryDefinition),
    })
    .register('entry-summary', {
      dataPath: 'data.current',
      statusPath: 'state.entry',
      create: (definition) => new EntrySummaryEmbedded(definition as EntryDefinition),
    })
    .register('entry-related-collection', {
      dataPath: 'data.relatedCollections',
      statusPath: 'state.entry',
      create: (definition) => new EntryRelatedCollectionEmbedded(definition as EntryDefinition),
    })
    .register('entry-related-list', {
      dataPath: 'data.relatedCollections',
      create: (definition) => new EntryRelatedListEmbedded(definition as EntryDefinition),
    })
    .register('entry-related-list-columns', {
      dataPath: 'data.relatedCollections',
      create: (definition) => new EntryRelatedListColumnsEmbedded(definition as EntryDefinition),
    })
    .register('entry-related-list-header', {
      dataPath: 'data.relatedCollections',
      create: (definition) => new EntryRelatedListHeaderEmbedded(definition as EntryDefinition),
    })
    .register('entry-related-list-row', {
      dataPath: 'data.relatedCollections',
      create: (definition) => new EntryRelatedListRowEmbedded(definition as EntryDefinition),
    })
    .register('entry-related-list-cell', {
      dataPath: 'data.relatedCollections',
      create: (definition) => new EntryRelatedListCellEmbedded(definition as EntryDefinition),
    })
    .register('entry-deferred', {
      dataPath: 'data.current',
      statusPath: 'state.entry',
      create: (definition) => new EntryDeferredEmbedded(definition as EntryDefinition),
    })
    .register('entry-change-status', {
      dataPath: 'data.current',
      statusPath: 'state.entry',
      create: (definition) => new EntryChangeStatusEmbedded(definition as EntryDefinition),
    })
    .register('entry-actions', {
      dataPath: 'data.current',
      statusPath: 'state.entry',
      create: (definition) => new EntryActionsEmbedded(definition as EntryDefinition),
    });
  registry.register('field-boolean', {
    dataPath: 'data.current',
    statusPath: 'state.fields',
    create: (definition) => new BooleanFieldEmbedded(definition as EntryDefinition),
  });
  registry.register('field-date', {
    dataPath: 'data.current',
    statusPath: 'state.fields',
    create: (definition) => new DateFieldEmbedded(definition as EntryDefinition),
  });
  registry.register('field-datetime', {
    dataPath: 'data.current',
    statusPath: 'state.fields',
    create: (definition) => new DatetimeFieldEmbedded(definition as EntryDefinition),
  });
  registry.register('field-duration', {
    dataPath: 'data.current',
    statusPath: 'state.fields',
    create: (definition) => new DurationFieldEmbedded(definition as EntryDefinition),
  });
  registry.register('field-email', {
    dataPath: 'data.current',
    statusPath: 'state.fields',
    create: (definition) => new EmailFieldEmbedded(definition as EntryDefinition),
  });
  registry.register('field-enum', {
    dataPath: 'data.current',
    statusPath: 'state.fields',
    create: (definition) => new EnumFieldEmbedded(definition as EntryDefinition),
  });
  registry.register('field-guid', {
    dataPath: 'data.current',
    statusPath: 'state.fields',
    create: (definition) => new GuidFieldEmbedded(definition as EntryDefinition),
  });
  registry.register('field-number', {
    dataPath: 'data.current',
    statusPath: 'state.fields',
    create: (definition) => new NumberFieldEmbedded(definition as EntryDefinition),
  });
  registry.register('field-picture', {
    dataPath: 'data.current',
    statusPath: 'state.fields',
    create: (definition) => new PictureFieldEmbedded(definition as EntryDefinition),
  });
  registry.register('field-pictures', {
    dataPath: 'data.current',
    statusPath: 'state.fields',
    create: (definition) => new PicturesFieldEmbedded(definition as EntryDefinition),
  });
  registry.register('field-reference', {
    dataPath: 'data.current',
    statusPath: 'state.fields',
    create: (definition) => new ReferenceFieldEmbedded(definition as EntryDefinition),
  });
  registry.register('field-richText', {
    dataPath: 'data.current',
    statusPath: 'state.fields',
    create: (definition) => new RichTextFieldEmbedded(definition as EntryDefinition),
  });
  registry.register('field-telephone', {
    dataPath: 'data.current',
    statusPath: 'state.fields',
    create: (definition) => new TelephoneFieldEmbedded(definition as EntryDefinition),
  });
  registry.register('field-string', {
    dataPath: 'data.current',
    statusPath: 'state.fields',
    create: (definition) => new TextFieldEmbedded(definition as EntryDefinition),
  });
  registry.register('field-version', {
    dataPath: 'data.current',
    statusPath: 'state.fields',
    create: (definition) => new VersionFieldEmbedded(definition as EntryDefinition),
  });
  return registry;
}
