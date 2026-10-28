import { EntryTypedFieldEmbedded } from '../Entry.js';
import { BooleanFieldBehavior } from '../../../fields/types/BooleanFieldBehavior.js';

/** The registered Boolean Field supplies its concrete behavior; all typed Fields
 * share one control/Tools layout in EntryTypedFieldEmbedded. Boolean decoding and checked-state semantics stay in BooleanFieldBehavior.
 * Do not duplicate that common layout in this subclass. */
export class BooleanFieldEmbedded extends EntryTypedFieldEmbedded {
  protected override createBehavior(): BooleanFieldBehavior {
    return new BooleanFieldBehavior();
  }
}
