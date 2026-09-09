import type { FieldRuntimeState } from '../state/field-state-runtime.js';

export interface EffectiveReferencePresentation {
  readonly selected: Readonly<Record<string, unknown>> | null;
  readonly candidates: readonly Readonly<Record<string, unknown>>[];
}

export interface EffectiveFieldContext {
  readonly value: unknown;
  readonly originalValue: unknown;
  readonly editable: boolean;
  readonly visible: boolean;
  readonly required: boolean;
  readonly enabled: boolean;
  readonly readonly: boolean;
  readonly reference?: EffectiveReferencePresentation;
}

const referenceId = (candidate: Readonly<Record<string, unknown>>): string =>
  String(candidate.id ?? candidate.value ?? '');

/**
 * Builds the one host-neutral field contract consumed by V2 presentation.
 *
 * Page and popup hosts must never reinterpret field mutability or resolve a
 * reference id independently. EntityEntryRuntime owns effective UX state;
 * canonical reference data owns id -> entry presentation. Concrete field
 * components receive this already-resolved context and only render it.
 */
export function resolveEffectiveFieldContext(
  field: FieldRuntimeState,
  referenceCandidates: readonly Readonly<Record<string, unknown>>[] = [],
): EffectiveFieldContext {
  const value = field.value ?? null;
  const candidates = referenceCandidates;
  const selected =
    value === null || value === undefined || value === ''
      ? null
      : (candidates.find((candidate) => referenceId(candidate) === String(value)) ?? null);

  return {
    value,
    originalValue: field.originalValue ?? null,
    editable: field.ux.readonly !== true && field.ux.enabled !== false,
    visible: field.ux.visible !== false,
    required: field.ux.required === true,
    enabled: field.ux.enabled !== false,
    readonly: field.ux.readonly === true,
    ...(candidates.length || selected ? { reference: { selected, candidates } } : {}),
  };
}
