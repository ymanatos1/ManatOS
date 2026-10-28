import { resolveMetadataText } from '@manatos/shared';
import {
  type UiLanguageDefinition,
  type UiMenuItem,
  type UiNavigationItem,
} from '@manatos/shared-ui';

import { escapeHtml, safeIconClass } from '../../rendering/html.js';
import { renderPrimaryNavigationItem } from './PrimaryNavigationItem.js';

import { renderFontScale } from '../preferences/FontScale.js';
import { renderLanguageSelection } from '../preferences/LanguageSelection.js';

export interface PrimaryNavigationOptions {
  items: readonly UiNavigationItem[];
  languages: readonly UiLanguageDefinition[];
  developerItems: readonly UiMenuItem[];
  currentLanguage: UiLanguageDefinition;
  fontScalePercent: number;
  /** Same permission gate used by NG1 for the developer menu. */
  debuggerAllowed?: boolean;
}

export function renderPrimaryNavigation(options: PrimaryNavigationOptions): string {
  const language = options.currentLanguage.id.toUpperCase() === 'EL' ? 'EL' : 'EN';
  const localized = (key: string): string =>
    escapeHtml(resolveMetadataText(`@CM.${key}`, language));
  const documentationLabel = escapeHtml(
    resolveMetadataText('@CM.OpenDocumentation', options.currentLanguage.id === 'el' ? 'EL' : 'EN'),
  );

  return `
    <nav class="primary-navigation" aria-label="${localized('PrimaryNavigation')}">
      <div class="primary-navigation-items">
        ${options.items.map((item) => renderPrimaryNavigationItem(item, 0)).join('')}
      </div>

      <div class="primary-navigation-tools">
        ${renderLanguageSelection({ languages: options.languages, currentLanguage: options.currentLanguage })}

        <button
          type="button"
          class="primary-navigation-tool primary-navigation-documentation"
          title="${documentationLabel}"
          aria-label="${documentationLabel}"
          data-documentation-open
        >
          <i class="bi bi-book" aria-hidden="true"></i>
        </button>

        ${
          options.debuggerAllowed === false
            ? ''
            : `
        <div class="primary-navigation-dropdown" data-shell-menu="developer">
          <button
            type="button"
            class="primary-navigation-tool primary-navigation-developer-toggle"
            data-shell-menu-toggle
            aria-expanded="false"
            title="${localized('DebuggingTools')}"
          >
            <i class="bi bi-bug" aria-hidden="true"></i>
            <i class="bi bi-caret-down-fill navigation-caret" aria-hidden="true"></i>
          </button>

          <div class="primary-navigation-menu primary-navigation-tool-menu primary-navigation-developer-menu" role="menu" hidden data-shell-menu-popup>
            ${options.developerItems
              .map(
                (item) => `
                  ${item.separatorBefore ? '<div class="primary-navigation-menu-divider" role="separator"></div>' : ''}
                  <button
                    type="button"
                    data-developer-action="${escapeHtml(item.id)}"
                    title="${escapeHtml(item.description)}"
                    role="menuitemcheckbox"
                    aria-checked="${item.checked === true}"
                  >
                    <i class="bi ${item.checked === true ? 'bi-check-square' : 'bi-square'} primary-navigation-menu-check" aria-hidden="true"></i>
                    <i class="bi ${safeIconClass(item.icon)}" aria-hidden="true"></i>
                    <span>${escapeHtml(item.label)}</span>
                  </button>
                `,
              )
              .join('')}
          </div>
        </div>
        `
        }

        ${renderFontScale({ percent: options.fontScalePercent, language })}
      </div>
    </nav>
  `;
}
