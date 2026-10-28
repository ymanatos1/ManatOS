import { EntryTypedFieldEmbedded } from '../Entry.js';
import { DurationFieldBehavior } from '../../../fields/types/DurationFieldBehavior.js';

/** The registered Duration Field supplies its concrete behavior; all typed Fields
 * share one control/Tools layout in EntryTypedFieldEmbedded. Duration part definitions and decoding stay in DurationFieldBehavior.
 * Do not duplicate that common layout in this subclass. */
export class DurationFieldEmbedded extends EntryTypedFieldEmbedded {
  protected override createBehavior(): DurationFieldBehavior {
    return new DurationFieldBehavior();
  }
}
