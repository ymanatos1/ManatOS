/* eslint-disable @typescript-eslint/no-explicit-any */
/** Canonical ManatOS informational alert popup. */
const browserWindow = window as any;
browserWindow.ManatOS ||= {};

export interface AlertPopupOptions {
  readonly title?: string;
}

export class AlertPopup {
  install(): void {
    const show = (message: unknown, options: AlertPopupOptions = {}) => {
      const existing = document.getElementById('manatosAlertModal');
      existing?.remove();

      const modal = document.createElement('div');
      modal.className = 'modal fade';
      modal.id = 'manatosAlertModal';
      modal.tabIndex = -1;
      modal.setAttribute('aria-labelledby', 'manatosAlertModalLabel');
      modal.dataset.popupPurpose = 'alert';
      modal.dataset.surfaceKind = 'custom';
      modal.dataset.popupInvocation = JSON.stringify({
        purpose: 'alert',
        behavior: { recoverable: false },
      });
      modal.innerHTML = `
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="manatosAlertModalLabel" data-v2-layout-caption="surface">
                <i class="bi bi-info-circle me-2" aria-hidden="true"></i><span data-alert-title></span>
              </h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body" data-v2-layout-region="content">
              <div data-alert-message data-v2-layout-component-instance="message"></div>
            </div>
            <div class="modal-footer" data-v2-layout-actions="surface">
              <button type="button" class="btn btn-primary" data-bs-dismiss="modal" data-v2-layout-action="ok">OK</button>
            </div>
          </div>
        </div>`;
      const title = modal.querySelector('[data-alert-title]');
      const body = modal.querySelector('[data-alert-message]');
      if (title) title.textContent = options.title || 'Notice';
      if (body) body.textContent = String(message ?? '');
      document.body.append(modal);

      browserWindow.ManatOS?.popup?.runtime?.registerBootstrapModal?.(modal);
      const instance = browserWindow.bootstrap?.Modal?.getOrCreateInstance(modal);
      modal.addEventListener(
        'hidden.bs.modal',
        () => {
          modal.remove();
        },
        { once: true },
      );
      instance?.show();
      return modal;
    };

    browserWindow.ManatOS.alertPopup = Object.freeze({ show });
  }
}

export const alertPopup = new AlertPopup();
