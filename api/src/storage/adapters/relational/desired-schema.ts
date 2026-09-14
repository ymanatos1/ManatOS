import {
  allManatOSObjectMetadata,
  type SysBOFieldMetadata,
  type SysBOFieldType,
} from '@manatos/shared';

export interface RdbmsDesiredColumn {
  name: string;
  fieldType: SysBOFieldType;
  required: boolean;
  maxLength?: number;
  /** Canonical semantic uniqueness requirement; physical realization is adapter strategy. */
  unique?: boolean;
  /** Canonical referenced BO key; physical FK realization is adapter strategy. */
  referenceBOKey?: string;
  /** Persisted calculation semantics remain adapter-neutral in the desired model. */
  calculation?: Readonly<{ expression: string; persisted: true }>;
}

export interface RdbmsDesiredTable {
  name: string;
  objectKey: string;
  columns: readonly RdbmsDesiredColumn[];
}

export interface RdbmsSchemaChange {
  kind: 'create-table' | 'add-column';
  table: string;
  column?: string;
  description: string;
}

export interface RdbmsSchemaInspection {
  ready: boolean;
  database: string;
  desiredVersion: number;
  changes: readonly RdbmsSchemaChange[];
  message: string;
}

export const MANATOS_RDBMS_SCHEMA_VERSION = 1;

const tableName = (key: string) => `m_${key.replace(/[^A-Za-z0-9]+/g, '_')}`;

function column(field: SysBOFieldMetadata): RdbmsDesiredColumn {
  return {
    name: field.key,
    fieldType: field.type,
    required: field.required === true && field.nullable !== true,
    ...(typeof field.maxLength === 'number' ? { maxLength: field.maxLength } : {}),
    ...(field.unique === true ? { unique: true } : {}),
    ...(field.referenceBOKey ? { referenceBOKey: field.referenceBOKey } : {}),
    ...(field.calculation?.persisted === true
      ? { calculation: { expression: field.calculation.expression, persisted: true as const } }
      : {}),
  };
}

/**
 * Canonical relational semantic projection derived from BO metadata rather than
 * duplicated in SQL Server/MariaDB code. It describes required semantics (for
 * example uniqueness, references and persisted calculations), not a specific
 * physical mechanism. Adapter strategy decides whether those semantics become
 * native constraints/generated values or adapter-side behavior.
 */
export const desiredRdbmsSchema: readonly RdbmsDesiredTable[] = Object.values(
  allManatOSObjectMetadata,
)
  .map((metadata) => ({
    name: tableName(metadata.key),
    objectKey: metadata.key,
    columns: Object.values(metadata.fieldDefinition)
      .filter((field) => !field.calculation || field.calculation.persisted === true)
      .map(column)
      .sort((a, b) => a.name.localeCompare(b.name)),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));
