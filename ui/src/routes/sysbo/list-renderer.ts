import type { Request, Response } from 'express';

import {
  evaluateExpression,
  resolveEntryRepresentation,
  entryTypeSource,
  type ManatOSContext,
} from '@manatos/shared';

import { apiClient } from '../../api/client.js';
import { apiSessionOptions } from '../../auth/api-session.js';
import { renderPage } from '../../presentation/render-page.js';
import { metadataComponentPartialFor } from '../../presentation/metadata-component-registry.js';
import type { SysBODefinition } from '../../sysbo/types.js';
import { applySysBOListContext } from './context.js';
import { metadataDrivenListQuery, metadataEntrySearchField } from './list-query.js';
import {
  apiPathFor,
  canonicalSysBOMetadata,
  canonicalSysBOUIMetadata,
  references,
  type SysBOListData,
} from './data-access.js';
import type { UIEntityPermissions } from '../../sysbo/permissions.js';

/**
 * Render one canonical metadata-driven SysBO browse/list page.
 *
 * This module owns list data acquisition and page presentation composition;
 * route registration remains in sysbo-routes.ts.
 */
export async function renderMetadataDrivenList(
  req: Request,
  res: Response,
  definition: SysBODefinition,
  permissions: UIEntityPermissions,
): Promise<void> {
  const [metadata, metadataUI] = await Promise.all([
    canonicalSysBOMetadata(req, definition),
    canonicalSysBOUIMetadata(req, definition),
  ]);
  const apiPath = apiPathFor(definition.key);
  const listQuery = metadataDrivenListQuery(
    req,
    metadataUI,
    req.query,
    metadataEntrySearchField(metadata),
  );
  const response = await apiClient.get<SysBOListData<Record<string, unknown>>>(
    `/api/v1/${apiPath}?${listQuery.params.toString()}`,
    apiSessionOptions(req),
  );

  let hasAnyEntries = response.data.paging.total > 0;
  const filtersActive =
    Boolean(listQuery.query.search) ||
    metadataUI.list.filterFields.some((field) => Boolean(listQuery.query[`filter.${field}`]));

  if (!hasAnyEntries && filtersActive) {
    const unfiltered = await apiClient.get<SysBOListData<Record<string, unknown>>>(
      `/api/v1/${apiPath}?page=1&pageSize=1`,
      apiSessionOptions(req),
    );
    hasAnyEntries = unfiltered.data.paging.total > 0;
  }

  let addConstraintReached = false;
  const addConstraintFieldKey = metadataUI.list.addAction.disableWhenAllEnumValuesExistForField;
  if (addConstraintFieldKey) {
    const constraintField = metadata.fieldDefinition[addConstraintFieldKey];
    if (constraintField?.type === 'enum' && (constraintField.enumValues?.length ?? 0) > 0) {
      let totalEntries = response.data.paging.total;
      if (filtersActive) {
        const unfiltered = await apiClient.get<SysBOListData<Record<string, unknown>>>(
          `/api/v1/${apiPath}?page=1&pageSize=1`,
          apiSessionOptions(req),
        );
        totalEntries = unfiltered.data.paging.total;
      }
      addConstraintReached = totalEntries >= (constraintField.enumValues?.length ?? 0);
    }
  }

  const entryType = entryTypeSource<Record<string, unknown>>(metadata);
  const entryTypeField =
    entryType && 'field' in entryType
      ? entryType.field
      : entryType &&
          'expression' in entryType &&
          /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(entryType.expression.trim())
        ? entryType.expression.trim()
        : null;
  const entryUsesRelations = Object.values(metadata.entry ?? {}).some(
    (source) => source && 'expression' in source && source.expression.includes('relations.'),
  );
  const listReferenceFields = [
    ...new Set([
      ...metadataUI.list.visibleFields,
      ...metadataUI.list.filterFields,
      ...(entryTypeField ? [entryTypeField] : []),
    ]),
  ];
  const listReferenceData =
    listReferenceFields.some(
      (fieldKey) => metadata.fieldDefinition[fieldKey]?.type === 'reference',
    ) || entryUsesRelations
      ? await references(req, definition)
      : {};

  const listPage = applySysBOListContext(res, definition, {
    metadata,
    uiMetadata: metadataUI,
    items: response.data.items,
    paging: response.data.paging,
    query: { ...listQuery.query, pageSize: String(response.data.paging.pageSize) },
    permissions,
    // This is a CTX fact, not UI policy. Metadata decides whether reaching the
    // generic constraint disables Add; the route only derives the fact from data.
    addConstraintReached,
    referenceData: listReferenceData,
  });
  const listItems = listPage.entries ?? [];
  const entryRepresentations = new Map(
    listItems.map((item) => [
      String(item.id ?? ''),
      resolveEntryRepresentation<Record<string, unknown>>(metadata, metadataUI, item, {
        entityIcon: definition.icon,
        referenceData: listReferenceData,
      }),
    ]),
  );

  const resolveAddActionValue = (value: unknown, property: string): unknown => {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      typeof (value as { expression?: unknown }).expression !== 'string'
    ) {
      return value;
    }
    return evaluateExpression(
      (value as { expression: string }).expression,
      res.locals.ctx as ManatOSContext,
      listPage.fields,
      {
        source: 'ui-metadata',
        sourcePath: `list.addAction.${property}`,
        targetPath: `list.addAction.${property}`,
        purpose: `resolve list Add ${property}`,
      },
    );
  };

  const resolvedAddAction = {
    ...metadataUI.list.addAction,
    resolvedVisible: resolveAddActionValue(metadataUI.list.addAction.visible, 'visible') !== false,
    resolvedEnabled:
      resolveAddActionValue(metadataUI.list.addAction.enabled ?? true, 'enabled') !== false,
    resolvedDisabledReason: resolveAddActionValue(
      metadataUI.list.addAction.disabledReason ?? null,
      'disabledReason',
    ),
  };

  const resolvedPageActions = Object.entries(metadataUI.list.pageActions ?? {})
    .map(([key, action]) => {
      const visible =
        !action.visible || typeof action.visible !== 'object'
          ? action.visible !== false
          : evaluateExpression(
              action.visible.expression,
              res.locals.ctx as ManatOSContext,
              listPage.fields,
              {
                source: 'ui-metadata',
                sourcePath: `list.pageActions.${key}.visible`,
                targetPath: `list.pageActions.${key}.visible`,
                purpose: 'resolve list page action visibility',
              },
            ) !== false;
      const tone = action.tone || 'secondary';
      const outline = action.emphasis === 'outline';
      return {
        key,
        ...action,
        resolvedVisible: visible,
        cssClass: `btn ${outline ? `btn-outline-${tone}` : `btn-${tone}`}`,
      };
    })
    .sort((left, right) => (left.order || 0) - (right.order || 0));

  await renderPage(res, 'pages/sysbo/list', {
    title: metadata.pluralName,
    titleIcon: definition.icon,
    definition,
    metadata,
    metadataUI,
    permissions,
    hasAnyEntries,
    resolvedAddAction,
    resolvedPageActions,
    referenceData: listReferenceData,
    items: listItems,
    paging: response.data.paging,
    pageSizeOptions: listQuery.pageSizeOptions,
    query: { ...listQuery.query, pageSize: String(response.data.paging.pageSize) },
    metadataComponentPartialFor,
    entryRepresentations,
  });
}
