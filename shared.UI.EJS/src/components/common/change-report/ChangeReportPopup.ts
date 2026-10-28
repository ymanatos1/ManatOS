/**
 * UIS SOURCE NAVIGATION — ChangeReportPopup.
 * EJS native adapter: owns rendering/DOM integration, not canonical semantic layout/state.
 * Breakpoints here: constructor/registration; follow inherited hooks below.
 * Follow: common/popups/PopupBase.ts -> shared.UI/src/popups/embedded.
 * Cross-layer: Semantic owner: shared.UI/src/popups/embedded; NG1: shared.UI.NG/src/components/common.
 * Source tracing: setUiComponentSourceTraceSink() in shared.UI/src/runtime/source-trace.ts.
 */
import { CHANGE_REPORT_POPUP, type UiSurfaceOpenOptions } from '@manatos/shared-ui';
import { PopupBase, type EjsPopupHost } from '../popups/PopupBase.js';

/** Standard semantic popup registered with the existing EJS Surface manager. */
export class ChangeReportPopup extends PopupBase {
  constructor(invocation: UiSurfaceOpenOptions, host: EjsPopupHost) {
    super('semantic.changeReport', CHANGE_REPORT_POPUP, invocation, host);
  }
}
