import {
  multilingual,
  type UiLanguageDefinition,
  type UiPopupTitleDefinition,
} from '@manatos/shared-ui';
import { LanguageSelection } from '../preferences/LanguageSelection.js';
import { PopupTitleTools } from './PopupTitleTools.js';
import { Title, type TitleOptions } from './Title.js';

export type PopupTitleOptions = TitleOptions;
type PopupTabTitle = UiPopupTitleDefinition;
type PopupLanguage = 'EN' | 'EL';

export interface PopupTitleMountOptions {
  readonly title: PopupTabTitle;
  readonly language: () => PopupLanguage;
  readonly selectLanguage?: (language: string) => void;
  readonly leadingControl?: HTMLElement;
  readonly languages: readonly UiLanguageDefinition[];
  readonly showLanguageSelection: boolean;
  readonly showClose: boolean;
  readonly showFontScale: boolean;
  readonly initialFontScalePercent: number;
  readonly showDebugger: boolean;
  readonly flowStepPath?: string;
  readonly debuggerRequested: () => void;
  readonly flowDebuggerRequested: () => void;
  readonly closeRequested: () => void;
}

export interface MountedPopupTitle {
  readonly element: HTMLElement;
  updateTitle(title: PopupTabTitle): void;
  updateLanguage(): void;
  updateDebugger(allowed: boolean, foreground: boolean): void;
  updateFontScale(percent: number): void;
  updateBusy(busy: boolean): void;
  dispose(): void;
}

/**
 * One functional popup title, composed with the same semantic responsibilities
 * as NG1 PopupTitle/PopupTitleTools. This component owns only presentation,
 * never the popup's CTX, Flow action, native form fields, or lifecycle stack.
 */
export class PopupTitle extends Title {
  protected override classes(): string {
    return `${super.classes()} popup-title`;
  }

