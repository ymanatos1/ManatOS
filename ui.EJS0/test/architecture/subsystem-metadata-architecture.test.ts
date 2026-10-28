import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MANATOS_COMPANY,
  allManatOSObjectMetadata,
  effectiveObjectKeys,
  resolvePlatform,
  subsystemContextCatalogue,
} from '@manatos/shared';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const shared = (path: string) => readFile(resolve(testDirectory, '../../../shared', path), 'utf8');

describe('subsystem metadata architecture', () => {
  it('gives every canonical object exactly one owning subsystem', () => {
    for (const metadata of Object.values(allManatOSObjectMetadata)) {
      expect(metadata.subsystem).toBeTruthy();
    }
  });

  it('projects ManatOS plus selected-platform subsystems with selected state and derived entities', () => {
    const platform = resolvePlatform(MANATOS_COMPANY);
    const catalogue = subsystemContextCatalogue(MANATOS_COMPANY, platform);
    expect(Object.keys(catalogue).sort()).toEqual([
      'applications',
      'auth',
      'configuration',
      'contacts',
      'licensing',
      'principals',
    ]);
    expect(Object.values(catalogue).every((subsystem) => subsystem.selected)).toBe(true);
    expect(catalogue.applications?.entities).toContain('sys-applications');
    expect(catalogue.auth?.entities).toContain('sys-users');
    expect(catalogue.auth?.enums).toContain('SysBOUserRole');
    expect(catalogue.auth?.enums).toContain('SysBOExtAuthProviderType');
    expect(catalogue.principals?.enums).toContain('SysBOPrincipalType');
  });

  it('derives availability from selected subsystems rather than company/platform entity lists', () => {
    const platform = resolvePlatform(MANATOS_COMPANY);
    const effectiveKeys = effectiveObjectKeys(MANATOS_COMPANY, platform);
    const expectedKeys = Object.values(subsystemContextCatalogue(MANATOS_COMPANY, platform))
      .filter((subsystem) => subsystem.selected)
      .flatMap((subsystem) => subsystem.entities);
    expect(effectiveKeys).toEqual(new Set(expectedKeys));
    // Other platforms' registered objects must not leak into this projection.
    expect(effectiveKeys.has('sys-guards')).toBe(false);
    expect(effectiveKeys.has('sys-projects')).toBe(false);
    expect(effectiveKeys.has('sys-posts')).toBe(false);
    expect(MANATOS_COMPANY).not.toHaveProperty('entities');
    expect(platform).not.toHaveProperty('entities');
  });

  it('keeps Principals independently selectable while suppressing Contact-dependent junctions', () => {
    const platform = resolvePlatform(MANATOS_COMPANY);
    const company = {
      ...MANATOS_COMPANY,
      subsystems: MANATOS_COMPANY.subsystems.map((entry) =>
        entry.key === 'contacts' ? { ...entry, selected: false } : entry,
      ),
    };
    const keys = effectiveObjectKeys(company, platform);
    expect(keys.has('sys-principals')).toBe(true);
    expect(keys.has('sys-addresses')).toBe(false);
    expect(keys.has('sys-principal-addresses')).toBe(false);
  });

  it('keeps Contact-specific country option projections under Contact UI ownership', async () => {
    const common = await shared('src/metadata/ui/common.ts');
    const contacts = await shared('src/metadata/ui/manatos/contacts/common.ts');
    const principals = await shared('src/metadata/ui/manatos/principals/ui-principals.ts');
    expect(common).not.toContain('systemCountryCatalog');
    expect(common).not.toContain('telephoneCountryOptions');
    expect(common).not.toContain('addressCountryOptions');
    expect(contacts).toContain('systemCountryCatalog');
    expect(contacts).toContain('telephoneCountryOptions');
    expect(contacts).toContain('addressCountryOptions');
    expect(principals).toContain("from '../contacts/common.js'");
  });

  it('declares cross-subsystem relationship dependencies in relationship metadata', async () => {
    const principalAddress = await shared(
      'src/metadata/bo/manatos/principals/bo-principal-addresses.ts',
    );
    expect(principalAddress).toContain("requiredSubsystems: ['contacts']");
  });
});
