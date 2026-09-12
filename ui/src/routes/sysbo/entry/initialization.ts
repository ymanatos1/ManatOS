import type { SysBOMetadata, SysBOUIMetadata } from '@manatos/shared';

export interface EntryInitializationSeed {
  /** Canonical, non-sensitive entity fields in their normalized initial shape. */
  readonly fields: Readonly<Record<string, unknown>>;
  /** API-safe projection values that are not canonical entity fields. */
  readonly facts: Readonly<Record<string, unknown>>;
}

export interface EntryInitializationSeedRequest {
  readonly runtimeValues: Readonly<Record<string, unknown>>;
  readonly metadata: SysBOMetadata<Record<string, unknown>>;
  readonly uiMetadata?: SysBOUIMetadata;
  readonly mode: string;
}

/**
 * Build the normalized initial value/fact seed consumed by canonical entry runtimes.
 *
 * This is deliberately a pure normalization step. It does not evaluate dynamic
 * metadata defaults: each runtime resolves evaluator-backed defaults through its
 * own canonical expression/event pipeline after this deterministic static seed
 * exists. Keeping this normalization shared prevents initialization drift such as a
 * missing create-mode boolean becoming `false` in one engine but `null` in the
 * other and then breaking a strict boolean expression.
 */
export function buildEntryInitializationSeed(
  request: EntryInitializationSeedRequest,
): EntryInitializationSeed {
  const { runtimeValues, metadata, mode } = request;
  const canonicalKeys = new Set(Object.keys(metadata.fieldDefinition));

  const facts = Object.fromEntries(
    Object.entries(runtimeValues).filter(([key]) => !canonicalKeys.has(key)),
  );

  const fields: Record<string, unknown> = Object.fromEntries(
    Object.entries(runtimeValues).filter(
      ([key]) => canonicalKeys.has(key) && metadata.fieldDefinition[key]?.sensitive !== true,
    ),
  );

  for (const [key, field] of Object.entries(metadata.fieldDefinition)) {
    if (field.sensitive || Object.prototype.hasOwnProperty.call(fields, key)) continue;

    const createDefault = mode === 'create' ? field.createDefaultValue : undefined;
    const staticCreateDefault =
      createDefault === null || ['string', 'number', 'boolean'].includes(typeof createDefault)
        ? createDefault
        : undefined;

    if (staticCreateDefault !== undefined) {
      fields[key] = staticCreateDefault;
    } else if (field.type === 'boolean') {
      fields[key] = false;
    } else if (
      field.type === 'string' ||
      field.type === 'email' ||
      field.type === 'version' ||
      field.type === 'richText'
    ) {
      fields[key] = '';
    } else {
      // guid/date/datetime/number/enum/reference/duration have a natural empty value of null.
      fields[key] = null;
    }
  }

  return {
    fields: Object.freeze({ ...fields }),
    facts: Object.freeze({ ...facts }),
  };
}
