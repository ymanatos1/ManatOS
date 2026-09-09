/**
 * Stable public façade for canonical ManatOS business-object metadata.
 * Concrete ownership lives under metadata/bo; consumers can keep importing
 * from @manatos/shared without depending on the internal folder structure.
 */
export * from './types.js';
export * from './contact.js';
export * from './identity.js';
export * from './business.js';
export * from './registry.js';
