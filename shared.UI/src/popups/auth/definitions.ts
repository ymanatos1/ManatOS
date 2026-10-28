import type { UiPopupDefinition } from '../popup-definition.js';

/**
 * Sign-in: one popup, two invisible tabs sharing one CTX #level.
 *
 * The renderer supplies the common PopupTitle and PopupActions.
 * Existing AuthCredentials and ExternalProviders render the declared
 * semantic components, without owning this popup's business rules.
 */
export const SIGN_IN_POPUP = {
  id: 'auth.signin',
  initialTab: 'signin',
  navigation: [{ from: 'signin', to: 'passwordReminder', actionId: 'showPasswordReminder' }],
  showLanguageSelection: true,
  allowFontScale: true,
  allowDebugger: true,

  fields: [
    {
      id: 'identity',
      label: { EN: 'Email or user name', EL: 'Email ή όνομα χρήστη' },
      type: 'text',
      autocomplete: 'username',
      required: true,
    },
    {
      id: 'password',
      label: { EN: 'Password', EL: 'Κωδικός πρόσβασης' },
      type: 'password',
      autocomplete: 'current-password',
      required: true,
      sensitive: true,
    },
    {
      id: 'recoveryIdentity',
      label: { EN: 'Email or user name', EL: 'Email ή όνομα χρήστη' },
      type: 'text',
      autocomplete: 'username',
      required: true,
      minLength: 2,
    },
  ],

  rules: [
    {
      id: 'canSubmit',
      expression: '#data.fields.identity.valid && #data.fields.password.present',
    },
    {
      id: 'canRequestRecovery',
      expression: '#data.fields.recoveryIdentity.valid',
    },
  ],

  tabs: [
    {
      id: 'signin',
      title: {
        title: { EN: 'Sign in', EL: 'Σύνδεση' },
        subtitle: { EN: 'Choose how you want to login.', EL: 'Επιλέξτε πώς θέλετε να συνδεθείτε.' },
        icon: 'bi-box-arrow-in-right',
      },
      content: [
        {
          id: 'signin-intro',
          kind: 'intro',
          page: { folder: 'auth', name: 'SignIn' },
        },
        {
          id: 'signin-providers-section',
          kind: 'section',
          icon: 'bi-globe2',
          heading: { EN: 'External provider', EL: 'Εξωτερικός πάροχος' },
          description: {
            EN: 'Use a configured provider already connected to your account.',
            EL: 'Χρησιμοποιήστε έναν διαμορφωμένο πάροχο που είναι ήδη συνδεδεμένος με τον λογαριασμό σας.',
          },
          children: [
            {
              id: 'signin-providers',
              kind: 'external-providers',
              purpose: 'signin',
            },
          ],
        },
        {
          id: 'signin-credentials-section',
          kind: 'section',
          icon: 'bi-person-lock',
          heading: { EN: 'Your credentials', EL: 'Τα στοιχεία σύνδεσής σας' },
          description: {
            EN: 'Sign in directly with your credentials.',
            EL: 'Συνδεθείτε απευθείας με τα στοιχεία σας.',
          },
          children: [
            {
              id: 'signin-credentials',
              kind: 'auth-credentials',
              recoveryActionId: 'showPasswordReminder',
              mode: 'signin',
              fieldIds: ['identity', 'password'],
            },
          ],
        },
        { id: 'signin-notice', kind: 'notice' },
      ],
      actions: [
        {
          id: 'cancel',
          label: { EN: 'Cancel', EL: 'Άκυρον' },
          type: 'button',
        },
        {
          id: 'signin',
          label: { EN: 'Sign in', EL: 'Σύνδεση' },
          icon: 'bi-box-arrow-in-right',
          type: 'submit',
          enabledWhen: '#state.rules.canSubmit',
        },
      ],
    },
    {
      id: 'passwordReminder',
      title: {
        title: { EN: 'Forgot or set password', EL: 'Ξεχάσατε τον κωδικό ή θέλετε να ορίσετε νέο;' },
        subtitle: {
          EN: 'Recover access to your account.',
          EL: 'Ανακτήστε την πρόσβαση στον λογαριασμό σας.',
        },
        icon: 'bi-key',
      },
      content: [
        {
          id: 'password-reminder-intro',
          kind: 'intro',
          page: { folder: 'auth', name: 'PasswordReminder' },
        },
        {
          id: 'password-reminder-section',
          kind: 'section',
          icon: 'bi-person-lock',
          heading: { EN: 'Account identification', EL: 'Αναγνώριση λογαριασμού' },
          children: [
            {
              id: 'password-reminder-credentials',
              kind: 'auth-credentials',
              mode: 'recovery',
              fieldIds: ['recoveryIdentity'],
            },
          ],
        },
        {
          id: 'password-reminder-notice',
          kind: 'notice',
        },
      ],
      actions: [
        {
          id: 'back',
          label: { EN: 'Back', EL: 'Πίσω' },
          icon: 'bi-arrow-left',
          type: 'button',
          alignment: 'start',
          targetTab: 'signin',
        },
        {
          id: 'cancel',
          label: { EN: 'Cancel', EL: 'Άκυρον' },
          type: 'button',
        },
        {
          id: 'sendInstructions',
          label: { EN: 'Send instructions', EL: 'Αποστολή οδηγιών' },
          icon: 'bi-send',
          type: 'submit',
          enabledWhen: '#state.rules.canRequestRecovery',
        },
      ],
    },
  ],
} as const satisfies UiPopupDefinition;

