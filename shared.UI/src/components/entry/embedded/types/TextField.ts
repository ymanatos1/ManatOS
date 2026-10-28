import { EntryTypedFieldEmbedded } from '../Entry.js';
import { TextFieldBehavior } from '../../../fields/types/TextFieldBehavior.js';

/** The registered Text Field supplies its concrete behavior; all typed Fields
 * share one control/Tools layout in EntryTypedFieldEmbedded. Single-line string semantics stay in TextFieldBehavior.
 * Do not duplicate that common layout in this subclass. */
export class TextFieldEmbedded extends EntryTypedFieldEmbedded {
  protected override createBehavior(): TextFieldBehavior {
    return new TextFieldBehavior();
  }
}
