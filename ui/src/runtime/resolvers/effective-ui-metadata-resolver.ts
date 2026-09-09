import {
  staticEntryFieldUx,
  type ManatOSDynamicValue,
  type SysBOFieldMetadata,
  type SysBOUIFieldOverrideMetadata,
} from '@manatos/shared';
import type { UxCalculation } from '../calculations/dependency-runtime.js';
import type { EntryStateRuntime } from '../state/entry-state-runtime.js';
import type { SurfaceContext } from '../surface/contracts.js';
import {
  bindExpression,
  createEntryExpressionScope,
  type V2ExpressionRootSource,
} from './expression-binding.js';

export interface EffectiveFieldMetadata {
  readonly field: string;
  readonly label?: string;
  readonly visible: boolean;
  readonly readonly: boolean;
  readonly required: boolean;
  readonly enabled: boolean;
}

export interface FieldResolutionInput {
  readonly field: string;
  readonly canonical?: {
    readonly label?: string;
    readonly required?: boolean;
    readonly readOnly?: boolean;
  };
  readonly override?: SysBOUIFieldOverrideMetadata;
}

function isExpression<T>(
  value: ManatOSDynamicValue<T> | undefined,
): value is Readonly<{ expression: string }> {
  return !!value && typeof value === 'object' && 'expression' in value;
}

/**
 * Authoritative V2 resolver for effective field UI state.
 *
 * Canonical entity restrictions are monotonic: UI metadata may make a field
 * more restrictive but cannot make a canonical read-only field writable.
 * Dynamic, side-effect-free decisions are compiled once and registered with
 * the entry dependency runtime rather than interpreted by field components.
 */
export class EffectiveUiMetadataResolver {
  wireEntryFields(
    surface: SurfaceContext,
    entry: EntryStateRuntime,
    inputs: readonly FieldResolutionInput[],
    rootSource: V2ExpressionRootSource = {},
    fieldMetadata: Readonly<Record<string, SysBOFieldMetadata>> = {},
    referenceData: Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>> = {},
  ): readonly EffectiveFieldMetadata[] {
    const knownFields = new Set(entry.fields.all().map((field) => field.name));
    const resolved: EffectiveFieldMetadata[] = [];

    for (const input of inputs) {
      const canonicalReadonly = input.canonical?.readOnly === true || surface.mode === 'view';
      const override = input.override;
      const field = entry.fields.require(input.field);

      const staticUx = staticEntryFieldUx(
        surface.mode,
        input.canonical?.readOnly === true,
        override,
      );
      field.ux.required = input.canonical?.required === true;
      field.ux.readonly = !staticUx.editable;
      field.ux.visible = staticUx.visible;
      field.ux.enabled = staticUx.editable;

      this.#wireBoolean(
        surface,
        entry,
        knownFields,
        input.field,
        'visible',
        override?.visible,
        false,
        rootSource,
        fieldMetadata,
        referenceData,
      );
      this.#wireEditable(
        surface,
        entry,
        knownFields,
        input.field,
        canonicalReadonly,
        override?.editable,
        rootSource,
        fieldMetadata,
        referenceData,
      );

      const label = override?.label ?? input.canonical?.label;
      resolved.push({
        field: input.field,
        ...(label !== undefined ? { label } : {}),
        visible: field.ux.visible,
        readonly: field.ux.readonly,
        required: field.ux.required,
        enabled: field.ux.enabled,
      });
    }

    return resolved;
  }

  #wireEditable(
    surface: SurfaceContext,
    entry: EntryStateRuntime,
    knownFields: ReadonlySet<string>,
    field: string,
    canonicalReadonly: boolean,
    dynamic: ManatOSDynamicValue<boolean> | undefined,
    rootSource: V2ExpressionRootSource,
    fieldMetadata: Readonly<Record<string, SysBOFieldMetadata>>,
    referenceData: Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>>,
  ): void {
    if (canonicalReadonly) return;
    if (typeof dynamic === 'boolean') {
      entry.fields.require(field).ux.readonly = !dynamic;
      return;
    }
    if (!isExpression(dynamic)) return;
    const binding = bindExpression<boolean>(dynamic.expression, knownFields);
    const dependencyScope = createEntryExpressionScope(
      surface,
      entry.fields,
      rootSource,
      fieldMetadata,
      referenceData,
    );
    const calculation: UxCalculation = {
      target: field,
      property: 'readonly',
      dependsOn: binding.resolveDependencyPaths(dependencyScope),
      calculate: () =>
        !binding.evaluate(
          createEntryExpressionScope(
            surface,
            entry.fields,
            rootSource,
            fieldMetadata,
            referenceData,
          ),
          `${surface.path}.fields.${field}.readonly`,
        ),
    };
    // Register before initialization, but do not evaluate against a partially
    // populated entry. DependencyRuntime performs the first deterministic
    // evaluation when entry:initialized is emitted after every seed/default
    // layer has been applied. This keeps page/popup initialization transactional
    // and prevents entity-specific expressions from observing transient nulls.
    entry.addUxCalculation(calculation);
  }

  #wireBoolean(
    surface: SurfaceContext,
    entry: EntryStateRuntime,
    knownFields: ReadonlySet<string>,
    field: string,
    property: 'visible',
    dynamic: ManatOSDynamicValue<boolean> | undefined,
    invert: boolean,
    rootSource: V2ExpressionRootSource,
    fieldMetadata: Readonly<Record<string, SysBOFieldMetadata>>,
    referenceData: Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>>,
  ): void {
    if (typeof dynamic === 'boolean') {
      entry.fields.require(field).ux[property] = invert ? !dynamic : dynamic;
      return;
    }
    if (!isExpression(dynamic)) return;
    const binding = bindExpression<boolean>(dynamic.expression, knownFields);
    const dependencyScope = createEntryExpressionScope(
      surface,
      entry.fields,
      rootSource,
      fieldMetadata,
      referenceData,
    );
    const calculation: UxCalculation = {
      target: field,
      property,
      dependsOn: binding.resolveDependencyPaths(dependencyScope),
      calculate: () => {
        const value = binding.evaluate(
          createEntryExpressionScope(
            surface,
            entry.fields,
            rootSource,
            fieldMetadata,
            referenceData,
          ),
          `${surface.path}.fields.${field}.${property}`,
        );
        return invert ? !value : value;
      },
    };
    // See #wireEditable: subscriptions are established early, while the first
    // evaluation is deferred until the entry has a complete initialization seed.
    entry.addUxCalculation(calculation);
  }
}
