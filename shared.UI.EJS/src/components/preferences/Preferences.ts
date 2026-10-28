import { DEFAULT_UI_THEME, normalizeUiTheme, type UiTheme } from '@manatos/shared-ui';

export interface PreferencesOptions {
  theme?: UiTheme;
}

export function renderPreferences(options: PreferencesOptions = {}): string {
  const theme = normalizeUiTheme(options.theme ?? DEFAULT_UI_THEME);

  return `
    <div class="preferences-backdrop" data-preferences hidden>
      <section
        class="preferences-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preferences-title"
      >
        <header class="preferences-header">
          <div>
            <h2 id="preferences-title">Website user preferences</h2>
            <p>Personalize the ManatOS website experience for this browser.</p>
          </div>
        </header>

        <div class="preferences-body">
          <fieldset>
            <legend>UI Theme</legend>

            <div class="preferences-theme-options">
              <label class="preferences-theme-option">
                <input
                  type="radio"
                  name="uiTheme"
                  value="lighter"
                  data-ui-theme-option
                  ${theme === 'lighter' ? 'checked' : ''}
                >

                <span>
                  <strong>Lighter</strong>
                  <small>Light blue header and title surfaces.</small>
                </span>
              </label>

              <label class="preferences-theme-option">
                <input
                  type="radio"
                  name="uiTheme"
                  value="darker"
                  data-ui-theme-option
                  ${theme === 'darker' ? 'checked' : ''}
                >

                <span>
                  <strong>Darker</strong>
                  <small>Current navy header and stronger title surfaces.</small>
                </span>
              </label>
            </div>

            <div
              class="preferences-theme-preview"
              data-ui-theme-preview
              data-preview-theme="${theme}"
            >
              <div class="preferences-preview-caption">
                Selected theme preview
              </div>

              <div class="preferences-theme-preview-grid">
                <div class="preferences-theme-preview-swatch is-header"><span>Header</span></div>
                <div class="preferences-theme-preview-swatch is-title"><span>Title</span></div>
                <div class="preferences-theme-preview-swatch is-text"><span>Text</span></div>
                <div class="preferences-theme-preview-swatch is-date"><span>Date</span></div>
                <div class="preferences-theme-preview-swatch is-enum"><span>Enum</span></div>
                <div class="preferences-theme-preview-swatch is-reference"><span>Related</span></div>
              </div>
            </div>
          </fieldset>
        </div>

        <footer class="preferences-footer">
          <button type="button" class="secondary" data-preferences-cancel>
            Cancel
          </button>

          <button type="button" class="primary" data-preferences-save>
            Save preferences
          </button>
        </footer>
      </section>
    </div>
  `;
}
