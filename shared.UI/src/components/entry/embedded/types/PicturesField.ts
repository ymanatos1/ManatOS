import { EntryTypedFieldEmbedded } from '../Entry.js';
import { PicturesFieldBehavior } from '../../../fields/types/PicturesFieldBehavior.js';

/** The registered Pictures Field supplies its concrete behavior; all typed Fields
 * share one control/Tools layout in EntryTypedFieldEmbedded. Picture collection presentation belongs to PicturesFieldBehavior.
 * Do not duplicate that common layout in this subclass. */
export class PicturesFieldEmbedded extends EntryTypedFieldEmbedded {
  protected override createBehavior(): PicturesFieldBehavior {
    return new PicturesFieldBehavior();
  }
}
