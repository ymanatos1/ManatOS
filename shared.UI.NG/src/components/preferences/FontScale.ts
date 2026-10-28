import { Component, computed, input, output } from '@angular/core';
import type { MetadataLanguage } from '@manatos/shared';

import {
  multilingual,
  MAX_UI_FONT_SCALE_PERCENT,
  MIN_UI_FONT_SCALE_PERCENT,
  UI_FONT_SCALE_STEP_PERCENT,
} from '@manatos/shared-ui';

@Component({
  selector: 'manatos-font-scale',
  standalone: true,
  templateUrl: './FontScale.html',
  styleUrl: './FontScale.css',
})
export class FontScale {
  readonly percent = input.required<number>();
  /** One reusable control for page, popup and CLI text. */
  readonly context = input<'Page' | 'Popup' | 'CLI'>('Page');
  readonly language = input<MetadataLanguage>('EN');
  readonly percentChanged = output<number>();

  protected readonly multilingual = computed(() => {
    const context = this.context();
    const prefix = context === 'CLI' ? 'Cli' : context;
    const suffix = context === 'CLI' ? 'CliFontSize' : 'FontSize';
    return multilingual(
      this.language(),
      {
        size: `@CM.${prefix}FontSize`,
        value: `@CM.${prefix}FontSizeValue`,
        increase: `@CM.Increase${suffix}`,
        decrease: `@CM.Decrease${suffix}`,
        reset: `@CM.Reset${suffix}`,
      },
      { percent: this.percent() },
    );
  });

  protected readonly minPercent = MIN_UI_FONT_SCALE_PERCENT;
  protected readonly maxPercent = MAX_UI_FONT_SCALE_PERCENT;

  protected decrease(): void {
    this.change(-UI_FONT_SCALE_STEP_PERCENT);
  }

  protected increase(): void {
    this.change(UI_FONT_SCALE_STEP_PERCENT);
  }

  protected reset(): void {
    if (this.percent() !== 100) this.percentChanged.emit(100);
  }

  private change(delta: number): void {
    const next = Math.min(
      MAX_UI_FONT_SCALE_PERCENT,
      Math.max(MIN_UI_FONT_SCALE_PERCENT, this.percent() + delta),
    );

    if (next !== this.percent()) this.percentChanged.emit(next);
  }
}
