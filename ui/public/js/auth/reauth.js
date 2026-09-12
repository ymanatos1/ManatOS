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

  const reauthenticate = () => {
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
      let completed = false;
      let settled = false;

      const finish = (value) => {
        if (settled) return;
        settled = true;
        form.removeEventListener('submit', submitHandler, true);
        modalElement.removeEventListener('hidden.bs.modal', hiddenHandler);
        delete form.dataset.manatosReauthentication;
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
