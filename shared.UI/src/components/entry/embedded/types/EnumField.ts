import { EntryTypedFieldEmbedded } from '../Entry.js';
import { EnumFieldBehavior } from '../../../fields/types/EnumFieldBehavior.js';

/** The registered Enum Field supplies its concrete behavior; all typed Fields
 * share one control/Tools layout in EntryTypedFieldEmbedded. Enum and inline metadata options use the same EnumFieldBehavior.
 * Do not duplicate that common layout in this subclass. */
export class EnumFieldEmbedded extends EntryTypedFieldEmbedded {
  protected override createBehavior(): EnumFieldBehavior {
    return new EnumFieldBehavior();
  }
}
