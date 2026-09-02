import ejs from 'ejs';
import { load } from 'cheerio';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { MANATOS_COMPANY } from '@manatos/shared';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const homeView = resolve(testDirectory, '../views/pages/home.ejs');
const homeLocals = (currentUser: unknown) => ({ currentUser, app: { company: MANATOS_COMPANY } });

describe('home presentation', () => {
  it('presents the platform visually without reusing ManatOS imagery', async () => {
    const html = await ejs.renderFile(homeView, homeLocals(null));
    const $ = load(html);

    expect($('.home-hero-grid').length).toBe(1);
    expect($('.home-hero-copy h2').text().trim()).toBe(
      'The data-driven platform to design and instantly test real applications',
    );
    expect($('.home-platform-map').length).toBe(1);
    expect($('.home-platform-app').text()).toContain('Business Application');
    expect($('.home-platform-app .bi-boxes').length).toBe(1);
    expect($('.home-platform-service').length).toBe(3);
    expect($('.home-platform-foundation').text()).toContain('Metadata Foundation');
    expect($('.home-benefit').length).toBe(3);
    expect($('.home-hero img').length).toBe(0);
  });

  it('uses visitor-facing account language for the registration action', async () => {
    const html = await ejs.renderFile(homeView, homeLocals(null));
    const $ = load(html);

    const createButton = $('[data-bs-target="#signUpMethodModal"]');
    expect(createButton.text()).toContain('Create account');
    expect(createButton.text()).not.toContain('Guest');
  });

  it('keeps signed-in session identity out of the Home hero', async () => {
    const html = await ejs.renderFile(homeView, homeLocals({ name: 'Yiannis', role: 'Admin' }));
    const $ = load(html);

    expect($('.welcome-panel').length).toBe(0);
    expect($('.home-hero-heading-row').hasClass('is-signed-in')).toBe(false);
    expect($('[data-bs-target="#signUpMethodModal"]').length).toBe(0);
  });
  it('serves the canonical M1 favicon from the conventional /favicon.ico route', async () => {
    const app = await readFile(resolve(testDirectory, '../src/app.ts'), 'utf8');
    const shell = await readFile(resolve(testDirectory, '../views/layout/shell.ejs'), 'utf8');

    expect(app).toContain("public/assets/m1/favicon.ico");
    expect(shell).toContain('/assets/m1/favicon.ico');
  });

});
