import type { UiContext } from './ui-context.js';
import {
  UiExpressionRuntime,
  isUiExpressionDefinition,
  type UiDynamicValue,
} from './expression.js';

export interface UiPolicyDefinition {
  readonly visible?: UiDynamicValue<boolean>;
  readonly enabled?: UiDynamicValue<boolean>;
  readonly readOnly?: UiDynamicValue<boolean>;
  readonly required?: UiDynamicValue<boolean>;
}

export interface UiEffectivePolicy {
  readonly visible: boolean;
  readonly enabled: boolean;
  readonly readOnly: boolean;
  readonly required: boolean;
}

/**
 * Declarative policy projection. It owns no semantic state; every refresh rereads canonical CTX.
 */
export class UiPolicyRuntime {
  readonly #expressions: readonly UiExpressionRuntime<boolean>[];

  constructor(
    readonly context: UiContext,
    readonly definition: UiPolicyDefinition,
    readonly targetPath: string,
  ) {
    this.#expressions = (['visible', 'enabled', 'readOnly', 'required'] as const)
      .map((key) => {
        const value = definition[key];
        return value !== undefined && isUiExpressionDefinition(value)
          ? new UiExpressionRuntime(context, value, `${targetPath}.${key}`, `UI ${key} policy`)
          : null;
      })
      .filter((value): value is UiExpressionRuntime<boolean> => value !== null);
  }

  evaluate(): UiEffectivePolicy {
    const visible = this.#value('visible', true);
    const enabled = this.#value('enabled', true);
    const readOnly = this.#value('readOnly', false);
    const required = this.#value('required', false);
    return { visible, enabled: enabled && !readOnly, readOnly, required };
  }

  subscribe(listener: (policy: UiEffectivePolicy) => void): () => void {
    const disposers = this.#expressions.map((expression) =>
      expression.subscribe(() => listener(this.evaluate())),
    );
    return () => {
      for (const dispose of disposers.reverse()) dispose();
    };
  }

  #value(key: keyof UiPolicyDefinition, fallback: boolean): boolean {
    const value = this.definition[key];
    if (value === undefined) return fallback;
    if (!isUiExpressionDefinition(value)) return value;
    const expression = this.#expressions.find(
      (candidate) => candidate.targetPath === `${this.targetPath}.${key}`,
    );
    return expression?.evaluate() ?? fallback;
  }
}
