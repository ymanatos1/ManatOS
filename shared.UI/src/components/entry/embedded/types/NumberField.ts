import { EntryTypedFieldEmbedded } from '../Entry.js';
import { NumberFieldBehavior } from '../../../fields/types/NumberFieldBehavior.js';

/** The registered Number Field supplies its concrete behavior; all typed Fields
 * share one control/Tools layout in EntryTypedFieldEmbedded. Numeric conversion and display stay in NumberFieldBehavior.
 * Do not duplicate that common layout in this subclass. */
export class NumberFieldEmbedded extends EntryTypedFieldEmbedded {
  protected override createBehavior(): NumberFieldBehavior {
    return new NumberFieldBehavior();
  }
}
