import { multilingual } from '@manatos/shared-ui';
import { Component, input, output, signal, computed } from '@angular/core';

import {
  type UiLanguageDefinition,
  type UiMenuItem,
  type UiNavigationItem,
} from '@manatos/shared-ui';

import { FontScale } from '../preferences/FontScale';
import { PrimaryNavigationItem } from './PrimaryNavigationItem';
import { LanguageSelection } from '../preferences/LanguageSelection';

@Component({
  selector: 'manatos-primary-navigation',
  standalone: true,
  imports: [PrimaryNavigationItem, FontScale, LanguageSelection],
  templateUrl: './PrimaryNavigation.html',
  styleUrl: './PrimaryNavigation.css',
})
export class PrimaryNavigation {
  protected readonly multilingual = computed(() =>
    multilingual(this.currentLanguage().id === 'el' ? 'EL' : 'EN', []),
  );

  readonly items = input.required<readonly UiNavigationItem[]>();
  readonly languages = input.required<readonly UiLanguageDefinition[]>();
  readonly developerItems = input.required<readonly UiMenuItem[]>();
  readonly debuggerAllowed = input(false);
  readonly currentLanguage = input.required<UiLanguageDefinition>();
  readonly fontScalePercent = input.required<number>();

  readonly navigationOpen = input.required<boolean>();
  readonly languageOpen = input.required<boolean>();
  readonly developerOpen = input.required<boolean>();

  readonly navigationOpenRequested = output<void>();
  readonly languageOpenRequested = output<void>();
  readonly developerOpenRequested = output<void>();

  readonly itemSelected = output<UiNavigationItem>();
  readonly languageSelected = output<string>();
  readonly developerItemSelected = output<UiMenuItem>();
  readonly documentationRequested = output<void>();
  readonly fontScaleChanged = output<number>();

  protected readonly openNavigationItemId = signal<string | null>(null);

  protected toggleNavigation(item: UiNavigationItem): void {
    const currentlyOpen = this.navigationOpen() && this.openNavigationItemId() === item.id;

    if (this.navigationOpen() && !currentlyOpen) {
      this.openNavigationItemId.set(item.id);
      return;
    }

    this.openNavigationItemId.set(currentlyOpen ? null : item.id);
    this.navigationOpenRequested.emit();
  }

  protected selectNavigation(item: UiNavigationItem): void {
    this.openNavigationItemId.set(null);
    this.itemSelected.emit(item);
  }

  protected requestLanguageOpen(): void {
    this.openNavigationItemId.set(null);
    this.languageOpenRequested.emit();
  }

  protected toggleDeveloper(event: MouseEvent): void {
    event.stopPropagation();
    this.openNavigationItemId.set(null);
    this.developerOpenRequested.emit();
  }

  protected selectDeveloper(item: UiMenuItem, event: MouseEvent): void {
    event.stopPropagation();
    this.developerItemSelected.emit(item);
  }
}
