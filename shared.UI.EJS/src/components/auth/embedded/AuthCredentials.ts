import { createNativeElement } from '../../native-template.js';
import { AuthCredentialField } from './AuthCredentialField.js';
import { AuthPasswordGuidance } from './AuthPasswordGuidance.js';
import { type UiPopupContentDefinition, UiPopupRuntime, multilingual } from '@manatos/shared-ui';

/**
 * EJS counterpart of NG1's embedded AuthCredentials.
 * Native inputs are the sole owners of secret bytes; only nonsecret validation
 * facts are projected to the one popup CTX runtime. The parent owns teardown.
 * UIS ownership: arrange declared Fields/Columns and project ONLY safe validation
 * facts. AuthCredentialField owns each native input, label and visibility;
 * AuthPasswordGuidance owns rule display. Never flatten those child actions
 * back into this coordinator or publish raw passwords to CTX.
 */
export class AuthCredentials {
  private readonly fieldOwner: AuthCredentialField;
  private readonly guidanceOwner: AuthPasswordGuidance;
  constructor(private readonly language: () => 'EN' | 'EL') {
    this.fieldOwner = new AuthCredentialField(language);
    this.guidanceOwner = new AuthPasswordGuidance(language);
  }

  /** Delegate native field text to the Field owner without remounting.
   * Only the parent-owned password recovery action is translated here.
   * The underlying input elements retain their secret bytes throughout.
   */
  refreshLanguage(element: HTMLElement, runtime: UiPopupRuntime): void {
    this.fieldOwner.refreshLanguage(element, runtime);
    for (const reminder of element.querySelectorAll<HTMLButtonElement>(
      '[data-ejs-password-reminder]',
    )) {
      reminder.textContent = multilingual(this.language(), []).resolve('@CM.AuthPasswordReminder');
    }
  }

