import type { StorageAdapterFieldDefinition } from '../../../adapter-definition.js';

/**
 * Shared declarative field fragments for relational adapters.
 *
 * This module is intentionally internal to storage. The System Settings UI
 * sees the concrete adapter definitions after these fragments are composed.
 */
export const rdbmsDatabaseField = Object.freeze({
  key: 'database',
  label: 'Database',
  description: 'Database/catalog ManatOS will use for its business data.',
  type: 'text',
  required: false,
  suggestedValue: 'ManatOS_DB',
}) satisfies StorageAdapterFieldDefinition;

export const rdbmsUserNameField = Object.freeze({
  key: 'userName',
  label: 'User name',
  description: 'Database login name used when the selected authentication mode requires one.',
  type: 'text',
  required: false,
}) satisfies StorageAdapterFieldDefinition;

export const rdbmsPasswordField = Object.freeze({
  key: 'password',
  label: 'Password',
  description: 'Database password. It is encrypted before being stored in system-settings.json.',
  type: 'password',
  required: false,
  secret: true,
}) satisfies StorageAdapterFieldDefinition;
