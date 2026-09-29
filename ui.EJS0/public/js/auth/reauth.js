/**
 * In-place reauthentication service.
 *
 * Entry forms remain mounted while the API session is renewed. The service is
 * intentionally entity-agnostic: Save callers await one boolean and retain all
 * CTX/form/runtime state if the user cancels or authentication fails.
 */
(() => {
  window.ManatOS ||= {};

  let activePromise = null;

  const reauthenticate = (invocation = {}) => {
    if (activePromise) return activePromise;

    activePromise = new Promise((resolve) => {
      const modalElement = document.getElementById('signInModal');
      const form = modalElement?.querySelector('form[action="/auth/signin/local"]');
      if (!(modalElement instanceof HTMLElement) || !(form instanceof HTMLFormElement)) {
        resolve(false);
        activePromise = null;
        return;
      }

      const BootstrapModal = window.bootstrap?.Modal;
      if (!BootstrapModal) {
        resolve(false);
        activePromise = null;
        return;
      }

      const modal = BootstrapModal.getOrCreateInstance(modalElement);
      const normalizedInvocation = Object.freeze({
        reason: typeof invocation?.reason === 'string' ? invocation.reason : null,
        operation: typeof invocation?.operation === 'string' ? invocation.operation : null,
      });
      const title = modalElement.querySelector('.auth-entry-copy .popup-content-title');
      const paragraphs = [
        ...modalElement.querySelectorAll('.auth-entry-copy .popup-content-paragraph'),
      ];
      const originalCopy = Object.freeze({
        title: title?.textContent || '',
        paragraphs: paragraphs.map((paragraph) => paragraph.textContent || ''),
      });
      const popupInvocation = Object.freeze({
        purpose: 'auth-sign-in',
        ...normalizedInvocation,
      });
      modalElement.dataset.popupInvocation = JSON.stringify(popupInvocation);

      if (normalizedInvocation.reason === 'session-expired') {
        if (title) title.textContent = 'Your session has expired';
        const operationText =
          normalizedInvocation.operation === 'save'
            ? 'continue saving your unsaved changes'
            : 'continue the interrupted operation';
        if (paragraphs[0]) paragraphs[0].textContent = `Sign in again to ${operationText}.`;
        if (paragraphs[1])
          paragraphs[1].textContent =
            'Your current workspace and unsaved changes remain preserved while you sign in.';
      }

      let completed = false;
      let settled = false;

      const finish = (value) => {
        if (settled) return;
        settled = true;
        form.removeEventListener('submit', submitHandler, true);
        modalElement.removeEventListener('hidden.bs.modal', hiddenHandler);
        delete form.dataset.manatosReauthentication;
        delete modalElement.dataset.popupInvocation;
        if (title) title.textContent = originalCopy.title;
        paragraphs.forEach((paragraph, index) => {
          paragraph.textContent = originalCopy.paragraphs[index] || '';
        });
        activePromise = null;
        resolve(value);
      };

      const message = document.createElement('div');
      message.className = 'alert alert-warning py-2 d-none';
      message.setAttribute('role', 'alert');
      message.dataset.manatosReauthMessage = '';
      form.querySelector('.modal-body')?.prepend(message);

      const setMessage = (text) => {
        message.textContent = text;
        message.classList.toggle('d-none', !text);
      };

      const submitHandler = async (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!form.reportValidity()) return;

        const submitButtons = form.querySelectorAll('button[type="submit"]');
        submitButtons.forEach((button) => {
          button.disabled = true;
        });
        setMessage('Signing in again…');

        try {
          // A long-lived document can outlive its Express session. Refresh the
          // anonymous-session CSRF token before credential submission instead
          // of trusting the token rendered many hours ago.
          const csrfResponse = await fetch('/auth/csrf', {
            headers: { Accept: 'application/json' },
          });
          const csrfPayload = await csrfResponse.json().catch(() => null);
          const csrfToken = csrfPayload?.data?.csrfToken;
          if (!csrfResponse.ok || !csrfPayload?.success || !csrfToken) {
            setMessage('Sign-in could not be prepared. Your unsaved changes are still preserved.');
            return;
          }

          const csrfControl = form.querySelector('input[name="_csrf"]');
          if (csrfControl instanceof HTMLInputElement) csrfControl.value = csrfToken;

          const body = new URLSearchParams();
          for (const [name, value] of new FormData(form).entries()) {
            if (typeof value === 'string') body.append(name, value);
          }
          const response = await fetch(form.action, {
            method: 'POST',
            body,
            headers: {
              Accept: 'application/json',
              'X-ManatOS-Reauthenticate': '1',
            },
          });
          const payload = await response.json().catch(() => null);
          if (!response.ok || !payload?.success) {
            setMessage(
              payload?.error?.message ||
                'Sign-in failed. Your unsaved changes are still preserved.',
            );
            return;
          }
          // establishUiSession rotates both the Express session and CSRF token.
          // Rebind every form in the still-mounted document to that new token so
          // the interrupted Save and subsequent commands can continue in place.
          const authenticatedCsrfToken = payload?.data?.csrfToken;
          if (authenticatedCsrfToken) {
            document.querySelectorAll('input[name="_csrf"]').forEach((control) => {
              if (control instanceof HTMLInputElement) control.value = authenticatedCsrfToken;
            });
          }

          completed = payload?.data?.user || true;
          setMessage('');
          modal.hide();
        } catch {
          setMessage('Sign-in could not be completed. Your unsaved changes are still preserved.');
        } finally {
          submitButtons.forEach((button) => {
            button.disabled = false;
          });
        }
      };

      const hiddenHandler = () => {
        message.remove();
        finish(completed);
      };

      form.dataset.manatosReauthentication = 'true';
      form.addEventListener('submit', submitHandler, true);
      modalElement.addEventListener('hidden.bs.modal', hiddenHandler, { once: true });
      modal.show();
    });

    return activePromise;
  };

  window.ManatOS.reauthenticate = reauthenticate;
})();