  append(
    item: Extract<UiPopupContentDefinition, { kind: 'auth-credentials' }>,
    parent: HTMLElement,
    popup: UiPopupRuntime,
    inputs: Map<string, HTMLInputElement>,
    render: () => void,
    tabId: string = popup.activeTab.id,
  ): void {
    const twoColumns = item.mode === 'register' || item.mode === 'reset' || item.mode === 'change';
    // The embedded component owns one #layout node; all its descendants live
    // beneath that node, just as in the NG1 projected component host.
    const container = createNativeElement(
      'AuthCredentials',
      { Id: item.id },
      { Fields: '', Guidance: '' },
    );
    const fieldsClass =
      item.mode === 'signin'
        ? 'auth-signin-fields ejs-auth-credentials-signin'
        : item.mode === 'recovery'
          ? 'auth-password-request-field ejs-auth-credentials-recovery'
          : `auth-registration-fields ejs-auth-credentials-${item.mode}`;
    const fields = createNativeElement(
      'AuthCredentialFields',
      {
        Id: `${tabId}-credentials-fields`,
        Class: `${fieldsClass}${item.mode === 'reset' ? ' is-password-reset' : ''}${item.mode === 'change' ? ' is-password-change' : ''}`,
      },
      { Children: '' },
    );
    const identity = createNativeElement(
      'AuthCredentialColumn',
      {
        Id: `${tabId}-credentials-identity-column`,
        Class: 'auth-registration-identity-column',
      },
      { Children: '' },
    );
    const security = createNativeElement(
      'AuthCredentialColumn',
      {
        Id: `${tabId}-credentials-security-column`,
        Class: 'auth-registration-security-column',
      },
      { Children: '' },
    );
    if (twoColumns) fields.append(identity, security);

    /**
     * NG1's fieldChanged projection, applied to the very same UiPopupRuntime.
     * Password bytes never escape inputs. In particular, matching passwords
     * are a separate CTX fact and must not be folded into native field.valid.
     */
    const publishConfirmation = (): void => {
      if (!item.fieldIds.includes('confirmPassword')) return;
      const confirmation = inputs.get('confirmPassword');
      if (!confirmation) return;
      const password = inputs.get('password')?.value ?? '';
      popup.setSensitiveFacts('confirmPassword', {
        valid: confirmation.validity.valid,
        present: confirmation.value.length > 0,
        length: confirmation.value.length,
        matches: password.length > 0 && password === confirmation.value,
      });
    };

    const updateRecoveryValidity = (input: HTMLInputElement): boolean => {
      const value = input.value.trim();
      const valid = value.includes('@')
        ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
        : value.length >= 2;
      input.setCustomValidity(
        valid || !value ? '' : multilingual(this.language(), []).resolve('@CM.AuthRecoveryInvalid'),
      );
      return valid;
    };

    const project = (id: string, input: HTMLInputElement): void => {
      if (!item.fieldIds.includes(id)) return;
      const definition = popup.definition.fields.find((field) => field.id === id);
      if (!definition) throw new Error(`Credential field '${id}' is not declared.`);
      if (!definition.sensitive) {
        if (id === 'recoveryIdentity') {
          popup.setFieldValue(id, input.value, updateRecoveryValidity(input));
        } else {
          popup.setFieldValue(id, input.value, input.validity.valid);
        }
        return;
      }
      if (id === 'currentPassword') {
        popup.setSensitiveFacts(id, {
          valid: true,
          present: input.value.length > 0,
          length: input.value.length,
        });
      } else if (id === 'password') {
        const value = input.value;
        popup.setSensitiveFacts('password', {
          valid: input.validity.valid,
          present: value.length > 0,
          length: value.length,
          lengthValid: value.length >= (definition.minLength ?? 0),
          hasAlpha: definition.requiresAlpha !== true || /[A-Za-z]/.test(value),
          hasNumber: definition.requiresNumber !== true || /[0-9]/.test(value),
          hasSymbol: definition.requiresSymbol !== true || /[^A-Za-z0-9]/.test(value),
        });
        publishConfirmation();
      } else if (id === 'confirmPassword') {
        publishConfirmation();
      }
    };

    for (const id of item.fieldIds) {
      const definition = popup.definition.fields.find((field) => field.id === id);
      if (!definition) continue;
      const wrapper = this.fieldOwner.mount(
        id,
        definition,
        tabId,
        popup,
        item,
        inputs,
        project,
        render,
        updateRecoveryValidity,
      );
      if (twoColumns) {
        (id === 'username' || id === 'email' ? identity : security).append(wrapper);
      } else fields.append(wrapper);
    }
    container.append(fields);

    if (item.mode === 'signin') {
      const reminder = createNativeElement('AuthCredentialRecoveryAction', {
        Id: `${tabId}-password-recovery`,
        Text: multilingual(this.language(), []).resolve('@CM.AuthPasswordReminder'),
      }) as HTMLButtonElement;
      reminder.addEventListener('click', () => {
        if (!popup.level.state.busy && item.recoveryActionId)
          popup.requestAction(item.recoveryActionId);
      });
      fields.append(reminder);
    }

    if (item.mode === 'recovery') {
      const help = createNativeElement('AuthCredentialRecoveryHelp', {
        Id: `${tabId}-field-recoveryIdentity-help`,
        Text: multilingual(this.language(), []).resolve('@CM.AuthRecoveryPrivacy'),
      });
      const feedback = createNativeElement('AuthCredentialRecoveryFeedback', {
        Id: `${tabId}-field-recoveryIdentity-feedback`,
        Text: multilingual(this.language(), []).resolve('@CM.AuthRecoveryInvalid'),
      });
      const wrapper = fields.querySelector<HTMLElement>(
        `[data-popup-layout-id="${tabId}-field-recoveryIdentity"]`,
      );
      (wrapper ?? fields).append(feedback, help);
    }

    if (twoColumns) {
      this.guidanceOwner.append(container, tabId, inputs, popup);
    }
    parent.append(container);
  }
}
