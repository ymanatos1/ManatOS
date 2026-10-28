import { Component, input, output, signal, computed } from '@angular/core';

import { DEFAULT_UI_THEME, normalizeUiTheme, type UiTheme, multilingual } from '@manatos/shared-ui';

@Component({
  selector: 'manatos-preferences',
  standalone: true,
  templateUrl: './Preferences.html',
  styleUrl: './Preferences.css',
})
export class Preferences {
  protected readonly multilingual = computed(() =>
    multilingual(this.language(), [
      'WebsitePreferences',
      'PersonalizeWebsite',
      'UiTheme',
      'Lighter',
      'LighterDescription',
      'Darker',
      'DarkerDescription',
      'SelectedThemePreview',
      'Header',
      'Title',
      'Text',
      'Date',
      'Enum',
      'Related',
      'Cancel',
      'SavePreferences',
    ] as const),
  );

  readonly language = input<'EN' | 'EL'>('EN');
  readonly theme = input<UiTheme>(DEFAULT_UI_THEME);
  readonly save = output<UiTheme>();

  protected readonly visible = signal(false);
  protected readonly previewTheme = signal<UiTheme>(DEFAULT_UI_THEME);

  open(): void {
    this.previewTheme.set(normalizeUiTheme(this.theme()));
    this.visible.set(true);
  }

  protected selectTheme(theme: UiTheme): void {
    this.previewTheme.set(theme);
  }

  protected cancel(): void {
    this.visible.set(false);
  }

  protected savePreferences(): void {
    this.save.emit(this.previewTheme());
    this.visible.set(false);
  }
}
