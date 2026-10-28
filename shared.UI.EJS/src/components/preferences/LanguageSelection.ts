import { multilingual, type UiLanguageDefinition } from '@manatos/shared-ui';
import { escapeHtml } from '../../rendering/html.js';

export interface LanguageSelectionOptions {
  readonly languages: readonly UiLanguageDefinition[];
  readonly currentLanguage: UiLanguageDefinition;
}

/** EJS PrimaryNavigation selector. The host owns language and dropdown state. */
export function renderLanguageSelection(options: LanguageSelectionOptions): string {
  const current = options.currentLanguage;
  const labels = multilingual(current.id.toUpperCase() === 'EL' ? 'EL' : 'EN', [
    'SelectLanguage',
    'Language',
    'Languages',
  ]);
  return `<div class="primary-navigation-dropdown language-selection" data-shell-menu="language">
    <button type="button" class="primary-navigation-tool primary-navigation-language-toggle"
      data-shell-menu-toggle aria-expanded="false" aria-haspopup="menu"
      aria-label="${escapeHtml(labels.SelectLanguage)}" title="${escapeHtml(labels.Language)}">
      <img class="language-flag" src="/assets/flags/${escapeHtml(current.flag)}.svg" alt="" aria-hidden="true">
      <span>${escapeHtml(current.code)}</span>
      <i class="bi bi-caret-down-fill navigation-caret" aria-hidden="true"></i>
    </button>
    <div class="primary-navigation-menu primary-navigation-tool-menu primary-navigation-language-menu"
      role="menu" aria-label="${escapeHtml(labels.Languages)}" hidden data-shell-menu-popup>
      ${options.languages
        .map(
          (language) => `<button type="button"
        class="${language.id === current.id ? 'active' : ''}" data-language="${escapeHtml(language.id)}"
        title="${escapeHtml(language.nativeName)}" role="menuitem"
        ${language.id === current.id ? 'aria-current="true"' : ''}>
        <img class="language-flag" src="/assets/flags/${escapeHtml(language.flag)}.svg"
          alt="" aria-hidden="true">
        <span>${escapeHtml(language.code)} — ${escapeHtml(language.nativeName)}</span>
      </button>`,
        )
        .join('')}
    </div>
  </div>`;
}

/** NG1-equivalent compact flag/dropdown selector for EJS popup titles. */
export class LanguageSelection {
  constructor(
    private readonly language: () => 'EN' | 'EL',
    private readonly setLanguage: (value: string) => void,
    private readonly languages: readonly UiLanguageDefinition[],
  ) {}

  append(parent: HTMLElement): () => void {
    const root = document.createElement('div');
    root.className = 'ejs-semantic-popup-languages language-selection-popup';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.setAttribute('aria-haspopup', 'menu');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.dataset.ejsPopupLanguageToggle = '';
    const flag = document.createElement('img');
    flag.className = 'language-flag';
    flag.alt = '';
    flag.setAttribute('aria-hidden', 'true');
    const code = document.createElement('span');
    code.dataset.ejsPopupLanguageCode = '';
    const caret = document.createElement('i');
    caret.className = 'bi bi-caret-down-fill navigation-caret';
    caret.setAttribute('aria-hidden', 'true');
    toggle.append(flag, code, caret);
    const menu = document.createElement('div');
    menu.className = 'ejs-popup-language-menu';
    menu.setAttribute('role', 'menu');
    menu.hidden = true;
    for (const language of this.languages) {
      const id = language.id.toUpperCase();
      const nativeName = language.nativeName;
      const choice = document.createElement('button');
      choice.type = 'button';
      choice.setAttribute('role', 'menuitem');
      choice.dataset.ejsPopupLanguage = id;
      const choiceFlag = document.createElement('img');
      choiceFlag.className = 'language-flag';
      choiceFlag.src = `/assets/flags/${language.flag}.svg`;
      choiceFlag.alt = '';
      choiceFlag.setAttribute('aria-hidden', 'true');
      choice.append(choiceFlag, document.createTextNode(`${language.code} — ${nativeName}`));
      choice.addEventListener('click', () => {
        menu.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
        this.setLanguage(id);
        toggle.focus();
      });
      menu.append(choice);
    }
    const positionMenu = (): void => {
      if (menu.hidden) return;
      menu.style.left = '0';
      menu.style.right = 'auto';
      const rect = menu.getBoundingClientRect();
      const viewportWidth = root.ownerDocument.documentElement.clientWidth;
      if (viewportWidth <= 0) return;
      const margin = 8;
      const left = Math.min(
        Math.max(rect.left, margin),
        Math.max(margin, viewportWidth - rect.width - margin),
      );
      menu.style.left = `${Math.round(left - rect.left)}px`;
    };
    const refresh = (): void => {
      const language = this.language();
      const labels = multilingual(language, ['SelectLanguage', 'Language', 'Languages']);
      toggle.title = labels.Language;
      toggle.setAttribute('aria-label', labels.SelectLanguage);
      menu.setAttribute('aria-label', labels.Languages);
      const selected = this.languages.find((item) => item.id.toUpperCase() === language);
      flag.src = `/assets/flags/${selected?.flag ?? language.toLowerCase()}.svg`;
      code.textContent = selected?.code ?? language;
      for (const button of menu.querySelectorAll<HTMLButtonElement>('button')) {
        const selected = button.dataset['ejsPopupLanguage'] === language;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-current', selected ? 'true' : 'false');
      }
    };
    toggle.addEventListener('click', () => {
      menu.hidden = !menu.hidden;
      toggle.setAttribute('aria-expanded', String(!menu.hidden));
      positionMenu();
    });
    root.addEventListener('focusout', (event) => {
      if (event.relatedTarget instanceof Node && root.contains(event.relatedTarget)) return;
      menu.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
    });
    root.append(toggle, menu);
    parent.append(root);
    const view = root.ownerDocument.defaultView;
    view?.addEventListener('resize', positionMenu);
    refresh();
    return () => {
      view?.removeEventListener('resize', positionMenu);
    };
  }
}
