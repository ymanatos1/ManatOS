import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SysBOExtAuthProviderType } from '../../../shared/src/domain/entities.js';
import {
  SYSBO_EXT_AUTH_PROVIDER_TYPE_ENUM,
  externalAuthProviderOptionItems,
} from '../../../shared/src/metadata/subsystems/manatos/auth.js';
import { sysBOExternalIdentityMetadata } from '../../../shared/src/metadata/bo/manatos/auth/bo-external-identities.js';
import { sysBOUsersMetadata } from '../../../shared/src/metadata/bo/manatos/auth/bo-users.js';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('generic discrete-value option presentation', () => {
  it('owns the closed external-provider enum in the auth subsystem without a second catalogue', () => {
    const provider = source(
      '../../../shared/src/metadata/bo/manatos/auth/bo-ext-auth-providers.ts',
    );

    expect(SYSBO_EXT_AUTH_PROVIDER_TYPE_ENUM.key).toBe('SysBOExtAuthProviderType');
    expect(provider).toContain("enum: 'SysBOExtAuthProviderType'");
    expect(provider).not.toContain('enumValues:');
    expect(provider).not.toContain('enumItems:');
    expect(externalAuthProviderOptionItems).toEqual(
      Object.values(SYSBO_EXT_AUTH_PROVIDER_TYPE_ENUM.values),
    );
  });
  it('supports presentation-only optionItems without turning open string fields into enums', () => {
    const provider = sysBOExternalIdentityMetadata.fieldDefinition.provider;

    expect(provider?.type).toBe('string');
    expect(provider?.optionItems).toBe(externalAuthProviderOptionItems);
    expect(externalAuthProviderOptionItems.length).toBeGreaterThan(0);
  });

  it('renders option labels/icons generically in lists, related collections and entry display names', () => {
    const list = source('../../views/components/runtime/entity-list.ejs');
    const rowCells = source('../../views/components/sysbo/list/list-row-cells.ejs');
    const related = source('../../views/components/sysbo/entry/content/related-collections.ejs');
    const entry = source('../../views/components/runtime/entity-entry.ejs');
    const supplemental = source('../../src/routes/sysbo/entry/supplemental-data.ts');

    expect(list).toContain('const optionItem = metadataOptionItemForField;');
    expect(list).toContain("include('../sysbo/list/list-row-cells'");
    expect(rowCells).toContain('primaryOptionItem');
    expect(related).toContain('optionItemForField(canonicalField, renderedValue.raw)');
    expect(related).not.toContain("collectionField.format === 'auth-provider'");
    expect(entry).toContain('const optionItemForField = metadataOptionItemForField;');
    expect(supplemental).toContain('primaryField?.optionItems || []');
    expect(supplemental).not.toContain('providerDefinition?.label ?? displayValue');
  });

  it('uses canonical option metadata instead of domain-specific value formatters', () => {
    const verificationSources =
      sysBOUsersMetadata.fieldDefinition.emailVerificationSource?.optionItems;
    const entry = source('../../views/components/runtime/entity-entry.ejs');
    const presentation = source('../../src/presentation/metadata/value-presentation.ts');

    expect(verificationSources?.[0]).toEqual({
      value: 'internal',
      label: 'ManatOS',
      icon: 'shield-check',
    });
    expect(verificationSources?.slice(1)).toEqual(externalAuthProviderOptionItems);
    expect(entry).not.toContain("presentation.format === 'verification-source'");
    expect(presentation).not.toContain('verification-source');
  });

  it('keeps optional provider option traits structurally present for strict expression paths', () => {
    for (const providerType of [
      SysBOExtAuthProviderType.Google,
      SysBOExtAuthProviderType.Facebook,
      SysBOExtAuthProviderType.GitHub,
    ]) {
      const provider = externalAuthProviderOptionItems.find((item) => item.value === providerType);
      expect(provider).toBeDefined();
      expect(provider?.tenant).toBeNull();
      expect(provider?.callbackPath).toBeTruthy();
    }
  });
});
