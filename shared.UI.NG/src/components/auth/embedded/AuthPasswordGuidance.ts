import { Component, computed, input } from '@angular/core';
import { multilingual, type UiPopupFieldDefinition } from '@manatos/shared-ui';
import type { MetadataLanguage } from '@manatos/shared';
import { PopupContext } from '../../surfaces/PopupContext';

/**
 * PasswordGuidance owns the five visible requirement states and their localized labels,
 * not the credential input or password policy. It reads only allow-listed validation
 * facts projected by AuthCredentials; no raw password enters Angular state or CTX.
 * Debug rules() when native input updates do not refresh an indicator. Do not
 * duplicate password validation or move the secret from the input into this child.
 */
@Component({
  selector: 'div[manatosAuthPasswordGuidance]',
  standalone: true,
  templateUrl: './AuthPasswordGuidance.html',
  styleUrl: './AuthCredentials.css',
})
export class AuthPasswordGuidance {
  readonly popup = input.required<PopupContext>();
  readonly password = input.required<UiPopupFieldDefinition>();
  readonly language = input.required<MetadataLanguage>();
  readonly tabId = input.required<string>();
  protected readonly multilingual = computed(() => multilingual(this.language(), []));
  protected readonly minimumLength = computed(() => this.password().minLength ?? 0);
  protected readonly rules = computed(() => {
    const password = this.popup().field('password');
    const confirmation = this.popup().field('confirmPassword');
    return {
      length: password?.lengthValid === true,
      alpha: password?.hasAlpha === true,
      number: password?.hasNumber === true,
      symbol: password?.hasSymbol === true,
      match: confirmation?.matches === true,
    };
  });
}
