import { multilingual } from '@manatos/shared-ui';
import { Component, computed, effect, input, output, viewChildren } from '@angular/core';

import type { UiPopupFieldDefinition } from '@manatos/shared-ui';
import { type MetadataLanguage } from '@manatos/shared';
import { PopupContext } from '../../surfaces/PopupContext';
import { authCredentialInputPolicies } from './AuthCredentialInputPolicies';
import { AuthCredentialField } from './AuthCredentialField';
import { AuthPasswordGuidance } from './AuthPasswordGuidance';

export type AuthCredentialsMode = 'signin' | 'register' | 'recovery' | 'reset' | 'change';

/**
 * Credential coordinator: chooses the mode-specific Field children and owns
 * cross-field validation, secure submission reads and recovery intent. Each
 * AuthCredentialField owns its native control, label, visibility and value;
 * AuthPasswordGuidance owns rule presentation. Only allow-listed facts enter
 * popup CTX. Debug fieldChanged() -> registered policy -> PopupContext.
 * Never flatten child controls here or publish raw passwords to CTX/signals.
 */
@Component({
  selector: 'manatos-auth-credentials',
  standalone: true,
  imports: [AuthCredentialField, AuthPasswordGuidance],
  templateUrl: './AuthCredentials.html',
  styleUrl: './AuthCredentials.css',
})
export class AuthCredentials {
  protected readonly multilingual = computed(() => multilingual(this.language(), []));

  readonly mode = input.required<AuthCredentialsMode>();
  readonly fieldIds = input.required<readonly string[]>();
  readonly tabId = input.required<string>();
  readonly popup = input.required<PopupContext>();
  readonly language = input<MetadataLanguage>('EN');

  readonly passwordRecoveryRequested = output<string>();
  readonly recoveryActionId = input<string | null>(null);

  constructor() {
    // Native browser validation must follow language changes without exposing
    // credentials or rewriting the popup's canonical field state.
    effect(() => {
      this.language();
      const input = this.element('recoveryIdentity');
      if (input) this.updateRecoveryValidity(input);
    });
  }

  private readonly fields = viewChildren(AuthCredentialField);

  /**
   * Field declarations come exclusively from shared.UI.
   * A field not declared for this component cannot be rendered.
   */
  protected field(id: string): UiPopupFieldDefinition {
    const definition = this.popup().definition.fields.find((item) => item.id === id);

    if (!definition || !this.fieldIds().includes(id)) {
      throw new Error(`Credential field '${id}' is not declared for this popup component.`);
    }

    return definition;
  }

  protected hasField(id: string): boolean {
    return this.fieldIds().includes(id);
  }

  protected layoutId(id: string): string {
    return `${this.tabId()}-field-${id}`;
  }

  focusFirst(): void {
    const first = this.fields()
      .map((field) => field.inputElement())
      .filter((input): input is HTMLInputElement => input !== undefined)
      .find((input) => !input.disabled && !input.hidden && input.type !== 'hidden');

    first?.focus();
  }

  /**
   * Read native inputs at submission time only.
   * Never publish the password into CTX or an Angular signal.
   */
  signInValues(): { identity: string; password: string } | null {
    if (this.mode() !== 'signin') return null;

    const identity = this.element('identity')?.value.trim();
    const password = this.element('password')?.value;

    return identity && password ? { identity, password } : null;
  }

  /** Registration credentials remain only in native controls until submitted. */
  registerValues(): { name: string; email: string; password: string; confirmation: string } | null {
    if (this.mode() !== 'register') return null;
    const name = this.element('username')?.value.trim();
    const email = this.element('email')?.value.trim();
    const password = this.element('password')?.value;
    const confirmation = this.element('confirmPassword')?.value;
    return name && email && password && confirmation
      ? { name, email, password, confirmation }
      : null;
  }

  /** Protected transient input for the emailed-link password-reset Flow. */
  resetPasswordValues(): { password: string; confirmation: string } | null {
    if (this.mode() !== 'reset' && this.mode() !== 'register') return null;
    const password = this.element('password')?.value;
    const confirmation = this.element('confirmPassword')?.value;
    return password && confirmation ? { password, confirmation } : null;
  }

  changePasswordValues(): {
    currentPassword: string;
    password: string;
    confirmation: string;
  } | null {
    if (this.mode() !== 'change') return null;
    const password = this.element('password')?.value;
    const confirmation = this.element('confirmPassword')?.value;
    return password && confirmation
      ? {
          currentPassword: this.element('currentPassword')?.value ?? '',
          password,
          confirmation,
        }
      : null;
  }

  /** Each credential Field's registered policy owns its native input semantics. */
  protected fieldChanged(fieldId: string): void {
    const element = this.element(fieldId);
    if (!element) return;
    // Undeclared fields cannot publish facts or access another component's inputs.
    this.field(fieldId);
    const policy = authCredentialInputPolicies.get(fieldId);
    if (!policy) throw new Error(`Unregistered Auth credential: ${fieldId}`);
    policy(element, {
      popup: this.popup(),
      field: (id) => this.field(id),
      validateRecovery: (input) => this.updateRecoveryValidity(input),
      publishConfirmation: () => this.publishConfirmation(),
      hasConfirmation: () => this.hasField('confirmPassword'),
    });
  }

  private updateRecoveryValidity(element: HTMLInputElement): boolean {
    const value = element.value.trim();
    const valid = value.includes('@')
      ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      : value.length >= 2;
    element.setCustomValidity(
      valid || !value ? '' : this.multilingual().resolve('@CM.AuthRecoveryInvalid'),
    );
    return valid;
  }

  reset(): void {
    for (const field of this.fields()) field.clear();
  }

  protected requestPasswordRecovery(): void {
    const action = this.recoveryActionId();
    if (action) this.passwordRecoveryRequested.emit(action);
  }

  private publishConfirmation(): void {
    const confirm = this.element('confirmPassword');
    if (!confirm) return;

    const password = this.element('password')?.value ?? '';

    this.popup().setSensitiveFacts('confirmPassword', {
      valid: confirm.validity.valid,
      present: confirm.value.length > 0,
      length: confirm.value.length,
      matches: password.length > 0 && password === confirm.value,
    });
  }

  /** Read a declared child's native input transiently; no credential mirror. */
  private element(fieldId: string): HTMLInputElement | undefined {
    return this.fields()
      .find((field) => field.fieldId() === fieldId)
      ?.inputElement();
  }
}
