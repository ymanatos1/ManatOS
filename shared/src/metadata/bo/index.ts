/**
 * Stable public façade for canonical ManatOS business-object metadata.
 * Concrete ownership lives under metadata/bo; consumers can keep importing
 * from @manatos/shared without depending on the internal folder structure.
 */
export * from './types.js';
export * from './contacts/bo-email-addresses.js';
export * from './principals/bo-principal-email-addresses.js';
export * from './contacts/bo-telephone-numbers.js';
export * from './principals/bo-principal-telephone-numbers.js';
export * from './contacts/bo-addresses.js';
export * from './principals/bo-principal-addresses.js';
export * from './auth/bo-users.js';
export * from './auth/bo-external-identities.js';
export * from './auth/bo-user-invitations.js';
export * from './auth/bo-ext-auth-providers.js';
export * from './principals/bo-principals.js';
export * from './platforms/protocrm/applications/bo-applications.js';
export * from './licensing/bo-licenses.js';
export * from './configuration/bo-configurations.js';
export * from './registry.js';
export * from '../subsystems/types.js';
export * from '../subsystems/registry.js';
