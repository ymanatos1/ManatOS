/* global bootstrap */

(() => {
  /* =======================================================================
   * Adaptive application shell
   * ===================================================================== */

  const appShell = document.getElementById('appShell');

  const navigationStatePersistence = appShell?.dataset.navigationStatePersistence ?? 'none';
  const LEFT_NAVIGATION_STORAGE_KEY = 'manatos.ui.leftNavigation.visible';
  const DETAILS_STORAGE_KEY = 'manatos.ui.details.visible';

  const leftNavigation = document.getElementById('leftNavigation');

  const collapseLeftNavigationButton = document.getElementById('collapseLeftNavigation');

  const restoreLeftNavigationButton = document.getElementById('restoreLeftNavigation');

  const detailsPanel = document.getElementById('detailsPanel');

  const toggleDetailsPanelButton = document.getElementById('toggleDetailsPanel');

  const closeDetailsPanelButton = document.getElementById('closeDetailsPanel');

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
   * SysBO page-size preference (UI/browser only, per user and entity)
   * ===================================================================== */

  const sysBOListPage = document.querySelector('[data-entity-key]');

  if (sysBOListPage) {
    const entityKey = sysBOListPage.dataset.entityKey;
    const defaultPageSize = Number(sysBOListPage.dataset.defaultPageSize || 10);
    const pageSizeKey = `manatos.ui.pageSize.${uiUserId}.${entityKey}`;
    const url = new URL(window.location.href);
    const requestedPageSize = Number(url.searchParams.get('pageSize'));
    const allowedPageSizes = [10, 20, 50, 100];

    if (allowedPageSizes.includes(requestedPageSize)) {
      localStorage.setItem(pageSizeKey, String(requestedPageSize));
    } else {
      const storedPageSize = Number(localStorage.getItem(pageSizeKey));

      if (allowedPageSizes.includes(storedPageSize) && storedPageSize !== defaultPageSize) {
        url.searchParams.set('pageSize', String(storedPageSize));
        url.searchParams.set('page', '1');
        window.location.replace(url.toString());
      }
    }

    const selector = sysBOListPage.querySelector('[data-page-size-select]');

    selector?.addEventListener('change', () => {
      const selected = Number(selector.value);

      if (allowedPageSizes.includes(selected)) {
        localStorage.setItem(pageSizeKey, String(selected));
        selector.form?.requestSubmit();
      }
    });
  }

  /* =======================================================================
   * Workspace-centered Bootstrap modals
   * ===================================================================== */

  const workspace = document.querySelector('.workspace');

  const centerModalInWorkspace = (modal) => {
    if (!workspace || !modal) {
      return;
    }

    const rect = workspace.getBoundingClientRect();

    /*
     * Center in the visible portion of the workspace. This remains correct
     * when the left navigation or right Details panel changes width, and
     * when the document is vertically scrolled.
     */
    const visibleLeft = Math.max(rect.left, 0);
    const visibleRight = Math.min(rect.right, window.innerWidth);
    const visibleTop = Math.max(rect.top, 0);
    const visibleBottom = Math.min(rect.bottom, window.innerHeight);

    const centerX =
      visibleRight > visibleLeft
        ? visibleLeft + (visibleRight - visibleLeft) / 2
        : window.innerWidth / 2;

    const centerY =
      visibleBottom > visibleTop
        ? visibleTop + (visibleBottom - visibleTop) / 2
        : window.innerHeight / 2;

    modal.classList.add('workspace-centered-modal');
    modal.style.setProperty('--workspace-modal-center-x', `${centerX}px`);
    modal.style.setProperty('--workspace-modal-center-y', `${centerY}px`);
  };

  const refreshVisibleModalCenters = () => {
    document.querySelectorAll('.modal.show').forEach((modal) => {
      centerModalInWorkspace(modal);
    });
  };

  document.querySelectorAll('.modal').forEach((modal) => {
    /*
     * ManatOS popups are deliberate interactions: clicking the shaded page
     * behind them must not silently dismiss them.
     */
    modal.dataset.bsBackdrop = 'static';
    modal.dataset.bsKeyboard = 'false';

    modal.addEventListener('show.bs.modal', () => {
      centerModalInWorkspace(modal);
    });

    modal.addEventListener('shown.bs.modal', () => {
      centerModalInWorkspace(modal);
    });
  });

  window.addEventListener('resize', refreshVisibleModalCenters);

  /* =======================================================================
      Helpers
   * ===================================================================== */

  const persistenceEnabled = navigationStatePersistence === 'browser';

  const readBooleanPreference = (key, defaultValue) => {
    if (!persistenceEnabled) {
      return defaultValue;
    }

    const stored = localStorage.getItem(key);

    if (stored === null) {
      return defaultValue;
    }

    return stored === 'true';
  };

  const writeBooleanPreference = (key, value) => {
    if (!persistenceEnabled) {
      return;
    }

    localStorage.setItem(key, String(value));
  };

  /**
   * Centralized shell-state helper.
   *
   * Keeping layout state changes here avoids allowing individual
   * buttons to manipulate unrelated CSS classes inconsistently.
   *
   * This also gives us one place to extend behavior later with:
   *
   * - localStorage preferences;
   * - server-side profile preferences;
   * - animated panel sizes;
   * - route-specific automatic panel state;
   * - keyboard shortcuts.
   */
  const shellState = {
    /**
     * Show or hide the left navigation.
     */
    setLeftNavigationVisible(visible, persist = true) {
      if (!appShell || !leftNavigation) {
        return;
      }

      appShell.classList.toggle('has-left-nav', visible);

      leftNavigation.classList.toggle('d-none', !visible);

      restoreLeftNavigationButton?.classList.toggle('d-none', visible);

      collapseLeftNavigationButton?.setAttribute('aria-expanded', String(visible));

      restoreLeftNavigationButton?.setAttribute('aria-expanded', String(visible));

      refreshVisibleModalCenters();

      if (persist) {
        writeBooleanPreference(LEFT_NAVIGATION_STORAGE_KEY, visible);
      }
    },

    /**
     * Show or hide the right Details panel.
     */
    setDetailsVisible(visible, persist = true) {
      if (!appShell || !detailsPanel) {
        return;
      }

      appShell.classList.toggle('has-details', visible);

      detailsPanel.classList.toggle('d-none', !visible);

      detailsPanel.setAttribute('aria-hidden', String(!visible));

      toggleDetailsPanelButton?.setAttribute('aria-expanded', String(visible));

      toggleDetailsPanelButton?.classList.toggle('active', visible);

      refreshVisibleModalCenters();

      if (persist) {
        writeBooleanPreference(DETAILS_STORAGE_KEY, visible);
      }
    },

    /**
     * Toggle current Details state.
     */
    toggleDetails() {
      if (!appShell) {
        return;
      }

      this.setDetailsVisible(!appShell.classList.contains('has-details'));
    },
  };

  /* -----------------------------------------------------------------------
   * Restore persisted shell state
   * -------------------------------------------------------------------- */

  /**
   * The server always renders a safe default state first:
   *
   *   - authenticated users: left navigation visible;
   *   - Details panel: closed.
   *
   * When browser persistence is enabled, replace those defaults with the
   * user's last browser choices. The second argument (false) prevents this
   * initialization step from writing the same values back to localStorage.
   */
  if (appShell) {
    const initialLeftNavigationVisible =
      Boolean(leftNavigation) &&
      readBooleanPreference(
        LEFT_NAVIGATION_STORAGE_KEY,
        appShell.classList.contains('has-left-nav'),
      );

    const initialDetailsVisible =
      Boolean(detailsPanel) && readBooleanPreference(DETAILS_STORAGE_KEY, false);

    shellState.setLeftNavigationVisible(initialLeftNavigationVisible, false);

    shellState.setDetailsVisible(initialDetailsVisible, false);
  }

  /* -----------------------------------------------------------------------
   * Left-navigation events
   * -------------------------------------------------------------------- */

  collapseLeftNavigationButton?.addEventListener(
    'click',

    () => {
      shellState.setLeftNavigationVisible(false);
    },
  );

  restoreLeftNavigationButton?.addEventListener(
    'click',

    () => {
      shellState.setLeftNavigationVisible(true);
    },
  );

  /* -----------------------------------------------------------------------
   * Details-panel events
   * -------------------------------------------------------------------- */

  toggleDetailsPanelButton?.addEventListener(
    'click',

    () => {
      shellState.toggleDetails();
    },
  );

  closeDetailsPanelButton?.addEventListener(
    'click',

    () => {
      shellState.setDetailsVisible(false);
    },
  );

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
  });

  savePreferencesButton?.addEventListener('click', () => {
    const selected = preferencesModal?.querySelector('[data-ui-theme-option]:checked');

    const theme = normalizeTheme(selected?.value);

    localStorage.setItem(UI_THEME_STORAGE_KEY, theme);
    applyTheme(theme);

    bootstrap.Modal.getInstance(preferencesModal)?.hide();
  });

  /* =======================================================================
   * Bootstrap modal initialization
   * ===================================================================== */

  document.querySelectorAll('.modal[data-auto-show="true"]').forEach((element) => {
    bootstrap.Modal.getOrCreateInstance(element).show();
  });

  /* =======================================================================
   * Password-policy live validation
   * ===================================================================== */

  document.querySelectorAll('.password-policy-input').forEach((input) => {
    const form = input.closest('form');
    const rules = form?.querySelector('.password-rules');
    const confirmation = form?.querySelector('[data-password-confirmation]');
    const submit = form?.querySelector('[data-password-submit]');

    if (!rules) {
      return;
    }

    const setRule = (rule, valid) => {
      const row = rules.querySelector(`[data-rule="${rule}"]`);

      if (!row) {
        return;
      }

      row.classList.toggle('rule-ok', valid);

      const icon = row.querySelector('i');

      if (icon) {
        icon.className = `bi ${valid ? 'bi-check-circle-fill' : 'bi-circle'} me-1`;
      }
    };

    const update = () => {
      const value = input.value;
      const policy = {
        length: value.length >= 9,
        alpha: /[A-Za-z]/.test(value),
        number: /[0-9]/.test(value),
        symbol: /[^A-Za-z0-9]/.test(value),
      };

      Object.entries(policy).forEach(([rule, valid]) => setRule(rule, valid));

      const policyValid = Object.values(policy).every(Boolean);
      let confirmationValid = true;

      if (confirmation) {
        confirmationValid = confirmation.value.length > 0 && confirmation.value === value;
        setRule('match', confirmationValid);

        // Keep native browser validation consistent with the visible rule.
        confirmation.setCustomValidity(
          confirmation.value.length > 0 && !confirmationValid
            ? 'The two password values do not match.'
            : '',
        );
      }

      if (submit) {
        // form.checkValidity() also covers currentPassword when an existing
        // local password must be supplied.
        submit.disabled = !(policyValid && confirmationValid && form.checkValidity());
      }
    };

    input.addEventListener('input', update);
    confirmation?.addEventListener('input', update);

    form?.querySelectorAll('input').forEach((field) => {
      field.addEventListener('input', update);
    });

    update();
  });

  /* =======================================================================
   * Dirty-form navigation protection
   * ===================================================================== */

  const form = document.querySelector('form[data-dirty-guard="true"]');

  if (form) {
    const initial = new URLSearchParams(new FormData(form)).toString();

    let pending = null;
    let allowPageExit = false;

    const dirty = () => new URLSearchParams(new FormData(form)).toString() !== initial;

    window.manatosRetry = () => form.requestSubmit();

    document.querySelectorAll('a.dirty-navigation').forEach((anchor) => {
      anchor.addEventListener(
        'click',

        (event) => {
          if (!dirty()) {
            return;
          }

          event.preventDefault();

          pending = anchor.href;

          bootstrap.Modal.getOrCreateInstance(
            document.getElementById('unsavedChangesModal'),
          ).show();
        },
      );
    });

    document.querySelectorAll('[data-unsaved-action]').forEach((button) => {
      button.addEventListener(
        'click',

        () => {
          const action = button.dataset.unsavedAction;

          const modal = bootstrap.Modal.getInstance(document.getElementById('unsavedChangesModal'));

          if (action === 'cancel') {
            modal?.hide();

            pending = null;
          } else if (action === 'discard') {
            allowPageExit = true;
            location.href = pending || '/';
          } else if (action === 'save') {
            form.requestSubmit();
          }
        },
      );
    });

    window.addEventListener(
      'beforeunload',

      (event) => {
        if (dirty() && !allowPageExit) {
          event.preventDefault();

          event.returnValue = '';
        }
      },
    );

    form.addEventListener(
      'submit',

      () => {
        allowPageExit = true;
        window.manatosRetry = null;
      },
    );
  }
})();
