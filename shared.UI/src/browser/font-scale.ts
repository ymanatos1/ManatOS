import { normalizeUiFontScalePercent } from '../preferences/ui-preferences.js';

export const UI_FONT_SCALE_CSS_VARIABLE = '--manatos-font-scale';

export function uiFontScaleFactor(fontScalePercent: number): number {
  return normalizeUiFontScalePercent(fontScalePercent) / 100;
}

export function applyDocumentFontScale(document: Document, fontScalePercent: number): void {
  document.documentElement.style.setProperty(
    UI_FONT_SCALE_CSS_VARIABLE,
    String(uiFontScaleFactor(fontScalePercent)),
  );
}
