import type { UiPopupDefinition, UiPopupText } from '../popup-definition.js';

/** Presentation-only message surfaces: the invoking flow owns all effects. */
export type UiMessagePopupKind = 'message.alert' | 'message.error';

export interface UiMessagePopupButton {
  readonly id: string;
  readonly label: UiPopupText;
  readonly tone?: 'normal' | 'danger';
}

export function createMessagePopupDefinition(
  kind: UiMessagePopupKind,
  caption: UiPopupText,
  buttons: readonly UiMessagePopupButton[],
): UiPopupDefinition {
  return {
    id: kind,
    presentation: { content: 'message', variant: kind === 'message.error' ? 'error' : 'message' },
    showLanguageSelection: true,
    allowFontScale: true,
    allowDebugger: true,
    fields: [],
    rules: [],
    view: {
      id: 'message',
      title: {
        title: caption,
        subtitle: '',
        icon: kind === 'message.error' ? 'bi-exclamation-triangle' : 'bi-info-circle',
      },
      content: [
        { id: 'message-body', kind: 'note', icon: 'bi-info-circle', text: '' },
        { id: 'message-details', kind: 'note', icon: 'bi-list-nested', text: '' },
      ],
      actions: buttons.map(({ id, label, tone }) => ({
        id,
        label,
        type: 'button' as const,
        tone,
        primary: kind === 'message.error' && id === 'retry',
        dismissIfUnmapped: true,
      })),
    },
  };
}
