import type { UiPopupDefinition } from '../popup-definition.js';

/** Authenticated password change uses the same one-level semantic popup as reset. */
export const CHANGE_PASSWORD_POPUP: UiPopupDefinition = {
  id: 'auth.changePassword',
  presentation: { variant: 'change' },
  showLanguageSelection: true,
  allowFontScale: true,
  allowDebugger: true,
  fields: [
    {
      id: 'currentPassword',
      label: { EN: 'Current password (if set)', EL: 'Τρέχων κωδικός (εάν υπάρχει)' },
      type: 'password',
      autocomplete: 'current-password',
      required: false,
      sensitive: true,
    },
    {
      id: 'password',
      label: { EN: 'New password', EL: 'Νέος κωδικός' },
      type: 'password',
      autocomplete: 'new-password',
      required: true,
      sensitive: true,
      minLength: 8,
      requiresAlpha: true,
      requiresNumber: true,
      requiresSymbol: true,
    },
    {
      id: 'confirmPassword',
      label: { EN: 'Confirm new password', EL: 'Επιβεβαίωση νέου κωδικού' },
      type: 'password',
      autocomplete: 'new-password',
      required: true,
      sensitive: true,
    },
  ],
  rules: [
    {
      id: 'canChange',
      expression:
        '#data.fields.password.lengthValid && #data.fields.password.hasAlpha && ' +
        '#data.fields.password.hasNumber && #data.fields.password.hasSymbol && ' +
        '#data.fields.confirmPassword.matches',
    },
  ],
  view: {
    id: 'change',
    title: {
      title: { EN: 'Change password', EL: 'Αλλαγή κωδικού πρόσβασης' },
      subtitle: {
        EN: 'Update your account password.',
        EL: 'Ενημερώστε τον κωδικό του λογαριασμού σας.',
      },
      icon: 'bi-key',
    },
    content: [
      {
        id: 'change-password-intro',
        kind: 'intro',
        page: { folder: 'auth', name: 'ChangePassword' },
      },
      {
        id: 'change-password-section',
        kind: 'section',
        icon: 'bi-shield-lock',
        heading: { EN: 'Password details', EL: 'Στοιχεία κωδικού' },
        description: {
          EN: 'Enter your current password if one is set, then choose and confirm a secure replacement.',
          EL: 'Εισαγάγετε τον τρέχοντα κωδικό, εάν υπάρχει, και επιλέξτε και επιβεβαιώστε έναν ασφαλή νέο κωδικό.',
        },
        children: [
          {
            id: 'change-password-credentials',
            kind: 'auth-credentials',
            mode: 'change',
            fieldIds: ['currentPassword', 'password', 'confirmPassword'],
          },
        ],
      },
      { id: 'change-password-notice', kind: 'notice' },
    ],
    actions: [
      {
        id: 'cancel',
        label: { EN: 'Cancel', EL: 'Άκυρο' },
        type: 'button',
        alignment: 'end',
      },
      {
        id: 'changePassword',
        label: { EN: 'Change password', EL: 'Αλλαγή κωδικού' },
        type: 'submit',
        enabledWhen: '#state.rules.canChange',
      },
    ],
  },
};