/**
 * Registration: ONE popup with TWO hidden tabs and ONE #level.
 *
 * Switching between Methods and Email changes #state.tab.
 * It does not create or destroy a second popup or CTX level.
 */
export const REGISTER_POPUP = {
  id: 'auth.register',
  presentation: { variant: 'register' },
  initialTab: 'methods',
  navigation: [{ from: 'methods', to: 'email', actionId: 'showEmail' }],
  showLanguageSelection: true,
  allowFontScale: true,
  allowDebugger: true,

  fields: [
    {
      id: 'username',
      label: { EN: 'User name', EL: 'Όνομα χρήστη' },
      type: 'text',
      autocomplete: 'username',
      required: true,
      minLength: 2,
    },
    {
      id: 'email',
      label: { EN: 'Email', EL: 'Email' },
      type: 'email',
      autocomplete: 'email',
      required: true,
    },
    {
      id: 'password',
      label: { EN: 'Password', EL: 'Κωδικός πρόσβασης' },
      type: 'password',
      autocomplete: 'new-password',
      required: true,
      sensitive: true,
      minLength: 9,
      requiresAlpha: true,
      requiresNumber: true,
      requiresSymbol: true,
    },
    {
      id: 'confirmPassword',
      label: { EN: 'Confirm password', EL: 'Επιβεβαίωση κωδικού' },
      type: 'password',
      autocomplete: 'new-password',
      required: true,
      sensitive: true,
    },
  ],

  rules: [
    {
      id: 'canCreateAccount',
      expression:
        '#data.fields.username.valid && ' +
        '#data.fields.email.valid && ' +
        '#data.fields.password.lengthValid && ' +
        '#data.fields.password.hasAlpha && ' +
        '#data.fields.password.hasNumber && ' +
        '#data.fields.password.hasSymbol && ' +
        '#data.fields.confirmPassword.matches',
    },
  ],

  tabs: [
    {
      id: 'methods',
      title: {
        title: { EN: 'Create your account', EL: 'Δημιουργία λογαριασμού' },
        subtitle: {
          EN: 'Choose how you want to join us.',
          EL: 'Επιλέξτε πώς θέλετε να εγγραφείτε.',
        },
        icon: 'bi-person-plus',
      },
      content: [
        {
          id: 'register-methods-intro',
          kind: 'intro',
          page: { folder: 'auth', name: 'RegisterMethods' },
        },
        {
          id: 'register-providers-section',
          kind: 'section',
          icon: 'bi-globe2',
          heading: { EN: 'External provider', EL: 'Εξωτερικός πάροχος' },
          description: {
            EN: 'Register with an available account you already use.',
            EL: 'Εγγραφείτε με έναν διαθέσιμο λογαριασμό που χρησιμοποιείτε ήδη.',
          },
          children: [
            {
              id: 'register-providers',
              kind: 'external-providers',
              purpose: 'register',
            },
          ],
        },
        {
          id: 'register-method-section',
          kind: 'section',
          icon: 'bi-envelope',
          heading: { EN: 'Your account', EL: 'Ο λογαριασμός σας' },
          description: {
            EN: 'Prefer a traditional account? Create one with your email and a password.',
            EL: 'Προτιμάτε έναν συμβατικό λογαριασμό; Δημιουργήστε τον με το Email και έναν κωδικό πρόσβασης.',
          },
          children: [
            {
              id: 'register-email-method',
              kind: 'email-method',
              label: { EN: 'Register with Email', EL: 'Εγγραφή με Email' },
              description: { EN: 'Email and password', EL: 'Email και κωδικός πρόσβασης' },
              actionId: 'showEmail',
            },
            {
              id: 'register-security-note',
              kind: 'note',
              icon: 'bi-shield-check',
              text: {
                EN: 'Your credentials stay and can be complemented by external providers later.',
                EL: 'Τα στοιχεία σύνδεσής σας διατηρούνται και μπορείτε αργότερα να προσθέσετε εξωτερικούς παρόχους.',
              },
            },
          ],
        },
        { id: 'register-methods-notice', kind: 'notice' },
      ],
      actions: [
        {
          id: 'cancel',
          label: { EN: 'Cancel', EL: 'Άκυρον' },
          type: 'button',
        },
      ],
    },

    {
      id: 'email',
      title: {
        title: { EN: 'Register with Email', EL: 'Εγγραφή με Email' },
        subtitle: {
          EN: 'Create your account with an email address and password.',
          EL: 'Δημιουργήστε λογαριασμό με Email και κωδικό πρόσβασης.',
        },
        icon: 'bi-envelope-plus',
      },
      content: [
        {
          id: 'register-email-intro',
          kind: 'intro',
          page: { folder: 'auth', name: 'RegisterEmail' },
        },
        {
          id: 'register-account-details',
          kind: 'section',
          icon: 'bi-person-vcard',
          heading: { EN: 'Account details', EL: 'Λεπτομέρειες λογαριασμού' },
          children: [
            {
              id: 'register-credentials',
              kind: 'auth-credentials',
              mode: 'register',
              fieldIds: ['username', 'email', 'password', 'confirmPassword'],
            },
          ],
        },
        { id: 'register-notice', kind: 'notice' },
      ],
      actions: [
        {
          id: 'back',
          label: { EN: 'Back', EL: 'Πίσω' },
          icon: 'bi-arrow-left',
          type: 'button',
          alignment: 'start',
          targetTab: 'methods',
        },
        {
          id: 'cancel',
          label: { EN: 'Cancel', EL: 'Άκυρον' },
          type: 'button',
        },
        {
          id: 'createAccount',
          label: { EN: 'Create account', EL: 'Δημιουργία λογαριασμού' },
          icon: 'bi-person-plus',
          type: 'submit',
          enabledWhen: '#state.rules.canCreateAccount',
        },
      ],
    },
  ],
} as const satisfies UiPopupDefinition;

export const AUTH_POPUP_DEFINITIONS = {
  'auth.signin': SIGN_IN_POPUP,
  'auth.register': REGISTER_POPUP,
} as const;

export function getAuthPopupDefinition(id: keyof typeof AUTH_POPUP_DEFINITIONS): UiPopupDefinition {
  return AUTH_POPUP_DEFINITIONS[id];
}
