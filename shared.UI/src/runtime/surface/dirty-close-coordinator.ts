import type { UiChangeReport } from '../../components/common/change-report/change-report.js';
import type { UiSurfaceManager } from './uiSurfaceManager.js';

/** Optional presentation of the source Surface, resolved without taking ownership of its CTX. */
export interface UiDirtyClosePresentation {
  readonly ownerLabel?: string;
  readonly reviewChanges?: () => UiChangeReport | null;
}

/**
 * One pending user-authorized exit per application host. No dirty Page state is
 * destroyed in prepare or decision; dismissal of the decision or its review
 * preserves the originally mounted Page and its original/current values.
 */
export class UiDirtyCloseCoordinator {
  private pending = false;

  requestExit(
    isDirty: () => boolean,
    continueExit: () => void,
    surfaces: UiSurfaceManager,
    presentation: UiDirtyClosePresentation = {},
  ): void {
    if (this.pending) return;
    if (!isDirty()) {
      continueExit();
      return;
    }
    this.pending = true;
    try {
      const popup = surfaces.open('semantic.unsavedChanges', {
        params: { ownerLabel: presentation.ownerLabel ?? '' },
        events: {
          discard: 'dirty-close-discard',
          review: 'dirty-close-review',
        },
        allowXClosure: true,
        allowBackdropClosure: false,
      });
      popup.onEvent((name) => {
        if (name === 'disposing') {
          this.pending = false;
          return;
        }
        if (!this.pending || !popup.isOpen()) return;
        if (name === 'dirty-close-review') {
          // The report is another *child* Popup Surface. Closing that report
          // returns to the still-pending decision without changing the Page.
          const report = presentation.reviewChanges?.();
          if (report?.count) {
            surfaces.open('semantic.changeReport', {
              params: { report },
              allowXClosure: true,
              allowBackdropClosure: false,
            });
          }
          return;
        }
        if (name !== 'dirty-close-discard') return;
        this.pending = false;
        popup.close('flow');
        continueExit();
      });
    } catch (error) {
      this.pending = false;
      throw error;
    }
  }
}
