import type {
  UiMessagePopupKind,
  UiPopupDefinition,
  UiPopupLevel,
  UiSurfaceEventListener,
  UiSurfaceOpenOptions,
} from '@manatos/shared-ui';
import { createMessagePopupDefinition, type UiPopupText } from '@manatos/shared-ui';
import type { MultilingualLiteral } from '@manatos/shared';
import { PopupBase } from './PopupBase';
import { PopupContext } from '../../surfaces/PopupContext';

/**
 * Message-specific definition and invocation normalization ONLY.
 * Inherits the exact CTX, action, focus, modal and closing infrastructure
 * used by Sign In, Registration and Reset Password from PopupBase.
 */
export abstract class MessagePopup extends PopupBase {
  protected abstract readonly kind: UiMessagePopupKind;
  protected definition: UiPopupDefinition = createMessagePopupDefinition(
    'message.alert',
    '@CM.Notice',
    [{ id: 'ok', label: '@CM.Ok' }],
  );

  protected normalizeParams(
    params: Readonly<Record<string, unknown>>,
    _invocation: UiSurfaceOpenOptions,
  ): Record<string, unknown> {
    void _invocation; // Reserved for message-popup specializations.
    return { ...params };
  }

  override open(
    invocation: UiSurfaceOpenOptions = {},
    onSurfaceEvent?: UiSurfaceEventListener<UiPopupLevel>,
  ): PopupContext {
    const params = this.normalizeParams(invocation.params ?? {}, invocation);
    if (this.kind === 'message.alert') {
      params['illustration'] ??= '/_manatos/pages/messages/assets/info-illustration.svg';
    }
    params['contentPage'] ??= {
      folder: 'messages',
      name: this.kind === 'message.error' ? 'ErrorInfo' : 'Alert',
    };
    const specified = params['buttons'] ?? [{ id: 'ok', label: '@CM.Ok' }];
    if (!Array.isArray(specified)) throw new Error('Popup buttons must be an array.');
    const buttons = specified.map((item: unknown) => {
      if (!item || typeof item !== 'object') throw new Error('Invalid popup button.');
      const entry = item as Record<string, unknown>;
      if (typeof entry['id'] !== 'string' || !isPopupText(entry['label'])) {
        throw new Error('Popup buttons require an id and label.');
      }
      const tone = entry['tone'];
      if (tone !== undefined && tone !== 'normal' && tone !== 'danger') {
        throw new Error('Invalid popup button tone.');
      }
      return {
        id: entry['id'] as string,
        label: entry['label'] as UiPopupText,
        ...(tone ? { tone: tone as 'normal' | 'danger' } : {}),
      };
    });
    if (new Set(buttons.map((item) => item.id)).size !== buttons.length) {
      throw new Error('Duplicate popup button ID.');
    }
    const caption: UiPopupText = isPopupText(params['caption']) ? params['caption'] : '@CM.Notice';
    this.definition = createMessagePopupDefinition(this.kind, caption, buttons);
    return super.open({ ...invocation, params }, onSurfaceEvent);
  }
}

function isPopupText(value: unknown): value is string | MultilingualLiteral {
  if (typeof value === 'string') return true;
  if (value === null || typeof value !== 'object') return false;
  const literal = value as Record<string, unknown>;
  return (
    typeof literal['EN'] === 'string' &&
    (literal['EL'] === undefined || typeof literal['EL'] === 'string')
  );
}
