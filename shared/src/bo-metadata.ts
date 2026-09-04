/**
 * Stable public façade for canonical ManatOS business-object metadata.
 * Concrete ownership lives under metadata/bo; consumers can keep importing
 * from @manatos/shared without depending on the internal folder structure.
 */
export * from './metadata/bo/types.js';
export * from './metadata/bo/contact.js';
export * from './metadata/bo/identity.js';
export * from './metadata/bo/business.js';
export * from './metadata/bo/registry.js';
