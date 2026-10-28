/**
 * Stable public façade for framework-neutral SysBO UI metadata.
 * Concrete ownership lives under metadata/ui.
 */
export * from './types.js';
export * from './manatos/auth/ui-users.js';
export * from './manatos/auth/ui-ext-auth-providers.js';
export * from './manatos/principals/ui-principals.js';
export * from './platforms/protocrm/applications/ui-applications.js';
export * from './platforms/panoptes/surveillance/ui-guards.js';
export * from './platforms/panoptes/surveillance/ui-projects.js';
export * from './platforms/panoptes/surveillance/ui-posts.js';
export * from './manatos/licensing/ui-licenses.js';
export * from './registry.js';

export * from './common.js';

export * from './view-resolution.js';

export * from './manatos/auth/ui-external-identities.js';
export * from './manatos/contacts/ui-addresses.js';
export * from './manatos/contacts/ui-email-addresses.js';
export * from './manatos/contacts/ui-telephone-numbers.js';
