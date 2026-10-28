import { EntryTypedFieldEmbedded } from '../Entry.js';
import { ReferenceFieldBehavior } from '../../../fields/types/ReferenceFieldBehavior.js';

/** The registered Reference Field supplies its concrete behavior; all typed Fields
 * share one control/Tools layout in EntryTypedFieldEmbedded. Referenced-entry display stays in ReferenceFieldBehavior.
 * Do not duplicate that common layout in this subclass. */
export class ReferenceFieldEmbedded extends EntryTypedFieldEmbedded {
  protected override createBehavior(): ReferenceFieldBehavior {
    return new ReferenceFieldBehavior();
  }
}
