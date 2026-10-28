import type { UiPopupDefinition } from './popup-definition.js';

/** Decision-only popup; Save is visibly unavailable until real persistence exists. */
export const UNSAVED_CHANGES_POPUP: UiPopupDefinition = {
  id: 'semantic.unsavedChanges',
  presentation: { variant: 'unsaved' },
  showLanguageSelection: true,
  allowFontScale: true,
  allowDebugger: true,
  fields: [],
  rules: [],
  view: {
    id: 'decision',
    title: {
      title: '@CM.UnsavedChanges',
      subtitle: '',
      icon: 'bi-exclamation-triangle',
    },
    content: [
      {
        id: 'dirty-close-warning',
        kind: 'note',
        icon: 'bi-exclamation-circle',
        illustration: '/_manatos/pages/messages/assets/unsaved-illustration.svg',
        text: {
          EN: 'You have changes that have not been saved.',
          EL: 'Υπάρχουν αλλαγές που δεν έχουν αποθηκευτεί.',
        },
      },
    ],
    actions: [
      {
        id: 'review',
        label: { EN: 'Review changes', EL: 'Επισκόπηση αλλαγών' },
        icon: 'bi-pencil-square',
        type: 'button',
        alignment: 'start',
        primary: false,
      },
      { id: 'cancel', label: '@CM.Cancel', icon: 'bi-x-lg', type: 'button' },
      {
        id: 'discard',
        label: { EN: 'Discard', EL: 'Απόρριψη' },
        icon: 'bi-trash',
        type: 'button',
        tone: 'danger',
      },
      {
        id: 'save',
        label: '@CM.Save',
        icon: 'bi-check-lg',
        type: 'button',
        primary: true,
        enabledWhen: 'false',
      },
    ],
  },
};
