import type { UiPopupFieldDefinition } from '@manatos/shared-ui';
import type { PopupContext } from '../../surfaces/PopupContext';

/**
 * Credential Fields own native validation policies; AuthCredentials composes
 * controls and retains their raw values exclusively in browser inputs.
 * NEVER publish passwords or confirmations to CTX, component event payloads,
 * shared generic reducers, diagnostics, or the framework service registry.
 */
export interface AuthCredentialNativeServices {
  readonly popup: PopupContext;
  readonly field: (id: string) => UiPopupFieldDefinition;
  readonly validateRecovery: (input: HTMLInputElement) => boolean;
  readonly publishConfirmation: () => void;
  readonly hasConfirmation: () => boolean;
}

export type AuthCredentialInputPolicy = (
  input: HTMLInputElement,
  services: AuthCredentialNativeServices,
) => void;

const ordinary =
  (id: string): AuthCredentialInputPolicy =>
  (input, services) => {
    if (!services.field(id).sensitive)
      services.popup.setFieldValue(id, input.value, input.validity.valid);
  };

/** Individual, explicitly registered Field policies; no parent field-ID switch. */
export const authCredentialInputPolicies: ReadonlyMap<string, AuthCredentialInputPolicy> = new Map([
  ['identity', ordinary('identity')],
  ['username', ordinary('username')],
  ['email', ordinary('email')],
  [
    'recoveryIdentity',
    (input, services) => {
      if (!services.field('recoveryIdentity').sensitive)
        services.popup.setFieldValue(
          'recoveryIdentity',
          input.value,
          services.validateRecovery(input),
        );
    },
  ],
  [
    'currentPassword',
    (input, services) => {
      services.popup.setSensitiveFacts('currentPassword', {
        valid: true,
        present: input.value.length > 0,
        length: input.value.length,
      });
    },
  ],
  [
    'password',
    (input, services) => {
      const password = input.value;
      const policy = services.field('password');
      services.popup.setSensitiveFacts('password', {
        valid: input.validity.valid,
        present: password.length > 0,
        length: password.length,
        lengthValid: password.length >= (policy.minLength ?? 0),
        hasAlpha: policy.requiresAlpha !== true || /[A-Za-z]/.test(password),
        hasNumber: policy.requiresNumber !== true || /[0-9]/.test(password),
        hasSymbol: policy.requiresSymbol !== true || /[^A-Za-z0-9]/.test(password),
      });
      if (services.hasConfirmation()) services.publishConfirmation();
    },
  ],
  ['confirmPassword', (_input, services) => services.publishConfirmation()],
]);
