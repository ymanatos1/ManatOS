/** UIS boundary: This named popup declares the standard title/body/actions markup and delegates lifecycle to MessagePopup; do not inline Message bodies into the generic host. This ownership separation is intentional; preserve it in future migrations. */
import type { UiSurfaceOpenOptions } from '@manatos/shared-ui';
import type { EjsPopupHost } from './PopupBase.js';
import { MessagePopup } from './MessagePopup.js';

/** Semantic Alert popup, with one independent DOM and CTX owner. */
export class AlertPopup extends MessagePopup {
  constructor(invocation: UiSurfaceOpenOptions, host: EjsPopupHost) {
    super('message.alert', invocation, host);
  }
}
