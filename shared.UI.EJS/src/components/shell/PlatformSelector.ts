import type { UiNavigationItem, UiPlatformIdentity } from '@manatos/shared-ui';
import { escapeHtml, safeIconClass } from '../../rendering/html.js';

export interface PlatformSelectorOptions {
  current: UiPlatformIdentity | null;
  platforms: readonly UiPlatformIdentity[];
  navigation: UiNavigationItem | null;
}

export function renderPlatformSelector(options: PlatformSelectorOptions): string {
  const { current, navigation } = options;

  const currentContent = current
    ? `<i class="platform-icon bi ${safeIconClass(current.icon)}" aria-hidden="true"></i><span>${escapeHtml(current.shortName)}</span>`
    : '<span>None</span>';

  const currentTitle = current?.description ?? current?.name ?? 'No platform selected';

  const currentControl = navigation?.url
    ? `<a class="platform-current" href="${escapeHtml(navigation.url)}" title="${escapeHtml(currentTitle)}">${currentContent}</a>`
    : `<span class="platform-current${current === null ? ' platform-none' : ''}" title="${escapeHtml(currentTitle)}">${currentContent}</span>`;

  return `
    <div class="platform-selector" data-platform-selector>
      ${currentControl}

      <button
        type="button"
        class="platform-toggle"
        aria-label="Select platform"
        title="Select platform"
        aria-expanded="false"
        data-platform-toggle
      >▾</button>

      <div class="platform-menu" hidden data-platform-menu>
        <button
          type="button"
          class="platform-option${current === null ? ' selected' : ''}"
          title="No platform selected"
          data-platform-none
        >
          <span class="check">${current === null ? '✓' : ''}</span>
          <span>None</span>
        </button>

        ${options.platforms
          .map(
            (platform) => `
              <button
                type="button"
                class="platform-option${current?.id === platform.id ? ' selected' : ''}"
                title="${escapeHtml(platform.description)}"
                data-platform-id="${escapeHtml(platform.id)}"
              >
                <span class="check">${current?.id === platform.id ? '✓' : ''}</span>
                <i class="platform-option-icon bi ${safeIconClass(platform.icon)}" aria-hidden="true"></i>
                <span>${escapeHtml(platform.shortName)}</span>
              </button>
            `,
          )
          .join('')}
      </div>
    </div>
  `;
}
