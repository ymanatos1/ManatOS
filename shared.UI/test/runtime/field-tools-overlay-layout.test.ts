import { describe, expect, it } from 'vitest';
import { resolveUiSurfaceSelector } from '../../src/debugger/layout/UiSurfaceLayoutHighlight.js';

describe('detached Field Tools CTX correlation', () => {
  it('highlights a floating menu/action only in its exact owning Entry level', () => {
    const owner = 'ui.levels.entry';
    const box = { left: 1, top: 1, right: 15, bottom: 20 };
    const action = {
      getClientRects: () => [box],
      closest: (selector: string) => (selector === '[data-ui-overlay-owner-path]' ? menu : null),
    };
    const menu = {
      dataset: { uiOverlayOwnerPath: owner, uiOverlayField: 'firstName' },
      getClientRects: () => [box],
      closest: (selector: string) => (selector === '[data-ui-overlay-owner-path]' ? menu : null),
      querySelectorAll: (selector: string) =>
        selector === '[data-entry-field-action="copy"]' ? [action] : [],
    };
    const root = {
      dataset: { uiLevelPath: owner },
      isConnected: true,
      getClientRects: () => [box],
      matches: () => false,
      querySelectorAll: () => [],
    };
    const document = {
      querySelectorAll: (selector: string) =>
        selector === '[data-ui-level-path]'
          ? [root]
          : selector ===
              '[data-ui-overlay-owner-path][data-ui-overlay-field].manatos-field-tool-menu'
            ? [menu]
            : [],
    } as unknown as Document;
    const parent = '[data-entry-field="firstName"] .manatos-field-tools';
    expect(
      resolveUiSurfaceSelector(document, owner, `${parent} .manatos-field-tool-menu`),
    ).toMatchObject({
      status: 'FOUND',
      matches: [menu],
    });
    expect(
      resolveUiSurfaceSelector(document, owner, `${parent} [data-entry-field-action="copy"]`),
    ).toMatchObject({ status: 'FOUND', matches: [action] });
    expect(
      resolveUiSurfaceSelector(
        document,
        owner,
        '[data-entry-field="lastName"] .manatos-field-tools .manatos-field-tool-menu',
      ).status,
    ).toBe('NO_MATCH');
  });
});
