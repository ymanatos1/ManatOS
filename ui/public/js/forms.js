/* global bootstrap */

(() => {
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
