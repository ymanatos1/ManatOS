import { PopupFooterActions } from './PopupFooterActions';
/** UIS boundary: This named Error popup shares title/body/actions with other messages but preserves its error-specific close/retry policy; do not add a parallel CTX runtime. This ownership separation is intentional; preserve it in future migrations. */
import { Component } from '@angular/core';
import type { UiSurfaceOpenOptions } from '@manatos/shared-ui';
import { PopupTitle } from '../../surfaces/PopupTitle';
import { AuthPopupActions } from '../../auth/AuthPopupActions';
import { PopupBodyOutlet } from './PopupBodyOutlet';

import { MessagePopup } from './MessagePopup';

/** Structured ErrorInfo presentation; retry policy belongs to the caller/Flow. */
@Component({
  selector: 'manatos-error-popup',
  standalone: true,
  imports: [PopupTitle, AuthPopupActions, PopupBodyOutlet, PopupFooterActions],
  templateUrl: './Popup.html',
  styleUrls: ['../../auth/AuthPopup.css', '../../auth/RegisterPopup.css'],
})
export class ErrorPopup extends MessagePopup {
  protected readonly kind = 'message.error' as const;

  protected override normalizeParams(
    params: Readonly<Record<string, unknown>>,
    invocation: UiSurfaceOpenOptions,
  ): Record<string, unknown> {
    const source = params['errorInfo'] ?? params['error'];
    const error = source && typeof source === 'object' ? (source as Record<string, unknown>) : {};
    const retry =
      error['retryable'] === true &&
      Boolean(invocation.flow?.events['retry'] ?? invocation.events?.['retry']);
    return {
      ...params,
      caption: params['caption'] ?? '@CM.OperationFailed',
      text:
        params['text'] ?? error['userMessage'] ?? error['message'] ?? '@CM.OperationNotCompleted',
      operationTrace: params['operationTrace'] ?? error['operationTrace'] ?? [],
      buttons: params['buttons'] ?? [
        { id: 'cancel', label: '@CM.Cancel' },
        ...(retry ? [{ id: 'retry', label: '@CM.Retry' }] : []),
      ],
    };
  }
}
