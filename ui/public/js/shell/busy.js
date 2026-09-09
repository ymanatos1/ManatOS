(() => {
  /* =======================================================================
   * Global busy/remote-operation overlay
   *
   * Any link can opt in with data-busy. Any form can opt in with
   * data-busy-submit. The same API is intentionally reusable by future
   * fetch/API operations: window.manatosBusy.show({...}) / hide().
   * ===================================================================== */

  const busyOverlay = document.getElementById('manatosBusyOverlay');
  const busyBackground = document.querySelector('.site-frame');
  const busyTitle = document.getElementById('manatosBusyTitle');
  const busyMessage = document.getElementById('manatosBusyMessage');
  const busyIcon = document.getElementById('manatosBusyIcon');
  const busyActionWrap = document.getElementById('manatosBusyActionWrap');
  const busyAction = document.getElementById('manatosBusyAction');
  let actionHandler = null;

  const showBusy = ({
    title = 'Please wait…',
    message = 'ManatOS is completing the requested operation.',
    icon = 'bi-arrow-repeat',
    actionLabel,
    onAction,
  } = {}) => {
    if (!busyOverlay) {
      return;
    }

    if (busyTitle) {
      busyTitle.textContent = title;
    }

    if (busyMessage) {
      busyMessage.textContent = message;
    }

    if (busyIcon) {
      busyIcon.className = `bi ${icon}`;
    }
    actionHandler = typeof onAction === 'function' ? onAction : null;
    if (busyActionWrap) busyActionWrap.hidden = !actionHandler;
    if (busyAction) busyAction.textContent = actionLabel || 'Cancel';

    busyOverlay.classList.add('is-visible');
    busyOverlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('manatos-busy');
    busyBackground?.setAttribute('inert', '');
  };

  const hideBusy = () => {
    busyOverlay?.classList.remove('is-visible');
    busyOverlay?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('manatos-busy');
    busyBackground?.removeAttribute('inert');
    actionHandler = null;
    if (busyActionWrap) busyActionWrap.hidden = true;
  };

  busyAction?.addEventListener('click', () => actionHandler?.());

  window.manatosBusy = { show: showBusy, hide: hideBusy };

  // Delegate link handling so provider buttons and other remote-operation
  // links inserted after page load receive the same busy-state behavior.
  document.addEventListener('click', (event) => {
    const target = event.target;
    const link = target instanceof Element ? target.closest('a[data-busy]') : null;

    if (!(link instanceof HTMLAnchorElement)) {
      return;
    }

    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey ||
      link.getAttribute('aria-disabled') === 'true'
    ) {
      return;
    }

    const href = link.href;

    if (!href) {
      return;
    }

    event.preventDefault();

    showBusy({
      title: link.dataset.busyTitle,
      message: link.dataset.busyMessage,
      icon: link.dataset.busyIcon,
    });

    // Give the browser one paint opportunity so the user sees the locked
    // transition state before navigation leaves ManatOS for the provider.
    window.setTimeout(() => {
      location.assign(href);
    }, 90);
  });

  document.querySelectorAll('form[data-busy-submit]').forEach((busyForm) => {
    busyForm.addEventListener('submit', (event) => {
      if (event.defaultPrevented || !busyForm.checkValidity()) {
        return;
      }

      showBusy({
        title: busyForm.dataset.busyTitle,
        message: busyForm.dataset.busyMessage,
        icon: busyForm.dataset.busyIcon,
      });
    });
  });

  /* =======================================================================
   * Bootstrap modal initialization
   * ===================================================================== */

  document.querySelectorAll('.modal[data-auto-show="true"]').forEach((element) => {
    bootstrap.Modal.getOrCreateInstance(element).show();
  });
})();
