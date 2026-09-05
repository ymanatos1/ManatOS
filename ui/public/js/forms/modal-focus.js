/* ========================================================================== 
 * Modal focus lifecycle
 *
 * Bootstrap applies aria-hidden while closing a modal. Move focus out of the
 * modal before that transition so assistive-technology users never retain
 * focus inside an aria-hidden subtree. This applies to every ManatOS modal.
 * ======================================================================== */
(() => {
  const returnFocus = new WeakMap();

  document.addEventListener('show.bs.modal', (event) => {
    const modal = event.target;
    if (!(modal instanceof HTMLElement)) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && !modal.contains(active)) returnFocus.set(modal, active);
  });

  document.addEventListener('hide.bs.modal', (event) => {
    const modal = event.target;
    if (!(modal instanceof HTMLElement)) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && modal.contains(active)) {
      const target = returnFocus.get(modal);
      if (target instanceof HTMLElement && target.isConnected) target.focus({ preventScroll: true });
      else active.blur();
    }
  });

  document.addEventListener('hidden.bs.modal', (event) => {
    const modal = event.target;
    if (modal instanceof HTMLElement) returnFocus.delete(modal);
  });
})();
