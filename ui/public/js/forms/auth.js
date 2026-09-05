/* global bootstrap */

(() => {
  /* =======================================================================
   * Password visibility toggle
   *
   * Applied dynamically to every password input so all current and future
   * password fields get the same Show/Hide behaviour without duplicating
   * markup in individual EJS views.
   * ===================================================================== */

  document.querySelectorAll('input[type="password"]').forEach((input) => {
    const wrapper = document.createElement('div');

    wrapper.className = 'password-visibility-field';

    /*
     * Preserve Bootstrap bottom-margin utilities on the wrapper. Otherwise
     * an absolutely positioned toggle would not participate correctly in
     * the spacing of fields such as the sign-in password.
     */
    ['mb-1', 'mb-2', 'mb-3', 'mb-4', 'mb-5'].forEach((marginClass) => {
      if (input.classList.contains(marginClass)) {
        input.classList.remove(marginClass);
        wrapper.classList.add(marginClass);
      }
    });

    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const toggle = document.createElement('button');

    toggle.type = 'button';
    toggle.className = 'password-visibility-toggle';
    toggle.setAttribute('aria-label', 'Show password');
    toggle.setAttribute('title', 'Show password');

    toggle.innerHTML = '<i class="bi bi-eye" aria-hidden="true"></i>';

    toggle.addEventListener('click', () => {
      const showPassword = input.type === 'password';

      input.type = showPassword ? 'text' : 'password';

      toggle.setAttribute('aria-label', showPassword ? 'Hide password' : 'Show password');

      toggle.setAttribute('title', showPassword ? 'Hide password' : 'Show password');

      const icon = toggle.querySelector('i');

      if (icon) {
        icon.className = `bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`;
      }

      input.focus();
    });

    wrapper.appendChild(toggle);
  });

  /* =======================================================================
   * Optional local-password sections
   *
   * External-provider registration can create an account without local
   * credentials. The checkbox keeps that optional branch explicit and avoids
   * showing inactive password controls. Disabled inputs are also omitted from
   * form submission, so the existing server-side "no local password" path is
   * preserved without a second form or endpoint.
   * ===================================================================== */

  document.querySelectorAll('[data-optional-password-section]').forEach((section) => {
    const toggle = section.querySelector('[data-optional-password-toggle]');
    const content = section.querySelector('[data-optional-password-content]');

    if (!toggle || !content) {
      return;
    }

    const passwordFields = content.querySelectorAll('input');

    const updateOptionalPasswordSection = () => {
      const enabled = toggle.checked;

      content.hidden = !enabled;

      passwordFields.forEach((field) => {
        field.disabled = !enabled;

        // Returning to provider-only authentication must not leave a hidden
        // password value that could accidentally be submitted later.
        if (!enabled) {
          field.value = '';
          field.setCustomValidity('');
        }
      });

      // Re-run the shared password-policy state after the branch changes.
      const passwordInput = content.querySelector('.password-policy-input');
      passwordInput?.dispatchEvent(new Event('input', { bubbles: true }));
    };

    toggle.addEventListener('change', updateOptionalPasswordSection);
    updateOptionalPasswordSection();
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
      const passwordOptional = input.hasAttribute('data-password-optional');
      const confirmationValue = confirmation?.value ?? '';
      const passwordSupplied = value.length > 0 || confirmationValue.length > 0;
      const policy = {
        length: value.length >= 9,
        alpha: /[A-Za-z]/.test(value),
        number: /[0-9]/.test(value),
        symbol: /[^A-Za-z0-9]/.test(value),
      };

      Object.entries(policy).forEach(([rule, valid]) => setRule(rule, valid));

      /*
       * Some provider-based registrations allow no local password at all. In
       * that mode an entirely empty password pair is valid; as soon as either
       * field is used, the normal password policy and confirmation rules apply
       * in full. This keeps optional-password flows on the same validator rather
       * than creating a second, subtly different implementation.
       */
      const policyValid = passwordOptional && !passwordSupplied
        ? true
        : Object.values(policy).every(Boolean);
      let confirmationValid = true;

      if (confirmation) {
        confirmationValid = passwordOptional && !passwordSupplied
          ? true
          : confirmationValue.length > 0 && confirmationValue === value;
        setRule('match', passwordSupplied && confirmationValid);

        // Keep native browser validation consistent with the visible rule.
        confirmation.setCustomValidity(
          passwordSupplied && !confirmationValid
            ? 'The two password values do not match.'
            : '',
        );
      }

      if (submit) {
        // form.checkValidity() also covers required account fields and, in
        // other flows, currentPassword when an existing password is required.
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
   * Password-recovery identity validation
   *
   * The recovery field accepts either a user name or an email address. Once
   * an @ character is present, the value is treated strictly as email input;
   * otherwise it follows the existing registration user-name minimum length.
   * This validates syntax only and deliberately reveals nothing about whether
   * the supplied identity exists.
   * ===================================================================== */

  document.querySelectorAll('[data-recovery-identity]').forEach((input) => {
    const form = input.closest('form');
    const submit = form?.querySelector('[data-recovery-submit]');
    const emailProbe = document.createElement('input');

    emailProbe.type = 'email';
    emailProbe.required = true;

    const isValid = () => {
      const value = input.value.trim();

      if (value.includes('@')) {
        emailProbe.value = value;
        return emailProbe.checkValidity();
      }

      return value.length >= 2;
    };

    const update = () => {
      const valid = isValid();
      const hasValue = input.value.trim().length > 0;

      input.setCustomValidity(valid || !hasValue ? '' : 'Enter a valid email address or user name.');
      input.classList.toggle('is-invalid', hasValue && !valid);

      if (submit) {
        submit.disabled = !valid;
      }
    };

    input.addEventListener('input', update);
    update();
  });

})();
