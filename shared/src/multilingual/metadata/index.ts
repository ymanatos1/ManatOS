import { CO_TEXT } from './co.js';
import { PL_TEXT } from './pl.js';
import { SS_TEXT } from './ss.js';
import { EN_TEXT } from './en.js';
import { CM_TEXT } from './cm.js';

/** One source catalogue, duplicated in host builds, never maintained separately. */
export const METADATA_TEXT = {
  CO: CO_TEXT,
  PL: PL_TEXT,
  SS: SS_TEXT,
  EN: EN_TEXT,
  CM: CM_TEXT,
} as const;
export type MetadataLanguage = 'EN' | 'EL';
export type MultilingualLiteral = Readonly<{ EN: string; EL?: string }>;

/** Unmarked strings are literal text. @@ escapes an initial @ in a literal. */
export function resolveMetadataText(
  value: string | MultilingualLiteral,
  language: MetadataLanguage,
): string {
  if (typeof value !== 'string') return value[language] ?? value.EN;
  if (value.startsWith('@@')) return value.slice(1);
  if (!value.startsWith('@')) return value;
  const match = /^@(CO|PL|SS|EN|CM)\.(.+)$/.exec(value);
  if (!match) return value;
  const group = METADATA_TEXT[match[1] as keyof typeof METADATA_TEXT] as Readonly<
    Record<string, MultilingualLiteral>
  >;
  const item = group[match[2]!];
  return item ? (item[language] ?? item.EN) : value;
}

/**
 * A disposable view projection. Never write this result into canonical metadata,
 * CTX, API payloads, or persistent entity state. Consumers create a fresh
 * projection whenever the selected language changes.
 */
export function localizeMetadataPresentation<T>(source: T, language: MetadataLanguage): T {
  const project = (value: unknown): unknown => {
    if (typeof value === 'string') return resolveMetadataText(value, language);
    if (Array.isArray(value)) return value.map(project);
    if (!value || typeof value !== 'object') return value;
    const entries = Object.entries(value);
    if (
      entries.every(([key]) => key === 'EN' || key === 'EL') &&
      typeof (value as Record<string, unknown>).EN === 'string'
    ) {
      return resolveMetadataText(value as MultilingualLiteral, language);
    }
    return Object.fromEntries(entries.map(([key, member]) => [key, project(member)]));
  };
  return project(source) as T;
}
