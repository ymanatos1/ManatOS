import { sysBOUsersMetadata } from './manatos/auth/bo-users.js';
import { sysBOExternalIdentityMetadata } from './manatos/auth/bo-external-identities.js';
import { sysBOUserInvitationMetadata } from './manatos/auth/bo-user-invitations.js';
import { sysBOExtAuthProvidersMetadata } from './manatos/auth/bo-ext-auth-providers.js';
import { sysBOEmailAddressesMetadata } from './manatos/contacts/bo-email-addresses.js';
import { sysBOPrincipalEmailAddressesMetadata } from './manatos/principals/bo-principal-email-addresses.js';
import { sysBOTelephoneNumbersMetadata } from './manatos/contacts/bo-telephone-numbers.js';
import { sysBOPrincipalTelephoneNumbersMetadata } from './manatos/principals/bo-principal-telephone-numbers.js';
import { sysBOAddressesMetadata } from './manatos/contacts/bo-addresses.js';
import { sysBOPrincipalAddressesMetadata } from './manatos/principals/bo-principal-addresses.js';
import { sysBOPrincipalsMetadata } from './manatos/principals/bo-principals.js';
import { sysBOApplicationsMetadata } from './platforms/protocrm/applications/bo-applications.js';
import { sysBOLicensesMetadata } from './manatos/licensing/bo-licenses.js';
import { sysBOConfigurationsMetadata } from './manatos/configuration/bo-configurations.js';
import { resolveRelationshipDefinitions, validateRelationshipMetadata } from './relationships.js';

/** Canonical related/value-object metadata that is not exposed as generic SysBO CRUD. */
export const allManatOSValueObjectMetadata = {
  [sysBOExternalIdentityMetadata.key]: sysBOExternalIdentityMetadata,
  [sysBOUserInvitationMetadata.key]: sysBOUserInvitationMetadata,
} as const;

/** Canonical registry of every first-class SysBO. */
export const allSysBOMetadata = {
  [sysBOUsersMetadata.key]: sysBOUsersMetadata,
  [sysBOPrincipalsMetadata.key]: sysBOPrincipalsMetadata,
  [sysBOEmailAddressesMetadata.key]: sysBOEmailAddressesMetadata,
  [sysBOPrincipalEmailAddressesMetadata.key]: sysBOPrincipalEmailAddressesMetadata,
  [sysBOTelephoneNumbersMetadata.key]: sysBOTelephoneNumbersMetadata,
  [sysBOPrincipalTelephoneNumbersMetadata.key]: sysBOPrincipalTelephoneNumbersMetadata,
  [sysBOAddressesMetadata.key]: sysBOAddressesMetadata,
  [sysBOPrincipalAddressesMetadata.key]: sysBOPrincipalAddressesMetadata,
  [sysBOApplicationsMetadata.key]: sysBOApplicationsMetadata,
  [sysBOLicensesMetadata.key]: sysBOLicensesMetadata,
  [sysBOExtAuthProvidersMetadata.key]: sysBOExtAuthProvidersMetadata,
  [sysBOConfigurationsMetadata.key]: sysBOConfigurationsMetadata,
} as const;

/** All canonical objects, used by relationship/report/designer registries. */
export const allManatOSObjectMetadata = {
  ...allSysBOMetadata,
  ...allManatOSValueObjectMetadata,
} as const;

for (const metadata of Object.values(allManatOSObjectMetadata)) {
  validateRelationshipMetadata(metadata);
  for (const [relationshipKey, relationship] of Object.entries(metadata.relationships ?? {})) {
    const target =
      allManatOSObjectMetadata[
        relationship.references.objectKey as keyof typeof allManatOSObjectMetadata
      ];
    if (!target) {
      throw new Error(
        `Relationship ${metadata.key}.${relationshipKey} targets unknown object ${relationship.references.objectKey}`,
      );
    }
    relationship.fields.forEach((sourceFieldKey, index) => {
      const targetFieldKey = relationship.references.fields[index];
      const sourceField = metadata.fieldDefinition[sourceFieldKey];
      const targetField = targetFieldKey ? target.fieldDefinition[targetFieldKey] : undefined;
      if (!sourceField || !targetField) {
        throw new Error(
          `Relationship ${metadata.key}.${relationshipKey} maps an unknown source/target field`,
        );
      }
      const compatibleTypes =
        sourceField.type === targetField.type ||
        (sourceField.type === 'reference' && targetField.type === 'guid') ||
        (sourceField.type === 'string' && targetField.type === 'enum') ||
        (sourceField.type === 'enum' && targetField.type === 'string');
      if (!compatibleTypes) {
        throw new Error(
          `Relationship ${metadata.key}.${relationshipKey} maps incompatible field types ${sourceField.type}/${targetField.type}`,
        );
      }
    });
  }
}

/**
 * Process-local canonical relationship catalogue. 18C runtime consumers use
 * this instead of independently rescanning BO fields/relationship maps.
 */
export const allManatOSRelationshipDefinitions =
  resolveRelationshipDefinitions(allManatOSObjectMetadata);
