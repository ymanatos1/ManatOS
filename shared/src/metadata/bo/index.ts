/**
 * Stable public façade for canonical ManatOS business-object metadata.
 * Concrete ownership lives under metadata/bo; consumers can keep importing
 * from @manatos/shared without depending on the internal folder structure.
 */
export * from './types.js';
export * from './relationships.js';
export * from './manatos/contacts/bo-email-addresses.js';
export * from './manatos/principals/bo-principal-email-addresses.js';
export * from './manatos/contacts/bo-telephone-numbers.js';
export * from './manatos/principals/bo-principal-telephone-numbers.js';
export * from './manatos/contacts/bo-addresses.js';
export * from './manatos/principals/bo-principal-addresses.js';
export * from './manatos/auth/bo-users.js';
export * from './manatos/auth/bo-external-identities.js';
export * from './manatos/auth/bo-user-invitations.js';
export * from './manatos/auth/bo-ext-auth-providers.js';
export * from './manatos/principals/bo-principals.js';
export * from './platforms/protocrm/applications/bo-applications.js';
export * from './platforms/panoptes/surveillance/bo-guards.js';
export * from './platforms/panoptes/surveillance/bo-projects.js';
export * from './platforms/panoptes/surveillance/bo-posts.js';
export * from './manatos/licensing/bo-licenses.js';
export * from './manatos/configuration/bo-configurations.js';
export * from './registry.js';
export * from '../subsystems/types.js';
export * from '../subsystems/registry.js';
