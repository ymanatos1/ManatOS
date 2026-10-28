import { describe, expect, it } from 'vitest';
import { resolveMetadataText } from '@manatos/shared';
import { createMessagePopupDefinition } from '../../src/popups/messages/definitions.js';

/** Message popups retain language-neutral definitions across live language changes. */
describe('common message popup localization', () => {
  it('keeps inline EN/EL titles and actions until presentation-time resolution', () => {
    const popup = createMessagePopupDefinition(
      'message.alert',
      { EN: 'Registration completed', EL: 'Η εγγραφή ολοκληρώθηκε' },
      [{ id: 'ok', label: { EN: 'OK', EL: 'Εντάξει' } }],
    );
    const title = popup.view!.title.title;
    const action = popup.view!.actions[0]!;
    expect(resolveMetadataText(title, 'EN')).toBe('Registration completed');
    expect(resolveMetadataText(title, 'EL')).toBe('Η εγγραφή ολοκληρώθηκε');
    expect(resolveMetadataText(action.label, 'EN')).toBe('OK');
    expect(resolveMetadataText(action.label, 'EL')).toBe('Εντάξει');
    expect(action.id).toBe('ok');
  });

  it('retains destructive button intent without changing ordinary message actions', () => {
    const popup = createMessagePopupDefinition('message.alert', 'Delete configuration', [
      { id: 'dismiss', label: 'Cancel' },
      { id: 'delete', label: 'Delete', tone: 'danger' },
    ]);
    expect(popup.view?.actions.map((action) => [action.id, action.tone])).toEqual([
      ['dismiss', undefined],
      ['delete', 'danger'],
    ]);
    expect(popup.view?.actions.every((action) => action.dismissIfUnmapped)).toBe(true);
  });
});
