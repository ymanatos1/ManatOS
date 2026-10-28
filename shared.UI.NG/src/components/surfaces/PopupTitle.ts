import { multilingual } from '@manatos/shared-ui';
import { Component, input, output, computed } from '@angular/core';

import type { UiLanguageDefinition } from '@manatos/shared-ui';
import { PopupTitleTools } from './PopupTitleTools';
import { SurfaceAction } from './SurfaceAction';
import { Title } from './Title';

/**
 * Common title for embedded functional popups.
 *
 * Inherits the semantic title model from Title.
 * Delegates its standard toolbar to PopupTitleTools.
 *
 * Close remains separate, rightmost, and is handled by
 * the owning popup so that its lifecycle is preserved.
 */
@Component({
  selector: 'manatos-popup-title',
  standalone: true,
  imports: [Title, PopupTitleTools, SurfaceAction],
  templateUrl: './PopupTitle.html',
  styleUrl: './PopupTitle.css',
})
export class PopupTitle extends Title {
  protected readonly multilingual = computed(() =>
    multilingual(this.currentLanguage()?.id === 'el' ? 'EL' : 'EN', []),
  );

  readonly showCloseButton = input(true);

  readonly showLanguageSelection = input(false);
  readonly languages = input<readonly UiLanguageDefinition[]>([]);
  readonly currentLanguage = input<UiLanguageDefinition | null>(null);
  readonly fontScalePercent = input(100);
  readonly debuggerForeground = input(false);
  readonly debuggerAllowed = input(false);
  readonly flowStepPath = input<string | null>(null);

  readonly languageSelected = output<string>();
  readonly fontScaleChanged = output<number>();
  readonly debuggerRequested = output<void>();
  readonly flowDebuggerRequested = output<string>();
  readonly closeRequested = output<void>();
}
