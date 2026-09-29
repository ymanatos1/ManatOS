import type { Request } from 'express';
import type { SysBOUIMetadata, SysBOUIFieldOverrideMetadata } from '@manatos/shared';

export interface EntryInvocation {
  host: 'page' | 'popup' | 'embedded';
  popup: boolean;
  token: string | null;
  mode: 'create' | 'edit' | 'view' | null;
  uiViewKey: string | null;
  density: 'normal' | 'compact';
  recoverable: boolean;
  defaults: Record<string, unknown>;
  uiOverrides: Record<
    string,
    SysBOUIFieldOverrideMetadata & {
      allowedValues?: readonly string[];
      allowedEnumItemTrait?: string;
    }
  >;
}

function parsedObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || !value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function entryInvocation(req: Request): EntryInvocation {
  const source = req.method === 'GET' ? req.query : req.body;
  const rawHost = String(source?._entryHost ?? '');
  const host =
    rawHost === 'popup' || rawHost === 'embedded' || rawHost === 'page'
      ? rawHost
      : String(source?._entryPopup ?? '') === '1'
        ? 'popup'
        : 'page';
  const popup = host === 'popup';
  const tokenSource = source?._entryToken ?? source?._entryPopupToken;
  const token = typeof tokenSource === 'string' ? tokenSource : null;
  const rawMode = String(source?._entryMode ?? '');
  const mode = rawMode === 'create' || rawMode === 'edit' || rawMode === 'view' ? rawMode : null;
  return {
    host,
    popup,
    token,
    mode,
    uiViewKey:
      typeof source?._entryUIView === 'string' && source._entryUIView ? source._entryUIView : null,
    density: String(source?._entryDensity ?? '') === 'compact' ? 'compact' : 'normal',
    recoverable: String(source?._entryRecoverable ?? '') !== '0',
    defaults: parsedObject(source?._entryDefaults),
    uiOverrides: parsedObject(source?._entryOverrides) as EntryInvocation['uiOverrides'],
  };
}

export function effectiveEntryUIMetadata(
  metadataUI: SysBOUIMetadata,
  invocation: EntryInvocation,
): SysBOUIMetadata {
  if (!Object.keys(invocation.uiOverrides).length) return metadataUI;
  return {
    ...metadataUI,
    record: {
      ...metadataUI.record,
      fieldOverrides: {
        ...metadataUI.record.fieldOverrides,
        ...Object.fromEntries(
          Object.entries(invocation.uiOverrides).map(([key, override]) => {
            const uiOverride = { ...override };
            delete uiOverride.allowedValues;
            delete uiOverride.allowedEnumItemTrait;
            return [key, { ...(metadataUI.record.fieldOverrides[key] ?? {}), ...uiOverride }];
          }),
        ),
      },
    },
  };
}
