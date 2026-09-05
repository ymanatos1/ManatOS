import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderFile } from 'ejs';
import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const filtersPath = resolve(testDirectory, '../views/components/sysbo/list/list-filters.ejs');

const metadata = {
  fieldDefinition: {
    name: { key: 'name', label: 'Name', type: 'string' },
    principalType: {
      key: 'principalType',
      label: 'Principal type',
      type: 'enum',
      enumValues: ['Person', 'Company'],
      enumItems: [],
    },
  },
};

describe('metadata list filter EJS transport contract', () => {
  it('renders canonical browser form names without escaped quote characters', async () => {
    const html = await renderFile(filtersPath, {
      selectorMode: false,
      filterFields: ['name', 'principalType'],
      hasActiveFilters: true,
      filterCollapseId: 'metadata-filters-sys-principals',
      metadata,
      query: { 'filter.name': 'Yiannis', 'filter.principalType': 'Person' },
      enumItem: (_field: unknown, value: string) => ({ label: value }),
      listReferenceValues: {},
      definition: { key: 'sys-principals' },
    });

    expect(html).toContain('name="filter.name"');
    expect(html).toContain('name="filter.principalType"');
    expect(html).not.toContain('name=&#34;');
    expect(html).not.toContain('filter__');
  });

  it('keeps selector filters as data attributes rather than form fields', async () => {
    const html = await renderFile(filtersPath, {
      selectorMode: true,
      filterFields: ['name'],
      hasActiveFilters: false,
      filterCollapseId: 'selector-filters',
      metadata,
      query: {},
      enumItem: (_field: unknown, value: string) => ({ label: value }),
      listReferenceValues: {},
      definition: { key: 'sys-principals' },
    });

    expect(html).toContain('data-selector-field-filter="name"');
    expect(html).not.toContain('name="filter.name"');
  });
});
