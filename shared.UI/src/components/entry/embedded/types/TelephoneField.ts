import { EntryTypedFieldEmbedded } from '../Entry.js';
import { TelephoneFieldBehavior } from '../../../fields/types/TelephoneFieldBehavior.js';

/** The registered Telephone Field supplies its concrete behavior; all typed Fields
 * share one control/Tools layout in EntryTypedFieldEmbedded. Telephone input semantics stay in TelephoneFieldBehavior.
 * Do not duplicate that common layout in this subclass. */
export class TelephoneFieldEmbedded extends EntryTypedFieldEmbedded {
  protected override createBehavior(): TelephoneFieldBehavior {
    return new TelephoneFieldBehavior();
  }
}
