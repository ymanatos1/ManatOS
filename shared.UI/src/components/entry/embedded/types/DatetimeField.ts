import { EntryTypedFieldEmbedded } from '../Entry.js';
import { DatetimeFieldBehavior } from '../../../fields/types/DatetimeFieldBehavior.js';

/** The registered Datetime Field supplies its concrete behavior; all typed Fields
 * share one control/Tools layout in EntryTypedFieldEmbedded. Date/time decoding and display stay in DatetimeFieldBehavior.
 * Do not duplicate that common layout in this subclass. */
export class DatetimeFieldEmbedded extends EntryTypedFieldEmbedded {
  protected override createBehavior(): DatetimeFieldBehavior {
    return new DatetimeFieldBehavior();
  }
}
