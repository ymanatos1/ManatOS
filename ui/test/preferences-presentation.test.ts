import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Preferences presentation', () => {
  it('previews the selected Lighter/Darker palette in a grid without applying it before Save', () => {
    const view = readFileSync(
      new URL('../views/popups/preferences/preferences-modal.ejs', import.meta.url),
      'utf8',
    );
    const runtime = readFileSync(new URL('../public/js/prefs.js', import.meta.url), 'utf8');
    const theme = readFileSync(new URL('../public/css/theme.css', import.meta.url), 'utf8');
    expect(view).toContain('data-ui-theme-preview');
    expect(view).toContain('preferences-theme-preview-grid');
    expect(view).toContain('Selected theme preview');
    expect(runtime).toContain('preview.dataset.previewTheme');
    expect(theme).toMatch(/\.preferences-theme-preview\[data-preview-theme=['"]lighter['"]\]/);
    expect(theme).toContain('grid-template-columns: repeat(3');
  });
});
