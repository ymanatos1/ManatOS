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
      Boolean(detailsPanel) &&
      readBooleanPreference(DETAILS_STORAGE_KEY, false);

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
        if (dirty()) {
          event.preventDefault();

          event.returnValue = '';
        }
      },
    );

    form.addEventListener(
      'submit',

      () => {
        window.manatosRetry = null;
      },
    );
  }
})();
