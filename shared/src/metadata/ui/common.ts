import type { SysBOUIRecordTabMetadata } from './types.js';
import { systemCountryCatalog } from '../../system-country-catalog.js';

/** Shared projections of canonical country reference data for reusable editors. */
export const telephoneCountryOptions = (() => {
  const byCallingCode = new Map<string, { label: string; value: string; flagSrc?: string }>();
  for (const country of systemCountryCatalog) {
    const existing = byCallingCode.get(country.callingCode);
    if (existing) {
      existing.label = `${existing.label} / ${country.name}`;
      continue;
    }
    byCallingCode.set(country.callingCode, {
      label: country.name,
      value: country.callingCode,
      ...(country.languageFlagSrc ? { flagSrc: country.languageFlagSrc } : {}),
    });
  }
  return [...byCallingCode.values()];
})();

export const addressCountryOptions = systemCountryCatalog.map((country) => ({
  label: country.name,
  value: country.name,
  ...(country.languageFlagSrc ? { flagSrc: country.languageFlagSrc } : {}),
}));

/**
 * Framework-neutral SysBO UI metadata registry used by the metadata-driven
 * administration renderer.
 *
 * This registry is the authoritative presentation contract for generic SysBO
 * administration pages. Concrete renderers consume these semantic declarations;
 * EJS partial names, Bootstrap classes and browser-only details do not belong here.
 *
 * Specialized workflows are expressed through reusable component keys/options/
 * bindings rather than entity-specific branches in the generic page renderer.
 */
export const tab = (
  id: string,
  label: string,
  order: number,
  fields: readonly string[],
  options: Partial<
    Pick<
      SysBOUIRecordTabMetadata,
      'icon' | 'layout' | 'visible' | 'component' | 'content' | 'readOnly'
    >
  > = {},
): SysBOUIRecordTabMetadata => ({ id, label, order, fields, ...options });

export const generalTab = (
  fields: readonly string[],
  options: Partial<Pick<SysBOUIRecordTabMetadata, 'content'>> = {},
) =>
  tab('general', 'General', 10, fields, {
    icon: 'info-circle',
    layout: 'form',
    /*
     * Keep the metadata array order authoritative all the way through the generic
     * renderer. Most General tabs use the standard two-column flow, while an
     * entity may supply explicit mixed content when it needs full-row fields or
     * other generic layout primitives. The helper owns only the default.
     */
    content: options.content ?? fields.map((field) => ({ kind: 'field' as const, field, span: 6 })),
  });

export const standardAddAction = (label = 'Add new') =>
  ({
    visible: { expression: 'permissions.create === true' },
    enabled: true,
    label,
  }) as const;

export const standardEntryActions = {
  delete: {
    kind: 'delete' as const,
    order: 20,
    visible: { expression: "mode !== 'create' && permissions.delete === true" },
    placement: 'footer-leading' as const,
    label: 'Delete entry',
    icon: 'trash',
    tone: 'danger' as const,
  },
  save: {
    kind: 'save' as const,
    order: 100,
    visible: {
      expression: "mode !== 'view' && (permissions.create === true || permissions.update === true)",
    },
    placement: 'footer-trailing' as const,
    label: 'Save',
    icon: 'check-circle',
    tone: 'primary' as const,
  },
} as const;

export const systemTab = (): SysBOUIRecordTabMetadata =>
  tab('system', 'System details', 900, ['id', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy'], {
    icon: 'clock-history',
    layout: 'summary',
  });

export const systemFieldOverrides = {
  createdAt: {
    presentation: { mode: 'summary' as const, format: 'datetime-elapsed' as const, emptyText: '—' },
  },
  updatedAt: {
    presentation: { mode: 'summary' as const, format: 'datetime-elapsed' as const, emptyText: '—' },
  },
} as const;

export const relatedLicensesCollection = (filterField: 'principalId' | 'applicationId') => ({
  label: 'Licenses',
  icon: 'key',
  rowIcon: 'key',
  entityKey: 'sys-licenses',
  source: {
    kind: 'entity-query' as const,
    filterField,
    currentField: 'id',
    pageSize: 100,
    sort: 'name',
    direction: 'asc' as const,
  },
  layout: 'table-list' as const,
  rowHref: '/bo/sys-licenses/{id}',
  emptyText: 'No related licenses.',
  fields: {
    name: {},
    ...(filterField === 'principalId'
      ? { applicationId: { label: 'Application' } }
      : { principalId: { label: 'Customer' } }),
    platformId: {},
    status: {},
    validUntil: {},
    enabled: {},
  },
});
