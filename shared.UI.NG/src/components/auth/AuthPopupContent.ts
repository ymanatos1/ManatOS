import { NgComponentOutlet } from '@angular/common';
import { Component, computed, input, output, viewChildren } from '@angular/core';
import type {
  UiPageTemplateContext,
  UiPopupContentDefinition,
  UiPopupTabDefinition,
} from '@manatos/shared-ui';
import type { MetadataLanguage } from '@manatos/shared';
import { PopupContext } from '../surfaces/PopupContext';
import { AuthCredentials } from './embedded/AuthCredentials';
import {
  popupContentRenderers,
  PopupCredentialsContent,
  PopupSectionContent,
  PopupEmailMethodContent,
} from './PopupContentRenderers';

/**
 * Auth content composition is a registry-selected capability, not an Auth
 * component-kind switch. Each concrete child owns DOM, focus, state and effects.
 * This component owns only the established intro/sections/tail visual slots.
 */
/** UIS ownership: registered auth content composition and tab/section placement without hiding child templates. Do not collapse registered native auth children into a single dynamic markup factory. */
@Component({
  selector: 'manatos-auth-popup-content',
  standalone: true,
  imports: [NgComponentOutlet],
  templateUrl: './AuthPopupContent.html',
  styleUrls: ['./AuthPopup.css', './RegisterPopup.css'],
})
export class AuthPopupContent {
  readonly tab = input.required<UiPopupTabDefinition>();
  readonly popup = input.required<PopupContext>();
  readonly language = input<MetadataLanguage>('EN');
  readonly contentContext = input<UiPageTemplateContext>({});
  readonly emailMethodRequested = output<string>();
  readonly externalProviderRequested = output<string>();
  readonly passwordRecoveryRequested = output<string>();

  protected readonly introItems = computed(() => this.itemsIn('intro'));
  protected readonly sectionItems = computed(() => this.itemsIn('sections'));
  protected readonly tailItems = computed(() => this.itemsIn('tail'));
  protected readonly methods = computed(
    () =>
      this.tab().id !== 'email' &&
      this.tab().id !== 'passwordReminder' &&
      this.tab().id !== 'reset' &&
      this.tab().id !== 'change',
  );
  protected readonly renderer = (kind: UiPopupContentDefinition['kind']) =>
    popupContentRenderers.resolve(kind);
  private itemsIn(slot: 'intro' | 'sections' | 'tail'): readonly UiPopupContentDefinition[] {
    return this.tab().content.filter((item) => popupContentRenderers.slot(item.kind) === slot);
  }
  protected readonly childInputs = (
    definition: UiPopupContentDefinition,
    columnIndex = 0,
  ): Record<string, unknown> => ({
    definition,
    popup: this.popup(),
    language: this.language(),
    tabId: this.tab().id,
    columnIndex,
    contentContext: this.contentContext(),
    requestEmail: (id: string) => this.emailMethodRequested.emit(id),
    requestProvider: (provider: string) => this.externalProviderRequested.emit(provider),
    requestRecovery: (id: string) => this.passwordRecoveryRequested.emit(id),
  });

  private readonly outlets = viewChildren(NgComponentOutlet);
  private credential(): AuthCredentials | undefined {
    for (const outlet of this.outlets()) {
      const instance = outlet.componentInstance;
      if (instance instanceof PopupCredentialsContent) return instance.credentials;
      if (instance instanceof PopupSectionContent && instance.credentials)
        return instance.credentials;
    }
    return undefined;
  }
  focusFirst(): void {
    for (const outlet of this.outlets()) {
      const instance = outlet.componentInstance;
      if (
        instance instanceof PopupSectionContent ||
        instance instanceof PopupCredentialsContent ||
        instance instanceof PopupEmailMethodContent
      ) {
        if (instance.focusFirst()) return;
      }
    }
  }
  signInValues(): { identity: string; password: string } | null {
    return this.credential()?.signInValues() ?? null;
  }
  registerValues(): { name: string; email: string; password: string; confirmation: string } | null {
    return this.credential()?.registerValues() ?? null;
  }
  resetPasswordValues(): { password: string; confirmation: string } | null {
    return this.credential()?.resetPasswordValues() ?? null;
  }
  changePasswordValues(): {
    currentPassword: string;
    password: string;
    confirmation: string;
  } | null {
    return this.credential()?.changePasswordValues() ?? null;
  }
  resetCredentials(): void {
    this.credential()?.reset();
  }
}
