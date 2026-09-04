import ejs from 'ejs';
import { load } from 'cheerio';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { MANATOS_COMPANY, resolvePlatform } from '@manatos/shared';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const platformView = resolve(testDirectory, '../views/pages/platform.ejs');
const headerView = resolve(testDirectory, '../views/components/layout/header.ejs');

describe('platform presentation', () => {
  it('renders protoCRM from shared platform metadata rather than page literals', async () => {
    const platform = resolvePlatform(MANATOS_COMPANY);
    const html = await ejs.renderFile(platformView, { platform });
    const $ = load(html);

    expect($('.platform-hero-image').attr('src')).toBe('/assets/platforms/protocrm/protocrm-customer-network.png');
    expect($('.platform-feature-card').length).toBe(6);
    expect($('.platform-feature-card').text()).toContain('Customer 360°');
    expect($('.platform-feature-card').text()).toContain('Documents');
    expect($('.platform-feature-card').text()).toContain('Analytics');
  });

  it('makes the current-platform top-header badge a platform-page link', async () => {
    const currentPlatform = resolvePlatform(MANATOS_COMPANY);
    const html = await ejs.renderFile(headerView, {
      app: { company: MANATOS_COMPANY, currentPlatform, version: '0.1.0' },
      currentUser: null,
    });
    const $ = load(html);

    expect($('.current-platform-badge').attr('href')).toBe('/platform/protocrm');
    expect($('.current-platform-badge').text().trim()).toBe('protoCRM');
    expect($('.current-platform-badge .bi-boxes').length).toBe(1);
    expect($('.version-badge').attr('title')).toBe('ManatOS version');
    expect($('.header-brand-area').children().index($('.version-badge'))).toBeLessThan(
      $('.header-brand-area').children().index($('.current-platform-badge')),
    );
  });
  it('keeps Donate reactive in the DOM and applies the initial DONATIONS_SHOW visibility', async () => {
    const currentPlatform = resolvePlatform(MANATOS_COMPANY);
    const baseApp = { company: MANATOS_COMPANY, currentPlatform, version: '0.1.0' };

    const hiddenHtml = await ejs.renderFile(headerView, {
      app: { ...baseApp, ui: { bootstrap: { ui: { donationsShow: false } } } },
      currentUser: null,
    });
    const hidden$ = load(hiddenHtml);
    expect(hidden$('.header-donate-button').length).toBe(1);
    expect(hidden$('.header-donate-button').hasClass('d-none')).toBe(true);

    const shownHtml = await ejs.renderFile(headerView, {
      app: { ...baseApp, ui: { bootstrap: { ui: { donationsShow: true } } } },
      currentUser: null,
    });
    const $ = load(shownHtml);
    expect($('.header-donate-button').text().trim()).toBe('Donate');
    expect($('.header-donate-button').hasClass('d-none')).toBe(false);
    expect($('.header-donate-button').is(':disabled')).toBe(true);
  });

});
