import { EntryTypedFieldEmbedded } from '../Entry.js';
import { DateFieldBehavior } from '../../../fields/types/DateFieldBehavior.js';

/** The registered Date Field supplies its concrete behavior; all typed Fields
 * share one control/Tools layout in EntryTypedFieldEmbedded. Date-only decoding and display stay in DateFieldBehavior.
 * Do not duplicate that common layout in this subclass. */
export class DateFieldEmbedded extends EntryTypedFieldEmbedded {
  protected override createBehavior(): DateFieldBehavior {
    return new DateFieldBehavior();
  }
}
