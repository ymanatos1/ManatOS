/**
 * Static presentation copy used by popup families.
 *
 * Keeping stable popup titles and explanatory paragraphs outside the EJS templates gives the
 * popup layer a small semantic content model instead of scattering user-facing literals across
 * markup. This is deliberately not a translation system yet; it is the seam that a future i18n
 * provider can replace without changing popup layout templates.
 *
 * Runtime-dependent values (for example a validated account name in a password-reset message)
 * remain supplied by the page model and are composed with these static values by the template.
 */
export const popupContent = {
  auth: {
    createAccount: {
      modalTitle: 'Create your account',
      modalSubtitle: 'Choose how you want to join us.',
      contentTitle: 'Welcome!',
      contentParagraphs: [
        'Create a new account using a supported external provider or register directly with your email and password.',
        'You can securely connect additional providers to the same account later.',
      ],
    },
    externalRegistration: {
      modalTitle: 'Create account',
      modalSubtitlePrefix: 'Complete registration with ',
      modalSubtitleSuffix: '.',
      contentTitle: 'Create your account',
      signInContinuationParagraph:
        'Choose a unique user name to create the account, or continue without a password.',
      registrationContinuationParagraph:
        'Choose a unique user name to finish registration. A local password is optional.',
    },
    registerEmail: {
      modalTitle: 'Register with Email',
      modalSubtitle: 'Create your account with an email address and password.',
      contentTitle: 'Create your account',
      contentParagraphs: [
        'Choose a user name and secure your account with your email and password. You can connect supported external providers later.',
      ],
    },
    signIn: {
      modalTitle: 'Sign in',
      modalSubtitle: 'Choose how you want to login.',
      contentTitle: 'Welcome back',
      contentParagraphs: [
        'Continue with a connected external provider or use your user name/email and password.',
        'Either option brings you securely back to the same account.',
      ],
    },
    passwordRequest: {
      modalTitle: 'Forgot or set password',
      modalSubtitle: 'Recover access to your account.',
      contentTitle: 'Recover access to your account',
      contentParagraphs: [
        'Enter your email address or user name.',
        'If an eligible account matches, password instructions will be sent to its registered email address.',
      ],
    },
    passwordReset: {
      modalTitle: 'Set or reset password',
      modalSubtitle: 'Choose a new secure password for your account.',
      contentTitle: 'Create a new password',
      contentParagraphPrefix: 'Enter and confirm a replacement password for ',
      contentParagraphSuffix: ' that satisfies all password rules.',
    },
    passwordLinkUnavailable: {
      modalTitle: 'Password link unavailable',
      modalSubtitle: 'This password link is invalid, expired, or has already been used.',
      contentTitle: 'Request a new link',
      contentParagraphs: [
        'For security, password links are one-time and time-limited. Request new instructions to continue account recovery.',
      ],
    },
    accountPassword: {
      change: {
        modalTitle: 'Change password',
        modalSubtitle: 'Confirm your current password, then choose a new secure password.',
        contentTitle: 'Secure your account',
        contentParagraphs: [
          'Enter your current password and choose a replacement that satisfies all password rules.',
        ],
      },
      set: {
        modalTitle: 'Set password',
        modalSubtitle: 'Create a local password for your account.',
        contentTitle: 'Create your password',
        contentParagraphs: ['Choose and confirm a password that satisfies all password rules.'],
      },
    },
  },
} as const;

export type PopupContent = typeof popupContent;
