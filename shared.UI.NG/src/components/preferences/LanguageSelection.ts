import { multilingual } from '@manatos/shared-ui';
import {
  Component,
  ElementRef,
  HostListener,
  ViewChild,
  input,
  output,
  computed,
} from '@angular/core';

import type { UiLanguageDefinition } from '@manatos/shared-ui';

/**
 * Shared language selector for navigation bars and popup titles.
 *
 * Renders the language catalogue, selected language, flag
 * and dropdown. The component does not own language preferences.
 *
 * The hosting surface controls whether the dropdown is open.
 * Selection is reported to the host, which updates the
 * canonical ApplicationState language.
 *
 * The popup variant uses compact toolbar presentation.
 */
@Component({
  selector: 'manatos-language-selection',
  standalone: true,
  templateUrl: './LanguageSelection.html',
  styleUrl: './LanguageSelection.css',
})
export class LanguageSelection {
  protected readonly multilingual = computed(() =>
    multilingual(this.currentLanguage().id === 'el' ? 'EL' : 'EN', []),
  );

  readonly languages = input.required<readonly UiLanguageDefinition[]>();
  readonly currentLanguage = input.required<UiLanguageDefinition>();
  readonly open = input(false);
  readonly variant = input<'navigation' | 'popup'>('navigation');

  readonly openRequested = output<void>();
  readonly languageSelected = output<string>();

  /**
   * Keep the menu left-aligned with its selector by default.
   * Shift it only when necessary to prevent viewport overflow.
   */
  private activeMenu: HTMLElement | null = null;

  @ViewChild('languageMenu')
  set languageMenu(element: ElementRef<HTMLElement> | undefined) {
    this.activeMenu = element?.nativeElement ?? null;
    this.positionMenu();
  }

  @HostListener('window:resize')
  protected onViewportResize(): void {
    this.positionMenu();
  }

  private positionMenu(): void {
    const menu = this.activeMenu;
    if (!menu || typeof window === 'undefined') return;

    // Restore default alignment before measuring.
    menu.style.left = '0';
    menu.style.right = 'auto';

    const rect = menu.getBoundingClientRect();
    const margin = 8;
    const viewportWidth = document.documentElement.clientWidth;

    const left = Math.min(
      Math.max(rect.left, margin),
      Math.max(margin, viewportWidth - rect.width - margin),
    );

    menu.style.left = `${Math.round(left - rect.left)}px`;
  }

  protected toggle(event: MouseEvent): void {
    event.stopPropagation();
    this.openRequested.emit();
  }

  protected select(language: UiLanguageDefinition, event: MouseEvent): void {
    event.stopPropagation();
    this.languageSelected.emit(language.id);
  }

  protected languageFlag(language: UiLanguageDefinition): string {
    return `/assets/flags/${language.flag}.svg`;
  }
}
