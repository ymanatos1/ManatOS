import { Component, ElementRef, computed, input, output, signal, viewChild } from '@angular/core';
import { multilingual, type UiPopupFieldDefinition } from '@manatos/shared-ui';
import type { MetadataLanguage } from '@manatos/shared';
import type { AuthCredentialsMode } from './AuthCredentials';

/**
 * One credential field owns its actual native input, label, browser constraints,
 * visibility toggle and recovery help. AuthCredentials owns cross-field facts and
 * secure submission; it receives only the field ID on input and reads the value
 * transiently from this child's native input. Debug changed.emit() in this control,
 * then AuthCredentials.fieldChanged() and its registered input policy. Never store
 * raw passwords in signals, popup #data, or translation/template projections.
 */
@Component({
  selector: 'div[manatosAuthCredentialField]',
  standalone: true,
  templateUrl: './AuthCredentialField.html',
  styleUrls: ['./AuthCredentials.css', './AuthCredentialField.css'],
})
export class AuthCredentialField {
  readonly fieldId = input.required<string>();
  readonly field = input.required<UiPopupFieldDefinition>();
  readonly mode = input.required<AuthCredentialsMode>();
  readonly tabId = input.required<string>();
  readonly language = input.required<MetadataLanguage>();
  readonly changed = output<string>();

  private readonly native = viewChild<ElementRef<HTMLInputElement>>('nativeInput');
  protected readonly visible = signal(false);
  protected readonly multilingual = computed(() => multilingual(this.language(), []));
  protected readonly password = computed(() =>
    ['currentPassword', 'password', 'confirmPassword'].includes(this.fieldId()),
  );
  protected readonly inputId = computed(() => {
    switch (this.fieldId()) {
      case 'identity':
        return 'ng1-sign-in-identity';
      case 'recoveryIdentity':
        return 'ng1-password-reminder-identity';
      case 'username':
        return 'ng1-registration-name';
      case 'email':
        return 'ng1-registration-email';
      case 'currentPassword':
        return 'ng1-current-password';
      case 'password':
        return this.mode() === 'signin' ? 'ng1-sign-in-password' : 'ng1-registration-password';
      case 'confirmPassword':
        return 'ng1-registration-confirm';
      default:
        throw new Error(`Unknown Auth credential field: ${this.fieldId()}`);
    }
  });
  protected readonly nativeType = computed(() =>
    this.password() ? (this.visible() ? 'text' : 'password') : this.field().type,
  );
  protected readonly visibilityLabel = computed(() => {
    const id = this.fieldId();
    const show =
      id === 'currentPassword'
        ? '@CM.AuthShowCurrentPassword'
        : id === 'confirmPassword'
          ? '@CM.AuthShowConfirmation'
          : '@CM.AuthShowPassword';
    const hide =
      id === 'currentPassword'
        ? '@CM.AuthHideCurrentPassword'
        : id === 'confirmPassword'
          ? '@CM.AuthHideConfirmation'
          : '@CM.AuthHidePassword';
    return this.multilingual().resolve(this.visible() ? hide : show);
  });
  protected readonly layoutId = computed(() => `${this.tabId()}-field-${this.fieldId()}`);

  inputElement(): HTMLInputElement | undefined {
    return this.native()?.nativeElement;
  }
  clear(): void {
    const control = this.inputElement();
    if (control) control.value = '';
    this.visible.set(false);
  }
  protected toggleVisibility(): void {
    this.visible.update((value) => !value);
  }
  protected onInput(): void {
    this.changed.emit(this.fieldId());
  }
}
