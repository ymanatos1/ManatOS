/* ==========================================================================
 * SysConfiguration in-place Apply
 *
 * Configuration is an administrative settings surface with many independent
 * values. Applying one value should not rebuild the page or move the operator
 * back to the top. The normal server redirect remains as a non-JavaScript
 * fallback; this progressive enhancement requests JSON and keeps scroll/focus.
 * ======================================================================== */
(() => {
  document.querySelectorAll('form[data-config-setting]').forEach((form) => {
    const submit = form.querySelector('button[type="submit"]');
    const result = form.querySelector('[data-config-apply-result]');

    if (!(form instanceof HTMLFormElement) || !(submit instanceof HTMLButtonElement)) {
      return;
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const originalHtml = submit.innerHTML;
      const data = new URLSearchParams(new FormData(form));

      submit.disabled = true;
      submit.innerHTML =
        '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Applying';

      if (result instanceof HTMLElement) {
        result.textContent = '';
        result.classList.remove('text-success', 'text-danger');
      }

      try {
        const response = await fetch(form.action, {
          method: 'POST',
          body: data,
          credentials: 'same-origin',
          headers: {
            Accept: 'application/json',
            'X-ManatOS-Application-Command': '1',
          },
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          window.ManatOS?.errors?.fromResponse?.(response, payload, {
            retry: () => form.requestSubmit(submit),
          });
          const failure = new Error(
            payload?.error?.message || `Configuration update failed with HTTP ${response.status}.`,
          );
          failure.manatosPresented = true;
          throw failure;
        }

        if (result instanceof HTMLElement) {
          result.textContent = 'Applied.';
          result.classList.add('text-success');
        }
      } catch (error) {
        console.warn('Configuration value could not be applied in place.', error);
        if (error?.manatosPresented !== true) {
          window.ManatOS?.errors?.present?.(
            {
              code: 'CONFIGURATION_APPLY_FAILED',
              message: error instanceof Error ? error.message : String(error),
              userMessage: 'The configuration value could not be applied.',
              retryable: true,
            },
            { retry: () => form.requestSubmit(submit) },
          );
        }
      } finally {
        submit.disabled = false;
        submit.innerHTML = originalHtml;
      }
    });
  });
})();
