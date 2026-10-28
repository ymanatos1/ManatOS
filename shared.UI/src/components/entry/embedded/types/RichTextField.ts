import { EntryTypedFieldEmbedded } from '../Entry.js';
import { RichTextFieldBehavior } from '../../../fields/types/RichTextFieldBehavior.js';

/** The registered RichText Field supplies its concrete behavior; all typed Fields
 * share one control/Tools layout in EntryTypedFieldEmbedded. Rich-text presentation stays in RichTextFieldBehavior.
 * Do not duplicate that common layout in this subclass. */
export class RichTextFieldEmbedded extends EntryTypedFieldEmbedded {
  protected override createBehavior(): RichTextFieldBehavior {
    return new RichTextFieldBehavior();
  }
}
