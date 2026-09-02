/**
 * Generic metadata value-presentation helpers shared by server-rendered views.
 *
 * These helpers deliberately know nothing about concrete SysBO/entity keys.
 * Metadata supplies value catalogues and semantic presentation hints; renderers
 * decide only how those generic hints map to their visual framework.
 */
export interface MetadataOptionItem {
  value: unknown;
  label?: string;
  icon?: string;
  tone?: 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'info';
  toneStrength?: 'soft' | 'normal' | 'strong';
}

export interface MetadataOptionField {
  optionItems?: readonly MetadataOptionItem[];
  enumItems?: readonly MetadataOptionItem[];
}

export interface MetadataValuePresentation {
  format?: 'text' | 'datetime' | 'datetime-elapsed';
  emptyText?: string;
}

export const metadataOptionItemForField = (
  field: MetadataOptionField | null | undefined,
  value: unknown,
): MetadataOptionItem | null =>
  [...(field?.optionItems ?? []), ...(field?.enumItems ?? [])]
    .find((candidate) => candidate?.value === value) ?? null;

export const metadataOptionToneClass = (item: MetadataOptionItem | null | undefined): string => {
  const tone = item?.tone;
  if (!tone) return '';
  if (tone === 'danger' && item?.toneStrength === 'soft') return 'text-danger opacity-75';
  if (tone === 'danger' && item?.toneStrength === 'strong') return 'text-danger-emphasis';
  if (tone === 'warning') return 'text-warning-emphasis';
  return `text-${tone}`;
};

const formatElapsed = (dateValue: Date): string => {
  const elapsedMs = Date.now() - dateValue.getTime();
  if (!Number.isFinite(elapsedMs)) return '';
  const future = elapsedMs < 0;
  const absolute = Math.abs(elapsedMs);
  const units: readonly [string, number][] = [
    ['d', 24 * 60 * 60 * 1000],
    ['h', 60 * 60 * 1000],
    ['m', 60 * 1000],
    ['s', 1000],
  ];
  const parts: string[] = [];
  let remaining = absolute;
  for (const [suffix, size] of units) {
    const amount = Math.floor(remaining / size);
    if (amount > 0 || (suffix === 's' && parts.length === 0)) {
      parts.push(`${amount}${suffix}`);
      remaining -= amount * size;
    }
    if (parts.length === 2) break;
  }
  return future ? `in ${parts.join(' ')}` : `${parts.join(' ')} ago`;
};

export const formatMetadataValue = (
  value: unknown,
  presentation: MetadataValuePresentation = {},
): string => {
  if (value === undefined || value === null || value === '') return presentation.emptyText ?? '—';

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const duration = value as Record<string, unknown>;
    if (['years', 'months', 'days'].every((key) => Object.prototype.hasOwnProperty.call(duration, key))) {
      const parts = [
        ['year', Number(duration.years || 0)],
        ['month', Number(duration.months || 0)],
        ['day', Number(duration.days || 0)],
      ] as const;
      const rendered = parts
        .filter(([, amount]) => amount > 0)
        .map(([unit, amount]) => `${amount} ${unit}${amount === 1 ? '' : 's'}`);
      return rendered.length ? rendered.join(', ') : '0 days';
    }
  }

  if (presentation.format === 'datetime' || presentation.format === 'datetime-elapsed') {
    const parsed = new Date(String(value));
    if (Number.isNaN(parsed.getTime())) return String(value);
    const rendered = parsed.toLocaleString();
    return presentation.format === 'datetime-elapsed'
      ? `${rendered} (${formatElapsed(parsed)})`
      : rendered;
  }

  return String(value);
};
