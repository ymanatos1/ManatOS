import type { MetadataLanguage } from '@manatos/shared';
import {
  multilingual,
  MAX_UI_FONT_SCALE_PERCENT,
  MIN_UI_FONT_SCALE_PERCENT,
  UI_FONT_SCALE_STEP_PERCENT,
} from '@manatos/shared-ui';

export interface FontScaleOptions {
  percent: number;
  language?: MetadataLanguage;
}

export function renderFontScale(options: FontScaleOptions): string {
  const labels = multilingual(
    options.language ?? 'EN',
    ['PageFontSize', 'PageFontSizeValue', 'IncreaseFontSize', 'ResetFontSize', 'DecreaseFontSize'],
    { percent: options.percent },
  );
  const canDecrease = options.percent > MIN_UI_FONT_SCALE_PERCENT;
  const canIncrease = options.percent < MAX_UI_FONT_SCALE_PERCENT;

  return `
    <div class="font-scale" role="group" aria-label="${labels.PageFontSize}">
      <span
        class="font-scale-value"
        aria-live="polite"
        aria-label="${labels.PageFontSizeValue}"
      >${options.percent}%</span>

      <span class="font-scale-controls">
        <button
          type="button"
          class="font-scale-button"
          title="${labels.IncreaseFontSize}"
          aria-label="${labels.IncreaseFontSize}"
          data-font-scale-delta="${UI_FONT_SCALE_STEP_PERCENT}"
          aria-disabled="${canIncrease ? 'false' : 'true'}"
        >
          <i class="bi bi-caret-up-fill" aria-hidden="true"></i>
        </button>

        <button
          type="button"
          class="font-scale-reset"
          title="${labels.ResetFontSize}"
          aria-label="${labels.ResetFontSize}"
          data-font-scale-reset
        >
          <span aria-hidden="true">●</span>
        </button>

        <button
          type="button"
          class="font-scale-button"
          title="${labels.DecreaseFontSize}"
          aria-label="${labels.DecreaseFontSize}"
          data-font-scale-delta="-${UI_FONT_SCALE_STEP_PERCENT}"
          aria-disabled="${canDecrease ? 'false' : 'true'}"
        >
          <i class="bi bi-caret-down-fill" aria-hidden="true"></i>
        </button>
      </span>
    </div>
  `;
}
