import { renderSurfaceAction } from './SurfaceAction.js';
import {
  multilingual,
  MAX_UI_FONT_SCALE_PERCENT,
  MIN_UI_FONT_SCALE_PERCENT,
  UI_FONT_SCALE_STEP_PERCENT,
} from '@manatos/shared-ui';

/** The popup owns its own scale after inheriting its initial percentage. */
export class PopupTitleTools {
  private fontScale: number;
  private updateControls: (() => void) | null = null;
  private dialog: HTMLElement | null = null;

  constructor(
    initialPercent = 100,
    private readonly language: () => 'EN' | 'EL' = () => 'EN',
  ) {
    this.fontScale = this.normalize(initialPercent);
  }

  private normalize(percent: number): number {
    return Number.isFinite(percent)
      ? Math.max(MIN_UI_FONT_SCALE_PERCENT, Math.min(MAX_UI_FONT_SCALE_PERCENT, percent))
      : 100;
  }

  applyScale(dialog: HTMLElement): void {
    this.dialog = dialog;
    dialog.style.setProperty('--manatos-font-scale', String(this.fontScale / 100));
  }

  /** Change only this popup’s FontScale, without mutating application preferences. */
  setPercent(percent: number): void {
    this.fontScale = this.normalize(percent);
    if (this.dialog) this.applyScale(this.dialog);
    this.updateControls?.();
  }

  refreshLanguage(): void {
    this.updateControls?.();
  }

  appendFontScale(parent: HTMLElement, dialog: HTMLElement): void {
    const doc = parent.ownerDocument;
    const root = doc.createElement('div');
    root.className = 'ejs-semantic-popup-font-scale font-scale';
    root.setAttribute('role', 'group');
    const current = doc.createElement('span');
    current.className = 'font-scale-value';
    current.setAttribute('aria-live', 'polite');
    const controls = doc.createElement('span');
    controls.className = 'font-scale-controls';
    const make = (cssClass: string, icon: string, adjust: () => number): HTMLButtonElement => {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = cssClass;
      const glyph = doc.createElement(icon === '●' ? 'span' : 'i');
      if (icon === '●') glyph.textContent = '●';
      else glyph.className = `bi ${icon}`;
      glyph.setAttribute('aria-hidden', 'true');
      button.append(glyph);
      button.addEventListener('click', () => {
        const next = this.normalize(adjust());
        if (next === this.fontScale) return;
        this.setPercent(next);
      });
      controls.append(button);
      return button;
    };
    const increase = make(
      'font-scale-button',
      'bi-caret-up-fill',
      () => this.fontScale + UI_FONT_SCALE_STEP_PERCENT,
    );
    const reset = make('font-scale-reset', '●', () => 100);
    const decrease = make(
      'font-scale-button',
      'bi-caret-down-fill',
      () => this.fontScale - UI_FONT_SCALE_STEP_PERCENT,
    );
    this.updateControls = (): void => {
      const labels = multilingual(
        this.language(),
        [
          'IncreaseFontSize',
          'ResetFontSize',
          'DecreaseFontSize',
          'PopupFontSize',
          'PopupFontSizeValue',
        ],
        { percent: this.fontScale },
      );
      root.setAttribute('aria-label', labels.PopupFontSize);
      const captions = [labels.IncreaseFontSize, labels.ResetFontSize, labels.DecreaseFontSize];
      [increase, reset, decrease].forEach((button, index) => {
        button.title = captions[index]!;
        button.setAttribute('aria-label', captions[index]!);
      });
      this.applyScale(dialog);
      current.textContent = `${this.fontScale}%`;
      current.setAttribute('aria-label', labels.PopupFontSizeValue);
      increase.disabled = this.fontScale >= MAX_UI_FONT_SCALE_PERCENT;
      decrease.disabled = this.fontScale <= MIN_UI_FONT_SCALE_PERCENT;
    };
    root.append(current, controls);
    parent.append(root);
    this.updateControls();
  }
}

/** Host-neutral debugger buttons shared by Page and popup-compatible titles. */
export function renderSurfaceTitleDebuggerTools(flowPath: string | null = null): string {
  return `<span class="surface-title-debugger-tools" role="group" aria-label="Surface debugger tools">${renderSurfaceAction({ label: 'Inspect Surface in CTX Viewer', icon: 'bi-bug', action: 'reveal-page-ctx' })}${flowPath ? renderSurfaceAction({ label: 'Inspect Surface Flow', icon: 'bi-diagram-3', action: 'reveal-page-flow' }) : ''}</span>`;
}
