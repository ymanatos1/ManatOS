import { EntryTypedFieldEmbedded } from '../Entry.js';
import { EmailFieldBehavior } from '../../../fields/types/EmailFieldBehavior.js';

/** The registered Email Field supplies its concrete behavior; all typed Fields
 * share one control/Tools layout in EntryTypedFieldEmbedded. Email input semantics and validation stay in EmailFieldBehavior.
 * Do not duplicate that common layout in this subclass. */
export class EmailFieldEmbedded extends EntryTypedFieldEmbedded {
  protected override createBehavior(): EmailFieldBehavior {
    return new EmailFieldBehavior();
  }
}
