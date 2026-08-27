(() => {
  const modalIds = new Set(['signInModal', 'signUpMethodModal']);

  const makeIcon = (className) => {
    const icon = document.createElement('i');
    icon.className = `bi ${className} auth-provider-icon`;
    icon.setAttribute('aria-hidden', 'true');
    return icon;
  };

  const renderUnavailable = (list) => {
    list.replaceChildren();

    const message = document.createElement('div');
    message.className = 'small text-secondary py-2';
    message.textContent =
      'External authentication providers are temporarily unavailable. You can still use email and password.';
    list.appendChild(message);
  };

  const renderProviders = (list, providers) => {
    list.replaceChildren();

    const mode = list.dataset.authProviderMode === 'register' ? 'register' : 'signin';
    const actionLabel = mode === 'register' ? 'Register with' : 'Continue with';

    if (!providers.length) {
      const message = document.createElement('div');
      message.className = 'small text-secondary py-2';
      message.textContent = 'No external authentication providers are currently available.';
      list.appendChild(message);
      return;
    }

    providers.forEach((provider) => {
      if (provider.configured) {
        const anchor = document.createElement('a');
        anchor.className = 'btn btn-outline-secondary auth-provider-button';
        anchor.href = `/auth/${encodeURIComponent(provider.provider)}?intent=${mode}`;
        anchor.dataset.busy = '';
        anchor.dataset.busyTitle = `Connecting to ${provider.label}…`;
        anchor.dataset.busyMessage = `Please wait while ${provider.label} authenticates your account.`;
        anchor.dataset.busyIcon = provider.icon;

        anchor.appendChild(makeIcon(provider.icon));

        const label = document.createElement('span');
        label.textContent = `${actionLabel} ${provider.label}`;
        anchor.appendChild(label);

        const chevron = document.createElement('i');
        chevron.className = 'bi bi-chevron-right auth-provider-chevron';
        chevron.setAttribute('aria-hidden', 'true');
        anchor.appendChild(chevron);

        list.appendChild(anchor);
        return;
      }

      const button = document.createElement('button');
      button.className = 'btn btn-outline-secondary auth-provider-button is-unavailable';
      button.type = 'button';
      button.disabled = true;
      button.title = `${provider.label} authentication is not configured yet.`;

      button.appendChild(makeIcon(provider.icon));

      const label = document.createElement('span');
      label.textContent = `${actionLabel} ${provider.label}`;
      button.appendChild(label);

      const status = document.createElement('span');
      status.className = 'badge auth-provider-status ms-auto';
      status.textContent = 'Not configured';
      button.appendChild(status);

      list.appendChild(button);
    });
  };

  const refreshForModal = async (modal) => {
    const lists = modal.querySelectorAll('[data-auth-provider-list]');

    if (!lists.length) {
      return;
    }

    lists.forEach((list) => {
      list.replaceChildren();
      const loading = document.createElement('div');
      loading.className = 'small text-secondary py-2';
      loading.textContent = 'Checking external provider availability…';
      list.appendChild(loading);
    });

    try {
      const response = await fetch('/auth/external-providers', {
        headers: { accept: 'application/json' },
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`Provider state request failed with HTTP ${response.status}.`);
      }

      const payload = await response.json();
      const providers = Array.isArray(payload.providers) ? payload.providers : [];

      lists.forEach((list) => renderProviders(list, providers));
    } catch {
      lists.forEach(renderUnavailable);
    }
  };

  document.addEventListener('show.bs.modal', (event) => {
    const modal = event.target;

    if (!(modal instanceof HTMLElement) || !modalIds.has(modal.id)) {
      return;
    }

    void refreshForModal(modal);
  });
})();
