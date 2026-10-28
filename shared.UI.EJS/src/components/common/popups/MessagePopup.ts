import {
  createMessagePopupDefinition,
  type UiPopupDefinition,
  type UiPopupText,
  type UiSurfaceOpenOptions,
} from '@manatos/shared-ui';
import { PopupBase, type EjsPopupHost } from './PopupBase.js';

export type MessageKind = 'message.alert' | 'message.error';
export interface PreparedMessagePopup {
  readonly definition: UiPopupDefinition;
  readonly invocation: UiSurfaceOpenOptions;
}

/** Message specialization uses the same per-popup lifecycle and CTX runtime as Auth. */
export abstract class MessagePopup extends PopupBase {
  protected constructor(
    kind: MessageKind,
    invocation: UiSurfaceOpenOptions,
    host: EjsPopupHost,
    normalize: (
      params: Readonly<Record<string, unknown>>,
      invocation: UiSurfaceOpenOptions,
    ) => Record<string, unknown> = (params) => ({ ...params }),
  ) {
    const prepared = MessagePopup.prepare(kind, invocation, normalize);
    super(kind, prepared.definition, prepared.invocation, host);
  }

  private static prepare(
    kind: MessageKind,
    invocation: UiSurfaceOpenOptions,
    normalize: (
      params: Readonly<Record<string, unknown>>,
      invocation: UiSurfaceOpenOptions,
    ) => Record<string, unknown>,
  ): PreparedMessagePopup {
    const params = normalize(invocation.params ?? {}, invocation);
    if (kind === 'message.alert') {
      params['illustration'] ??= '/_manatos/pages/messages/assets/info-illustration.svg';
    }
    params['contentPage'] ??= {
      folder: 'messages',
      name: kind === 'message.error' ? 'ErrorInfo' : 'Alert',
    };
    const supplied = params['buttons'] ?? [{ id: 'ok', label: '@CM.Ok' }];
    if (!Array.isArray(supplied)) throw new Error('Popup buttons must be an array.');
    const buttons = supplied.map((entry: unknown) => {
      if (entry === null || typeof entry !== 'object') throw new Error('Invalid popup button.');
      const value = entry as Record<string, unknown>;
      if (typeof value['id'] !== 'string' || !isPopupText(value['label']))
        throw new Error('Popup buttons require an id and label.');
      return {
        id: value['id'],
        label: value['label'],
        tone: value['tone'] === 'danger' ? ('danger' as const) : ('normal' as const),
      };
    });
    if (new Set(buttons.map((button) => button.id)).size !== buttons.length)
      throw new Error('Duplicate popup button ID.');
    const caption: UiPopupText = isPopupText(params['caption']) ? params['caption'] : '@CM.Notice';
    return {
      definition: createMessagePopupDefinition(kind, caption, buttons),
      invocation: { ...invocation, params },
    };
  }
}

function isPopupText(value: unknown): value is UiPopupText {
  if (typeof value === 'string') return true;
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record['EN'] === 'string' &&
    (record['EL'] === undefined || typeof record['EL'] === 'string')
  );
}
