import { type Response } from 'express';

import {
  calculatedContextField,
  evaluateExpression,
  type ManatOSContext,
  type SysBOMetadata,
  type SysBOUIMetadata,
} from '@manatos/shared';

import type { SysBODefinition } from '../../sysbo/types.js';

import {
  contextFields,
  entityContextName,
  pageContextNode,
  pageEntryRuntimeContext,
  pageListRuntimeContext,
  registerContextEntity,
  setPageContext,
} from '../../context/manatos-context.js';

/**
 * Attach a SysBO list page as the root of the active logical page branch.
 *
 * Canonical BO/UI metadata is registered once under ctx.entities. The page
 * keeps only runtime state that is specific to this list instance.
 */
export function applySysBOListContext(
  res: Response,
  definition: SysBODefinition,
  values: Readonly<Record<string, unknown>>,
) {
  const ctx = res.locals.ctx as ManatOSContext;
  const { metadata, uiMetadata, items, query, ...pageValues } = values;

  registerContextEntity(
    ctx,
    definition.key,
    metadata ?? definition.boMetadata,
    uiMetadata,
  );

  const effectiveUI = uiMetadata as SysBOUIMetadata | undefined;
  const filterFields = effectiveUI?.list?.filterFields
    ?? [];
  const safeQuery = query && typeof query === 'object' && !Array.isArray(query)
    ? query as Readonly<Record<string, unknown>>
    : {};
  const safeItems = Array.isArray(items)
    ? items.filter((item): item is Readonly<Record<string, unknown>> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : [];
  const runtime = pageListRuntimeContext(safeItems, filterFields, safeQuery);

  const page = pageContextNode(
    entityContextName(definition.key),
    'sysbo-list',
    'list',
    contextFields({
      entity: entityContextName(definition.key),
      query: safeQuery,
      ...pageValues,
    }),
    null,
    runtime,
  );

  res.locals.ctx = setPageContext(ctx, page);
  return page;
}

/**
 * Attach a SysBO entry page beneath its logical list page.
 *
 * The child does not repeat entity identity or canonical metadata: lexical
 * resolution can find `entity` in its parent list page and canonical metadata
 * is always addressable through ctx.entities.
 */
export function applySysBOEntryContext(
  res: Response,
  definition: SysBODefinition,
  mode: string,
  entry: Record<string, unknown> | null,
  values: Readonly<Record<string, unknown>>,
) {
  const ctx = res.locals.ctx as ManatOSContext;
  const { metadata, uiMetadata, formValues, parentListContext, parentOwnerContext, editingCollections, ...pageValues } = values;

  registerContextEntity(
    ctx,
    definition.key,
    metadata ?? definition.boMetadata,
    uiMetadata,
  );

  const runtimeEntryValues =
    formValues && typeof formValues === 'object' && !Array.isArray(formValues)
      ? (formValues as Record<string, unknown>)
      : entry ?? {};

  const canonical = (metadata ?? definition.boMetadata) as SysBOMetadata<Record<string, unknown>>;
  const ui = uiMetadata as SysBOUIMetadata | undefined;

  /*
   * Build one normalized record-shaped baseline before creating either the
   * field contexts or entryOriginal/entry. This is especially important
   * in create mode: an empty API item still renders real field values (for
   * example enabled=true and null enum/reference selections), so CTX must start
   * with those same logical values rather than empty record snapshots.
   *
   * Sensitive fields are intentionally excluded from browser CTX. Dynamic
   * create defaults remain evaluator concerns; static defaults can safely seed
   * the initial record here.
   */
  /*
   * Start from the API-safe runtime projection, not only canonical persisted
   * fields. Some entities deliberately expose additional non-sensitive runtime
   * facts (for example password/secret *presence* booleans) that calculations
   * may consume even though those facts are not persisted entity properties.
   *
   * The API projection is the security boundary; known canonical sensitive
   * fields are still stripped defensively here. This keeps the entry-context
   * builder entity/field agnostic and avoids teaching it about hasPassword,
   * hasClientSecret, or any future projection-specific field.
   */
  const initialRecordValues: Record<string, unknown> = {
    ...Object.fromEntries(
      Object.entries(runtimeEntryValues).filter(([key]) => canonical.fieldDefinition[key]?.sensitive !== true),
    ),
    ...((editingCollections && typeof editingCollections === 'object' && !Array.isArray(editingCollections))
      ? editingCollections as Record<string, unknown>
      : {}),
  };

  for (const [key, field] of Object.entries(canonical.fieldDefinition)) {
    if (field.sensitive) continue;

    if (Object.prototype.hasOwnProperty.call(initialRecordValues, key)) {
      continue;
    }

    const createDefault = mode === 'create'
      ? ui?.record?.fieldOverrides?.[key]?.createDefaultValue
      : undefined;
    const staticCreateDefault =
      createDefault === null || ['string', 'number', 'boolean'].includes(typeof createDefault)
        ? createDefault
        : undefined;

    if (staticCreateDefault !== undefined) {
      initialRecordValues[key] = staticCreateDefault;
    } else if (field.type === 'boolean') {
      initialRecordValues[key] = false;
    } else if (field.type === 'string' || field.type === 'email' || field.type === 'version') {
      initialRecordValues[key] = '';
    } else {
      // guid/date/number/enum/reference have a natural empty CTX value of null.
      initialRecordValues[key] = null;
    }
  }

  const referenceData = pageValues.referenceData && typeof pageValues.referenceData === 'object' && !Array.isArray(pageValues.referenceData)
    ? pageValues.referenceData as Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>>
    : {};

  let entryFields = contextFields(
    {
      ...initialRecordValues,
      ...pageValues,
    },
    canonical.fieldDefinition,
    referenceData,
  );

  /*
   * Evaluator-backed create defaults are resolved generically against the same
   * field CTX that the page will expose. This lets metadata say things such as
   * `FirstCtx(platformId.options, 'value')` or `CurrentDay()` without teaching the
   * route about License, Platform, dates, or any other entity-specific rule.
   * The evaluated values become part of entryOriginal first; entry then
   * starts as its strict clone, preserving the page-state golden rule.
   */
  if (mode === 'create') {
    for (const [key, override] of Object.entries(ui?.record?.fieldOverrides ?? {})) {
      const dynamicDefault = override?.createDefaultValue;
      if (!dynamicDefault || typeof dynamicDefault !== 'object' || typeof dynamicDefault.expression !== 'string') {
        continue;
      }

      const currentValue = initialRecordValues[key];
      if (currentValue !== null && currentValue !== undefined && currentValue !== '') {
        continue;
      }

      try {
        initialRecordValues[key] = evaluateExpression(
          dynamicDefault.expression,
          ctx,
          entryFields,
          {
            source: 'ui-metadata',
            sourcePath: `record.fieldOverrides.${key}.createDefaultValue`,
            targetPath: `ctx.page.page.fields.${key}.value`,
            purpose: 'resolve metadata-driven create default',
          },
        );

        // Later defaults may depend on values resolved earlier in this pass.
        entryFields = contextFields(
          {
            ...initialRecordValues,
            ...pageValues,
          },
          canonical.fieldDefinition,
          referenceData,
        );
      } catch (error) {
        console.error(`[ManatOS create default] ${definition.key}.${key}`, error);
      }
    }
  }

  /*
   * Expression-backed UI fields become real calculated CTX variables. Parsing
   * happens here, when the context variable is declared, while variable/path
   * resolution remains completely lazy and context-dependent at value access.
   */
  // API $metadata-ui is already the effective UI contract. Current-EJS paths
  // do not use that contract, so fall back to canonical derived fields there.
  const effectiveDerivedFields = {
    ...(canonical.derivedFields ?? {}),
    ...(ui?.record?.derivedFields ?? {}),
  };
  for (const [derivedName, derived] of Object.entries(effectiveDerivedFields)) {
    if (!derived.expression) continue;
    entryFields[derivedName] = calculatedContextField(derived.expression, {
      value: initialRecordValues[derivedName],
      diagnosticSink: (diagnostic) => {
        console.error('[ManatOS expression parse]', diagnostic);
      },
    });
  }

  const entryPage = pageContextNode(
    'entry',
    'sysbo-entry',
    mode,
    entryFields,
    null,
    pageEntryRuntimeContext(initialRecordValues),
  );

  const parentList = parentListContext && typeof parentListContext === 'object' && !Array.isArray(parentListContext)
    ? parentListContext as Readonly<Record<string, unknown>>
    : {};
  const parentItems = Array.isArray(parentList.items)
    ? parentList.items.filter((item): item is Readonly<Record<string, unknown>> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : [];
  const parentQuery = parentList.query && typeof parentList.query === 'object' && !Array.isArray(parentList.query)
    ? parentList.query as Readonly<Record<string, unknown>>
    : {};
  const parentFilterFields = ui?.list?.filterFields
    ?? [];

  /*
   * The entry page is a logical child of the list page, not a replacement for
   * it. Rebuild the parent with its own runtime data so expressions in the
   * child can still inspect ctx.page.filters/entries while the entry scope is
   * active. The parent is discarded only when navigation leaves this hierarchy.
   */
  let childPage = entryPage;
  if (parentOwnerContext && typeof parentOwnerContext === 'object' && !Array.isArray(parentOwnerContext)) {
    const owner = parentOwnerContext as Readonly<Record<string, unknown>>;
    const ownerEntries = Array.isArray(owner.entries)
      ? owner.entries.filter((item): item is Readonly<Record<string, unknown>> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
      : [];
    const ownerEntriesOriginal = Array.isArray(owner.entriesOriginal)
      ? owner.entriesOriginal.filter((item): item is Readonly<Record<string, unknown>> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
      : [];
    const ownerFieldValues = owner.fields && typeof owner.fields === 'object' && !Array.isArray(owner.fields)
      ? owner.fields as Readonly<Record<string, unknown>>
      : {};
    childPage = pageContextNode(
      String(owner.name ?? 'organization'),
      String(owner.kind ?? 'sysbo-hierarchy'),
      String(owner.mode ?? 'edit'),
      contextFields(ownerFieldValues),
      entryPage,
      {
        entriesOriginal: Object.freeze(ownerEntriesOriginal.map((item) => Object.freeze({ ...item }))),
        entries: Object.freeze(ownerEntries.map((item) => Object.freeze({ ...item }))),
      },
    );
  }

  const listPage = pageContextNode(
    entityContextName(definition.key),
    'sysbo-list',
    'list',
    contextFields({
      entity: entityContextName(definition.key),
      ...(parentList.paging !== undefined ? { paging: parentList.paging } : {}),
      ...(parentList.permissions !== undefined ? { permissions: parentList.permissions } : {}),
      ...(parentList.referenceData !== undefined ? { referenceData: parentList.referenceData } : {}),
    }),
    childPage,
    pageListRuntimeContext(parentItems, parentFilterFields, parentQuery),
  );

  res.locals.ctx = setPageContext(ctx, listPage);
}