  static mount(dialog: HTMLElement, options: PopupTitleMountOptions): MountedPopupTitle {
    const doc = dialog.ownerDocument;
    const header = doc.createElement('header');
    header.className = 'ejs-semantic-popup-header popup-title';
    header.dataset.popupLayoutId = 'popup-title';

    const main = doc.createElement('div');
    main.className = 'ejs-popup-title-main';
    const icon = doc.createElement('i');
    icon.setAttribute('aria-hidden', 'true');
    const copy = doc.createElement('div');
    copy.className = 'ejs-popup-title-copy';
    const heading = doc.createElement('h2');
    const subtitle = doc.createElement('p');
    copy.append(heading, subtitle);
    main.append(icon, copy);
    header.append(main);

    const controls = doc.createElement('div');
    controls.className = 'ejs-popup-title-controls';
    controls.setAttribute('role', 'group');
    header.append(controls);
    if (options.leadingControl) controls.append(options.leadingControl);
    const disposeLanguageSelection =
      options.showLanguageSelection && options.selectLanguage
        ? new LanguageSelection(options.language, options.selectLanguage, options.languages).append(
            controls,
          )
        : null;

    const button = (iconClass: string, click: () => void): HTMLButtonElement => {
      const element = doc.createElement('button');
      element.type = 'button';
      element.className = 'ejs-semantic-popup-debugger';
      const glyph = doc.createElement('i');
      glyph.className = `bi ${iconClass}`;
      glyph.setAttribute('aria-hidden', 'true');
      element.append(glyph);
      element.addEventListener('click', click);
      return element;
    };
    let debuggerAllowed = true;
    const debuggerButton = options.showDebugger
      ? button('bi-bug', () => {
          if (debuggerAllowed) options.debuggerRequested();
        })
      : null;
    if (debuggerButton) {
      debuggerButton.dataset.ejsPopupDebugger = '';
      controls.append(debuggerButton);
    }
    const flowButton =
      options.showDebugger && options.flowStepPath
        ? button('bi-diagram-3', () => {
            if (debuggerAllowed) options.flowDebuggerRequested();
          })
        : null;
    if (flowButton) {
      flowButton.dataset.ejsPopupFlowDebugger = '';
      controls.append(flowButton);
    }

    const scale = new PopupTitleTools(options.initialFontScalePercent, options.language);
    scale.applyScale(dialog);
    if (options.showFontScale) scale.appendFontScale(controls, dialog);

    const close = doc.createElement('button');
    close.type = 'button';
    close.className = 'ejs-semantic-popup-x';
    const closeIcon = doc.createElement('i');
    closeIcon.className = 'bi bi-x-lg';
    closeIcon.setAttribute('aria-hidden', 'true');
    close.append(closeIcon);
    close.hidden = !options.showClose;
    close.addEventListener('click', options.closeRequested);
    controls.append(close);
    dialog.prepend(header);

    const uiText = () =>
      multilingual(options.language(), [
        'PopupTools',
        'Language',
        'SelectLanguage',
        'Languages',
        'ClosePopup',
        'DebuggerBehindPopup',
        'DebuggerInFrontOfPopup',
        'InspectOpeningFlowStep',
      ]);
    const updateTitle = (title: PopupTabTitle): void => {
      icon.className = `bi ${title.icon}`;
      heading.textContent = uiText().resolve(title.title);
      subtitle.textContent = uiText().resolve(title.subtitle);
    };
    const updateLanguage = (): void => {
      const labels = uiText();
      controls.setAttribute('aria-label', labels.PopupTools);
      for (const choice of controls.querySelectorAll<HTMLButtonElement>(
        '[data-ejs-popup-language]',
      )) {
        const selected = choice.dataset['ejsPopupLanguage'] === options.language();
        choice.setAttribute('aria-pressed', String(selected));
        choice.setAttribute('aria-current', String(selected));
        choice.classList.toggle('active', selected);
      }
      const code = controls.querySelector<HTMLElement>('[data-ejs-popup-language-code]');
      if (code) code.textContent = options.language();
      const flag = controls.querySelector<HTMLImageElement>('[data-ejs-popup-language-toggle] img');
      if (flag) flag.src = `/assets/flags/${options.language().toLowerCase()}.svg`;
      const languageToggle = controls.querySelector<HTMLButtonElement>(
        '[data-ejs-popup-language-toggle]',
      );
      if (languageToggle) {
        languageToggle.title = labels.Language;
        languageToggle.setAttribute('aria-label', labels.SelectLanguage);
      }
      controls
        .querySelector<HTMLElement>('.ejs-popup-language-menu')
        ?.setAttribute('aria-label', labels.Languages);
      const closeLabel = labels.ClosePopup;
      close.title = closeLabel;
      close.setAttribute('aria-label', closeLabel);
      scale.refreshLanguage();
      updateDebugger(debuggerAllowed, debuggerButton?.getAttribute('aria-pressed') === 'true');
    };
    const updateDebugger = (allowed: boolean, foreground: boolean): void => {
      debuggerAllowed = allowed;
      if (debuggerButton) {
        debuggerButton.hidden = !allowed;
        debuggerButton.setAttribute('aria-pressed', String(allowed && foreground));
        const label = uiText().select(
          foreground,
          '@CM.DebuggerBehindPopup',
          '@CM.DebuggerInFrontOfPopup',
        );
        debuggerButton.title = label;
        debuggerButton.setAttribute('aria-label', label);
      }
      if (flowButton) {
        flowButton.hidden = !allowed;
        flowButton.removeAttribute('aria-pressed');
        const label = uiText().InspectOpeningFlowStep;
        flowButton.title = label;
        flowButton.setAttribute('aria-label', label);
      }
    };
    updateTitle(options.title);
    updateLanguage();
    updateDebugger(true, false);
    return {
      element: header,
      dispose: () => disposeLanguageSelection?.(),
      updateTitle,
      updateLanguage,
      updateDebugger,
      updateFontScale: (percent) => scale.setPercent(percent),
      updateBusy: (busy) => {
        close.disabled = busy;
      },
    };
  }
}

export function renderPopupTitle(options: PopupTitleOptions): string {
  return new PopupTitle(options).render();
}
