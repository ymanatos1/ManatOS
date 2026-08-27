import ejs from 'ejs';
import { load } from 'cheerio';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { getSysBODefinition } from '../src/sysbo/definitions.js';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const listView = resolve(testDirectory, '../views/pages/bo-list.ejs');

describe('external authentication provider list presentation', () => {
  it('keeps the provider list operational and omits raw Client ID', () => {
    const fields = getSysBODefinition('sys-ext-auth-providers').uiMetadata.gridConfiguration.visibleFields;

    expect(fields).toEqual([
      'provider',
      'enabled',
      'callbackPath',
      'credentialsConfigured',
    ]);
  });

  it('renders provider corporate names as links to edit/review pages', async () => {
    const definition = getSysBODefinition('sys-ext-auth-providers');
    const html = await ejs.renderFile(listView, {
      hasAnyEntries: true,
      definition,
      permissions: { view: true, create: true, edit: true, delete: true },
      items: [
        {
          id: 'provider-microsoft',
          provider: 'microsoft',
          enabled: true,
          callbackPath: '/auth/microsoft/callback',
          clientId: 'client-id',
          credentialsConfigured: true,
        },
        {
          id: 'provider-github',
          provider: 'github',
          enabled: true,
          callbackPath: '/auth/github/callback',
          clientId: 'github-client-id',
          credentialsConfigured: true,
        },
      ],
      paging: { total: 2, page: 1, pageSize: 10, totalPages: 1 },
      query: { pageSize: '10' },
    });

    const $ = load(html);
    const rows = $('tbody tr');

    expect(rows.eq(0).find('td').eq(0).text().trim()).toBe('Microsoft');
    expect(rows.eq(0).find('td').eq(0).find('a').attr('href')).toBe(
      '/bo/sys-ext-auth-providers/provider-microsoft',
    );
    expect(rows.eq(1).find('td').eq(0).text().trim()).toBe('GitHub');
    expect(rows.eq(1).find('td').eq(0).find('a').attr('href')).toBe(
      '/bo/sys-ext-auth-providers/provider-github',
    );
  });
});
