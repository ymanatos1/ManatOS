import { EntryTypedFieldEmbedded } from '../Entry.js';
import { VersionFieldBehavior } from '../../../fields/types/VersionFieldBehavior.js';

/** The registered Version Field supplies its concrete behavior; all typed Fields
 * share one control/Tools layout in EntryTypedFieldEmbedded. Version-part presentation stays in VersionFieldBehavior.
 * Do not duplicate that common layout in this subclass. */
export class VersionFieldEmbedded extends EntryTypedFieldEmbedded {
  protected override createBehavior(): VersionFieldBehavior {
    return new VersionFieldBehavior();
  }
}
