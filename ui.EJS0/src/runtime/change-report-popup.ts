/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Generic popup host for semantic change reports.
 *
 * Change collection/model construction remains with the semantic owner (Entry,
 * aggregate workspace, recovery, commit plan). This host only presents an
 * already-built hierarchical report through the shared report renderer.
 */
const browserWindow = window as any;
browserWindow.ManatOS ||= {};

export interface ChangeReportPopupOptions {
  readonly title?: string;
  readonly summary?: string;
  readonly presentationContext?: unknown;
}

export class ChangeReportPopup {
  install(): void {
    const ensureModal = () => {
      let modal = document.getElementById('semanticChangesModal');
      if (modal instanceof HTMLElement) return modal;
      modal = document.createElement('div');
      modal.className = 'modal fade';
      modal.id = 'semanticChangesModal';
      modal.tabIndex = -1;
      modal.setAttribute('aria-labelledby', 'semanticChangesModalLabel');
      modal.dataset.popupPurpose = 'semantic-change-report';
      modal.dataset.surfaceKind = 'custom';
      modal.dataset.popupInvocation = JSON.stringify({
        purpose: 'semantic-change-report',
        behavior: { recoverable: false },
      });
      modal.innerHTML = `
      <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="semanticChangesModalLabel" data-v2-layout-caption="surface">
              <i class="bi bi-pencil-square me-2" aria-hidden="true"></i><span data-change-report-title>Unsaved changes</span>
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body" data-v2-layout-region="content">
            <div data-change-report-host data-v2-layout-component-instance="report"></div>
          </div>
          <div class="modal-footer" data-v2-layout-actions="surface">
            <button type="button" class="btn btn-primary" data-bs-dismiss="modal" data-v2-layout-action="close">Close</button>
          </div>
        </div>
      </div>`;
      document.body.append(modal);
      browserWindow.ManatOS?.popup?.runtime?.registerBootstrapModal?.(modal);
      return modal;
    };

    const show = (model: any, options: ChangeReportPopupOptions = {}) => {
      const modal = ensureModal();
      const title = modal.querySelector('[data-change-report-title]');
      if (title) title.textContent = options.title || 'Unsaved changes';
      const host = modal.querySelector('[data-change-report-host]');
      browserWindow.ManatOS?.semanticReportPresentation?.render?.(
        host,
        model,
        options.presentationContext,
        {
          summary: options.summary,
        },
      );
      browserWindow.bootstrap?.Modal?.getOrCreateInstance(modal)?.show();
    };

    browserWindow.ManatOS.changeReportPopup = Object.freeze({ show });
  }
}

export const changeReportPopup = new ChangeReportPopup();
