(() => {
  /* =======================================================================
   * SysBO list navigation
   *
   * Paging, sorting, filtering and page-size changes update only the current
   * SysBO list card. The application shell is deliberately left untouched.
   * ======================================================================= */

  const LIST_SELECTOR = '.sysbo-list-page';

  const getList = () => document.querySelector(LIST_SELECTOR);

  const isModifiedClick = (event) =>
    event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;

  const sameOriginUrl = (value) => {
    const url = new URL(value, window.location.href);
    return url.origin === window.location.origin ? url : null;
  };

  const updateList = async (url, { pushHistory = true } = {}) => {
    const currentList = getList();
    if (!currentList) return false;

    currentList.setAttribute('aria-busy', 'true');

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'text/html',
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'same-origin',
      });

      if (!response.ok) return false;

      const html = await response.text();
      const documentCopy = new DOMParser().parseFromString(html, 'text/html');
      const replacement = documentCopy.querySelector(LIST_SELECTOR);

      // A list may legitimately become the empty-entity state after a server-side
      // change, but ordinary paging/filtering should always return the list card.
      // Fall back to normal navigation rather than partially updating the page.
      if (!replacement) return false;

      // One DOM mutation only: no loading overlay, no card replacement and no
      // application-shell reconstruction. This avoids the full-page flash.
      currentList.innerHTML = replacement.innerHTML;

      for (const attribute of replacement.attributes) {
        currentList.setAttribute(attribute.name, attribute.value);
      }
      currentList.removeAttribute('aria-busy');

      if (pushHistory) {
        window.history.pushState({ manatosSysBOList: true }, '', url);
      }

      return true;
    } catch (error) {
      console.error('[ManatOS UI] SysBO list navigation failed:', error);
      return false;
    } finally {
      getList()?.removeAttribute('aria-busy');
    }
  };

  const navigateOrFallback = async (url, options) => {
    const updated = await updateList(url, options);
    if (!updated) window.location.assign(url.toString());
  };

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element) || isModifiedClick(event)) return;

    const link = event.target.closest(`${LIST_SELECTOR} a[href]`);
    if (!(link instanceof HTMLAnchorElement)) return;

    // Entity edit/create navigation must remain normal page navigation. Only
    // query-string list operations and the explicit filter Clear link are AJAX.
    const url = sameOriginUrl(link.href);
    if (!url) return;

    const current = new URL(window.location.href);
    const isSameListPath = url.pathname === current.pathname;
    if (!isSameListPath) return;

    event.preventDefault();
    void navigateOrFallback(url);
  });

  document.addEventListener('submit', (event) => {
    if (!(event.target instanceof HTMLFormElement)) return;

    const form = event.target;
    if (!form.closest(LIST_SELECTOR) || form.method.toLowerCase() !== 'get') return;

    event.preventDefault();

    const url = new URL(form.action || window.location.href, window.location.href);
    const params = new URLSearchParams(new FormData(form));

    // Any filter/page-size change starts from page 1 unless the form explicitly
    // carries a page value.
    if (!params.has('page')) params.set('page', '1');
    url.search = params.toString();

    void navigateOrFallback(url);
  });

  document.addEventListener('change', (event) => {
    if (!(event.target instanceof HTMLSelectElement)) return;
    if (!event.target.matches('[data-page-size-select]')) return;

    const form = event.target.form;
    if (!form) return;

    // The submit handler above performs the AJAX update. The server records an
    // explicit pageSize as one session-wide Rows preference shared by every
    // SysBO list. No browser localStorage/sessionStorage is required.
    form.requestSubmit();
  });

  window.addEventListener('popstate', () => {
    const url = new URL(window.location.href);
    void navigateOrFallback(url, { pushHistory: false });
  });
})();
