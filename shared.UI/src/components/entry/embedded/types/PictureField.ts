import { EntryTypedFieldEmbedded } from '../Entry.js';
import { PictureFieldBehavior } from '../../../fields/types/PictureFieldBehavior.js';

/** The registered Picture Field supplies its concrete behavior; all typed Fields
 * share one control/Tools layout in EntryTypedFieldEmbedded. Single-picture presentation belongs to PictureFieldBehavior.
 * Do not duplicate that common layout in this subclass. */
export class PictureFieldEmbedded extends EntryTypedFieldEmbedded {
  protected override createBehavior(): PictureFieldBehavior {
    return new PictureFieldBehavior();
  }
}
