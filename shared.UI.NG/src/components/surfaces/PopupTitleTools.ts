import { multilingual } from '@manatos/shared-ui';
import { Component, HostListener, input, output, signal, computed } from '@angular/core';

import type { UiLanguageDefinition } from '@manatos/shared-ui';

import { FontScale } from '../preferences/FontScale';
import { LanguageSelection } from '../preferences/LanguageSelection';
import { SurfaceAction } from './SurfaceAction';

/**
 * Reusable functional-popup toolbar.
 *
 * LanguageSelection is optional and operational.
 * Language changes are delegated to the owning application,
 * which updates its canonical ApplicationState.
 *
 * The debugger action toggles whether the existing debugger
 * is allowed above the owning functional popup.
 * The actual foreground state belongs to the application host.
 *
 * FontScale is operational and remains independently
 * controlled by the owning popup.
 *
 * Close belongs to PopupTitle, outside this toolbar.
 */
@Component({
  selector: 'manatos-popup-title-tools, manatos-surface-title-tools',
  standalone: true,
  imports: [LanguageSelection, SurfaceAction, FontScale],
  templateUrl: './PopupTitleTools.html',
  styleUrl: './PopupTitleTools.css',
})
export class PopupTitleTools {
  protected readonly multilingual = computed(() =>
    multilingual(this.currentLanguage()?.id === 'el' ? 'EL' : 'EN', []),
  );

  readonly showLanguageSelection = input(false);
  readonly languages = input<readonly UiLanguageDefinition[]>([]);
  readonly currentLanguage = input<UiLanguageDefinition | null>(null);
  readonly fontScalePercent = input(100);
  readonly showFontScale = input(true);
  readonly hostKind = input<'page' | 'popup'>('popup');
  readonly debuggerForeground = input(false);
  readonly debuggerAllowed = input(false);
  readonly flowStepPath = input<string | null>(null);

  readonly languageSelected = output<string>();
  readonly fontScaleChanged = output<number>();
  readonly debuggerRequested = output<void>();
  readonly flowDebuggerRequested = output<string>();

  protected readonly languageOpen = signal(false);

  protected toggleLanguage(): void {
    if (this.languageOpen()) {
      this.languageOpen.set(false);
      return;
    }
    // Popup language menus must also close any existing portaled selector.
    window.dispatchEvent(new CustomEvent('manatos:navigation-menu-open'));
    this.languageOpen.set(true);
  }

  protected selectLanguage(languageId: string): void {
    this.languageOpen.set(false);
    this.languageSelected.emit(languageId);
  }

  @HostListener('window:manatos:transient-menu-open')
  @HostListener('window:manatos:navigation-menu-open')
  protected closeLanguageOnOtherMenu(): void {
    this.languageOpen.set(false);
  }

  @HostListener('document:click')
  protected closeLanguageDropdown(): void {
    this.languageOpen.set(false);
  }
}
