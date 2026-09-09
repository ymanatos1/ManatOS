(() => {
  /* =======================================================================
   * Website theme preference
   * ===================================================================== */

  const uiUserId = document.body.dataset.userId || 'anonymous';
  const UI_THEME_STORAGE_KEY = `manatos.ui.theme.${uiUserId}`;

  const normalizeTheme = (value) => (value === 'lighter' ? 'lighter' : 'darker');

  const applyTheme = (theme) => {
    const normalized = normalizeTheme(theme);

    // Keep both roots synchronized. <html> is styled before first paint by
    // shell.ejs; body is also marked for convenient runtime inspection.
    document.documentElement.dataset.uiTheme = normalized;
    document.body.dataset.uiTheme = normalized;

    // A single logo element changes both source asset and sizing class.
    const logo = document.getElementById('themeBrandLogo');

    if (logo) {
      const lighter = normalized === 'lighter';

      logo.src = lighter ? logo.dataset.lighterSrc : logo.dataset.darkerSrc;

      logo.classList.toggle('brand-logo1', !lighter);
      logo.classList.toggle('brand-logo2', lighter);
    }

    // Keep browser UI/chrome colour related to the active top bar.
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', normalized === 'lighter' ? '#557da9' : '#071a3d');
  };

  const storedTheme = normalizeTheme(localStorage.getItem(UI_THEME_STORAGE_KEY) || 'darker');

  applyTheme(storedTheme);

  /* =======================================================================
   * UI language preference
   * ===================================================================== */

  const UI_LANGUAGE_STORAGE_KEY = `manatos.ui.language.${uiUserId}`;

  const normalizeLanguage = (value) => (value === 'el' ? 'el' : 'en');

  const languagePresentation = {
    en: {
      flagSrc: '/assets/flags/en.svg',
      label: 'EN',
    },

    el: {
      flagSrc: '/assets/flags/el.svg',
      label: 'EL',
    },
  };

  const applyLanguage = (language) => {
    const normalized = normalizeLanguage(language);
    const presentation = languagePresentation[normalized];

    document.documentElement.lang = normalized;
    document.documentElement.dataset.uiLanguage = normalized;
    document.body.dataset.uiLanguage = normalized;

    const flag = document.getElementById('languageMenuFlag');
    const label = document.getElementById('languageMenuLabel');

    if (flag) {
      flag.src = presentation.flagSrc;
      flag.alt = '';
    }

    if (label) {
      label.textContent = presentation.label;
    }

    document.querySelectorAll('[data-ui-language]').forEach((option) => {
      option.classList.toggle('active', option.dataset.uiLanguage === normalized);
    });
  };

  const storedLanguage = normalizeLanguage(
    localStorage.getItem(UI_LANGUAGE_STORAGE_KEY) ||
      document.documentElement.dataset.uiLanguage ||
      'en',
  );

  applyLanguage(storedLanguage);

  document.querySelectorAll('[data-ui-language]').forEach((option) => {
    option.addEventListener('click', () => {
      const language = normalizeLanguage(option.dataset.uiLanguage);

      localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, language);
      applyLanguage(language);
    });
  });

  /* =======================================================================
   * Preferences popup
   * ===================================================================== */

  const preferencesModal = document.getElementById('preferencesModal');
  const savePreferencesButton = document.getElementById('savePreferencesButton');

  preferencesModal?.addEventListener('show.bs.modal', () => {
    const currentTheme = normalizeTheme(
      localStorage.getItem(UI_THEME_STORAGE_KEY) || document.body.dataset.uiTheme,
    );

    const option = preferencesModal.querySelector(
      `[data-ui-theme-option][value="${currentTheme}"]`,
    );

    if (option) {
      option.checked = true;
    }
    const preview = preferencesModal.querySelector('[data-ui-theme-preview]');
    if (preview instanceof HTMLElement) preview.dataset.previewTheme = currentTheme;
  });

  preferencesModal?.querySelectorAll('[data-ui-theme-option]').forEach((option) => {
    option.addEventListener('change', () => {
      if (!(option instanceof HTMLInputElement) || !option.checked) return;
      const preview = preferencesModal.querySelector('[data-ui-theme-preview]');
      if (preview instanceof HTMLElement)
        preview.dataset.previewTheme = normalizeTheme(option.value);
    });
  });

  savePreferencesButton?.addEventListener('click', () => {
    const selected = preferencesModal?.querySelector('[data-ui-theme-option]:checked');

    const theme = normalizeTheme(selected?.value);

    localStorage.setItem(UI_THEME_STORAGE_KEY, theme);
    applyTheme(theme);

    bootstrap.Modal.getInstance(preferencesModal)?.hide();
  });
})();
