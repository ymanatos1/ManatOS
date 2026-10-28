import { EntryTypedFieldEmbedded } from '../Entry.js';
import { GuidFieldBehavior } from '../../../fields/types/GuidFieldBehavior.js';

/** The registered Guid Field supplies its concrete behavior; all typed Fields
 * share one control/Tools layout in EntryTypedFieldEmbedded. Identifier decoding and presentation stay in GuidFieldBehavior.
 * Do not duplicate that common layout in this subclass. */
export class GuidFieldEmbedded extends EntryTypedFieldEmbedded {
  protected override createBehavior(): GuidFieldBehavior {
    return new GuidFieldBehavior();
  }
}
