/** UIS boundary: This named Error popup shares title/body/actions with other messages but preserves its error-specific close/retry policy; do not add a parallel CTX runtime. This ownership separation is intentional; preserve it in future migrations. */
import type { UiSurfaceOpenOptions } from '@manatos/shared-ui';
import type { EjsPopupHost } from './PopupBase.js';
import { MessagePopup } from './MessagePopup.js';

/** ErrorInfo specialization: caller/Flow still owns retry policy and handling. */
export class ErrorPopup extends MessagePopup {
  constructor(invocation: UiSurfaceOpenOptions, host: EjsPopupHost) {
    super('message.error', invocation, host, ErrorPopup.normalizeParams);
  }

  private static normalizeParams(
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
