import type { UiPopupDefinition } from '../popup-definition.js';

/** Password-reset entry from an emailed link: token stays in Flow state, not UI CTX. */
export const RESET_PASSWORD_POPUP: UiPopupDefinition = {
  id: 'auth.resetPassword',
  presentation: { variant: 'reset' },
  showLanguageSelection: true,
  allowFontScale: true,
  allowDebugger: true,
  fields: [
    {
      id: 'password',
      label: '@CM.NewPassword',
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
      label: '@CM.ConfirmPassword',
      type: 'password',
      autocomplete: 'new-password',
      required: true,
      sensitive: true,
    },
  ],
  rules: [
    {
      id: 'canReset',
      expression:
        '#data.fields.password.lengthValid && #data.fields.password.hasAlpha && ' +
        '#data.fields.password.hasNumber && #data.fields.password.hasSymbol && ' +
        '#data.fields.confirmPassword.matches',
    },
  ],
  view: {
    id: 'reset',
    title: {
      title: '@CM.SetOrResetPassword',
      subtitle: '@CM.ChooseNewAccountPassword',
      icon: 'bi-key',
    },
    content: [
      {
        id: 'reset-password-intro',
        kind: 'intro',
        page: { folder: 'auth', name: 'ResetPassword' },
      },
      {
        id: 'reset-password-section',
        kind: 'section',
        icon: 'bi-shield-lock',
        heading: '@CM.PasswordDetails',
        description: '@CM.EnterConfirmNewPassword',
        children: [
          {
            id: 'reset-password-credentials',
            kind: 'auth-credentials',
            mode: 'reset',
            fieldIds: ['password', 'confirmPassword'],
          },
        ],
      },
      { id: 'reset-password-notice', kind: 'notice' },
    ],
    actions: [
      {
        id: 'cancel',
        label: '@CM.Back',
        icon: 'bi-arrow-left',
        type: 'button',
        alignment: 'start',
      },
      {
        id: 'resetPassword',
        label: '@CM.SetPassword',
        type: 'submit',
        enabledWhen: '#state.rules.canReset',
      },
    ],
  },
};
