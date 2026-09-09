import type { DependencyPath } from '../calculations/dependency-runtime.js';
import { fieldValueDependency } from '../calculations/dependency-runtime.js';
import { ROOT_CTX_EVENT_SURFACE_ID } from '../context/root-ctx-runtime.js';
import type { SurfaceEvent, SurfaceEventRuntime } from '../events/surface-event-runtime.js';
import type { FieldStateRuntime, FieldValidationIssue } from '../state/field-state-runtime.js';
import type { SurfaceEventSource } from '../surface/contracts.js';

export interface ValidationContext {
  readonly values: Readonly<Record<string, unknown>>;
  readonly field: string;
  readonly value: unknown;
  readonly event: SurfaceEvent;
  readonly changedPath: DependencyPath;
}

export interface FieldValidator {
  readonly id: string;
  readonly target: string;
  readonly dependsOn?: readonly DependencyPath[];
  readonly validate: (
    context: ValidationContext,
  ) => FieldValidationIssue | readonly FieldValidationIssue[] | null | undefined;
}

function isEmpty(value: unknown): boolean {
  return (
    value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
  );
}

function related(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}.`) || right.startsWith(`${left}.`);
}

function normalizeIssues(
  result: ReturnType<FieldValidator['validate']>,
): readonly FieldValidationIssue[] {
  if (!result) return [];
  return Array.isArray(result) ? result : [result as FieldValidationIssue];
}

/**
 * Canonical reactive validation runtime for one V2 entry surface.
 *
 * Validation is state, not DOM behavior. Rules react to the same canonical
 * value/CTX events as calculations. Requiredness is resolved UI state, so a
 * dynamic `required` calculation immediately participates in entry validity.
 */
export class ValidationRuntime {
  readonly #surfaceId: string;
  readonly #fields: FieldStateRuntime;
  readonly #validators = new Map<string, FieldValidator[]>();
  readonly #unsubscribers: (() => void)[];

  constructor(surfaceId: string, fields: FieldStateRuntime, events: SurfaceEventRuntime) {
    this.#surfaceId = surfaceId;
    this.#fields = fields;
    this.#unsubscribers = [
      events.subscribe('value:changed', (event) => {
        if (event.surfaceId !== surfaceId) return;
        const field = (event.payload as { field?: unknown }).field;
        if (typeof field === 'string') this.#validateAffected(fieldValueDependency(field), event);
      }),
      events.subscribe('ctx:changed', (event) => {
        if (event.surfaceId !== surfaceId && event.surfaceId !== ROOT_CTX_EVENT_SURFACE_ID) return;
        const path = (event.payload as { path?: unknown }).path;
        if (typeof path === 'string' && path) this.#validateAffected(path, event);
      }),
      events.subscribe('field-state:changed', (event) => {
        if (event.surfaceId !== surfaceId) return;
        const payload = event.payload as { field?: unknown; property?: unknown };
        if (payload.property === 'required' && typeof payload.field === 'string') {
          this.validateField(payload.field, event, fieldValueDependency(payload.field));
        }
      }),
      events.subscribe('entry:initialized', (event) => {
        if (event.surfaceId === surfaceId) this.validateAll(event);
      }),
    ];
  }

  register(validator: FieldValidator): void {
    this.#fields.require(validator.target);
    const validators = this.#validators.get(validator.target) ?? [];
    validators.push(validator);
    this.#validators.set(validator.target, validators);
  }

  validateAll(cause?: SurfaceEvent): void {
    const event = cause ?? this.#syntheticEvent();
    for (const field of this.#fields.all()) {
      this.validateField(field.name, event, fieldValueDependency(field.name));
    }
  }

  validateField(fieldName: string, cause: SurfaceEvent, changedPath: DependencyPath): void {
    const field = this.#fields.require(fieldName);
    const issues: FieldValidationIssue[] = [];

    if (field.ux.required && isEmpty(field.value)) {
      issues.push({
        code: 'required',
        message: `${fieldName} is required.`,
        severity: 'error',
        source: 'required',
      });
    }

    for (const validator of this.#validators.get(fieldName) ?? []) {
      issues.push(
        ...normalizeIssues(
          validator.validate({
            values: this.#fields.values(),
            field: fieldName,
            value: field.value,
            event: cause,
            changedPath,
          }),
        ).map((issue) => ({ ...issue, source: issue.source ?? validator.id })),
      );
    }

    this.#fields.setValidation(fieldName, issues, 'engine', cause.id);
  }

  dispose(): void {
    for (const unsubscribe of this.#unsubscribers) unsubscribe();
  }

  #validateAffected(changedPath: DependencyPath, cause: SurfaceEvent): void {
    const targets = new Set<string>();

    const changedField = /^fields\.([^.]+)\.value$/.exec(changedPath)?.[1];
    if (changedField && this.#fields.get(changedField)) targets.add(changedField);

    for (const [target, validators] of this.#validators) {
      for (const validator of validators) {
        const dependencies = validator.dependsOn?.length
          ? validator.dependsOn
          : [fieldValueDependency(target)];
        if (dependencies.some((dependency) => related(dependency, changedPath))) {
          targets.add(target);
          break;
        }
      }
    }

    for (const target of targets) this.validateField(target, cause, changedPath);
  }

  #syntheticEvent(): SurfaceEvent {
    return Object.freeze({
      id: 'validation-initial',
      sequence: 0,
      timestamp: Date.now(),
      type: 'validation:changed',
      surfaceId: this.#surfaceId,
      source: 'engine' as SurfaceEventSource,
      causeEventId: null,
      payload: {},
    });
  }
}
