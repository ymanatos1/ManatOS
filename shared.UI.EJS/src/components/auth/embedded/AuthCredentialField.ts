import { createNativeElement } from '../../native-template.js';
import {
  multilingual,
  type UiPopupFieldDefinition,
  type UiPopupCredentialsDefinition,
  type UiPopupRuntime,
} from '@manatos/shared-ui';

/**
 * One EJS native credential Field owns label/input composition, browser
 * constraints, password visibility and the native input listener. Credentials
 * remain in the actual input, never in popup #data; cross-field facts and
 * semantic submission are deliberately delegated to AuthCredentials/popup.
 * Debug: mount() for real input + visibility; input listener for projection.
 * Do not reconstruct the input on language change (that would lose secrets).
 */
export class AuthCredentialField {
  constructor(private readonly language: () => 'EN' | 'EL') {}

  /** Field-local text refresh: this never replaces a native input or stores
   * its value in CTX. Password visibility remains synchronized by the input's
   * own 'manatos-language-change' listener installed in mount().
   */
  refreshLanguage(element: HTMLElement, runtime: UiPopupRuntime): void {
    for (const label of element.querySelectorAll<HTMLElement>('[data-popup-label]')) {
      const field = runtime.definition.fields.find(
        (entry) => entry.id === label.dataset['popupLabel'],
      );
      if (field) label.textContent = multilingual(this.language(), []).resolve(field.label);
    }
    for (const input of element.querySelectorAll<HTMLInputElement>('[data-ejs-credential-id]')) {
      input.dispatchEvent(new Event('manatos-language-change'));
    }
    for (const help of element.querySelectorAll<HTMLElement>('[data-ejs-recovery-help]')) {
      help.textContent = multilingual(this.language(), []).resolve('@CM.AuthRecoveryPrivacy');
    }
    for (const feedback of element.querySelectorAll<HTMLElement>('[data-ejs-recovery-feedback]')) {
      feedback.textContent = multilingual(this.language(), []).resolve('@CM.AuthRecoveryInvalid');
    }
  }

  mount(
    id: string,
    definition: UiPopupFieldDefinition,
    tabId: string,
    popup: UiPopupRuntime,
    item: UiPopupCredentialsDefinition,
    inputs: Map<string, HTMLInputElement>,
    project: (id: string, input: HTMLInputElement) => void,
    render: () => void,
    updateRecoveryValidity: (input: HTMLInputElement) => boolean,
  ): HTMLElement {
    const wrapper = createNativeElement(
      'AuthCredentialField',
      {
        Id: `${tabId}-field-${id}`,
      },
      { Label: '', Input: '', Feedback: '' },
    );
    // AuthCredentialLabel/Input templates own DOM structure; this Field owns
    // browser constraints, visibility and native event listeners.
    const inputId = `ejs-${popup.instanceId}-${tabId}-${id}`;
    const label = createNativeElement('AuthCredentialLabel', {
      Field: id,
      Id: `${tabId}-field-${id}-label`,
      InputId: inputId,
      Label: multilingual(this.language(), []).resolve(definition.label),
    });
    const input = createNativeElement('AuthCredentialInput', {
      InputId: inputId,
      Field: id,
      Type: definition.type,
      Id: `${tabId}-field-${id}-input`,
      Autocomplete: definition.autocomplete,
    }) as HTMLInputElement;
    if (id === 'identity') input.classList.add('identity-input');
    if (id === 'password' && item.mode === 'signin') input.classList.add('password-input');
    const previous = inputs.get(id);
    if (previous) {
      input.value = previous.value;
      if (definition.sensitive && previous.type === 'text') input.type = 'text';
    }
    input.required = definition.required;
    if (definition.minLength !== undefined) input.minLength = definition.minLength;
    inputs.set(id, input);
    wrapper.append(label);
    if (definition.sensitive) {
      const visibilityField = createNativeElement(
        'AuthCredentialPasswordVisibility',
        { Field: id },
        { Input: '' },
      );
      const toggle = visibilityField.querySelector<HTMLButtonElement>(
        '[data-ejs-password-visibility]',
      );
      const icon = toggle?.querySelector<HTMLElement>('i');
      if (!toggle || !icon)
        throw new Error('AuthCredentialPasswordVisibility template is incomplete.');
      visibilityField.insertBefore(input, toggle);
      const syncVisibility = (): void => {
        const shown = input.type === 'text';
        icon.classList.toggle('bi-eye', !shown);
        icon.classList.toggle('bi-eye-slash', shown);
        toggle.setAttribute('aria-pressed', String(shown));
        toggle.setAttribute(
          'aria-label',
          multilingual(this.language(), []).select(
            shown,
            id === 'confirmPassword'
              ? '@CM.AuthHideConfirmation'
              : id === 'currentPassword'
                ? '@CM.AuthHideCurrentPassword'
                : '@CM.AuthHidePassword',
            id === 'confirmPassword'
              ? '@CM.AuthShowConfirmation'
              : id === 'currentPassword'
                ? '@CM.AuthShowCurrentPassword'
                : '@CM.AuthShowPassword',
          ),
        );
      };
      toggle.addEventListener('click', () => {
        input.type = input.type === 'password' ? 'text' : 'password';
        syncVisibility();
        input.focus();
      });
      input.addEventListener('manatos-language-change', syncVisibility);
      syncVisibility();
      visibilityField.append(toggle);
      wrapper.append(visibilityField);
    } else wrapper.append(input);
    input.addEventListener('input', () => {
      project(id, input);
      render();
    });
    if (id === 'recoveryIdentity')
      input.addEventListener('manatos-language-change', () => updateRecoveryValidity(input));
    return wrapper;
  }
}
