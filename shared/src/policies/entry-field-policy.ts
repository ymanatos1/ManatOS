import type { SysBOFieldMetadata } from '../metadata/bo/index.js';
import type { SysBOUIFieldOverrideMetadata } from '../metadata/ui/index.js';

export interface StaticEntryFieldUx {
  readonly visible: boolean;
  readonly editable: boolean;
}

/**
 * Pure, host-neutral entry-field policy rules shared by the TypeScript semantic
 * runtime and the production browser adapter. This module deliberately performs
 * no expression evaluation and no mutation; hosts own those mechanics.
 */
export function isEmptyEntryFieldValue(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

export function staticEntryFieldUx(
  mode: string,
  canonicalReadOnly: boolean,
  override: Pick<SysBOUIFieldOverrideMetadata, 'visible' | 'editable'> | undefined,
): StaticEntryFieldUx {
  return {
    visible: typeof override?.visible === 'boolean' ? override.visible : true,
    editable:
      mode !== 'view' &&
      canonicalReadOnly !== true &&
      (typeof override?.editable === 'boolean' ? override.editable : true),
  };
}

export function allowedInvocationOptionValues(
  field: Pick<SysBOFieldMetadata, 'type' | 'enumItems'> | undefined,
  restriction:
    Readonly<{ allowedValues?: readonly unknown[]; allowedEnumItemTrait?: string }> | undefined,
): readonly string[] | null {
  if (field?.type !== 'enum' || !restriction) return null;
  if (Array.isArray(restriction.allowedValues)) return restriction.allowedValues.map(String);
  if (typeof restriction.allowedEnumItemTrait !== 'string') return null;
  const trait = restriction.allowedEnumItemTrait;
  return (field.enumItems ?? [])
    .filter((item) => item[trait] === true)
    .map((item) => String(item.value));
}

export function reconcileRestrictedOptionValue(
  current: unknown,
  allowed: readonly string[] | null,
): unknown {
  if (!allowed) return current;
  if (current !== null && current !== undefined && allowed.includes(String(current)))
    return current;
  return allowed[0] ?? null;
}
