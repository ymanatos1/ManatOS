import { renderNativeComponent } from '../../native-template.js';
import type { MetadataLanguage } from '@manatos/shared';
/**
 * EJS Add owns the localized disabled button/title in ListAdd.html. It has no native action
 * because the semantic feature is not yet available; do not move this markup into ListHeader.
 * Debug: renderListAdd() / ListAdd.html.
 */
export function renderListAdd(language: MetadataLanguage = 'EN'): string {
  const el = language === 'EL';
  return renderNativeComponent('ListAdd', {
    Label: el ? 'Προσθήκη νέου' : 'Add new',
    Title: el ? 'Διαθέσιμο σε επόμενη έκδοση' : 'Available in a later slice',
  });
}
