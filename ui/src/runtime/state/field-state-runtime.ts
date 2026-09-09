import type { SurfaceEvent, SurfaceEventRuntime } from '../events/surface-event-runtime.js';
import type { SurfaceEventSource } from '../surface/contracts.js';

export interface FieldValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly severity: 'error' | 'warning';
  readonly source?: string;
}

export interface FieldUxState {
  readonly: boolean;
  visible: boolean;
  required: boolean;
  enabled: boolean;
}

export interface FieldRuntimeState<T = unknown> {
  readonly name: string;
  originalValue: T | null;
  value: T | null;
  dirty: boolean;
  valid: boolean;
  validationIssues: readonly FieldValidationIssue[];
  ux: FieldUxState;
}

export interface SetFieldValueRequest {
  readonly field: string;
  readonly value: unknown;
  readonly source: SurfaceEventSource;
  readonly causeEventId?: string | null;
}

/**
 * Canonical V2 field state for one entry surface.
 *
 * All value origins use setValue(). There is intentionally no separate
 * "initial value" mutation path: server values, metadata defaults, caller
 * defaults, relationship results, user edits and calculations therefore emit
 * the same value events and participate in the same dependency pipeline.
 */
export class FieldStateRuntime {
  readonly #surfaceId: string;
  readonly #events: SurfaceEventRuntime;
  readonly #fields = new Map<string, FieldRuntimeState>();

  constructor(surfaceId: string, events: SurfaceEventRuntime) {
    this.#surfaceId = surfaceId;
    this.#events = events;
  }

  define(name: string, originalValue: unknown = null): FieldRuntimeState {
    if (this.#fields.has(name)) throw new Error(`V2 field already exists: ${name}`);
    const field: FieldRuntimeState = {
      name,
      originalValue,
      value: originalValue,
      dirty: false,
      valid: true,
      validationIssues: Object.freeze([]),
      ux: { readonly: false, visible: true, required: false, enabled: true },
    };
    this.#fields.set(name, field);
    return field;
  }

  get(name: string): FieldRuntimeState | null {
    return this.#fields.get(name) ?? null;
  }

  require(name: string): FieldRuntimeState {
    const field = this.get(name);
    if (!field) throw new Error(`Unknown V2 field: ${name}`);
    return field;
  }

  all(): readonly FieldRuntimeState[] {
    return [...this.#fields.values()];
  }

  values(): Readonly<Record<string, unknown>> {
    return Object.fromEntries([...this.#fields].map(([name, field]) => [name, field.value]));
  }

  setValue(request: SetFieldValueRequest): SurfaceEvent | null {
    const field = this.require(request.field);
    if (Object.is(field.value, request.value)) return null;

    const changing = this.#events.emit({
      type: 'value:changing',
      surfaceId: this.#surfaceId,
      source: request.source,
      causeEventId: request.causeEventId ?? null,
      payload: { field: field.name, oldValue: field.value, newValue: request.value },
    });

    const oldValue = field.value;
    field.value = request.value;
    field.dirty = !Object.is(field.originalValue, field.value);

    return this.#events.emit({
      type: 'value:changed',
      surfaceId: this.#surfaceId,
      source: request.source,
      causeEventId: request.causeEventId ?? changing.id,
      payload: { field: field.name, oldValue, newValue: field.value, dirty: field.dirty },
    });
  }

  setValidation(
    fieldName: string,
    issues: readonly FieldValidationIssue[],
    source: SurfaceEventSource,
    causeEventId?: string | null,
  ): SurfaceEvent | null {
    const field = this.require(fieldName);
    const normalized = Object.freeze(issues.map((issue) => Object.freeze({ ...issue })));
    const oldIssues = field.validationIssues;
    const oldValid = field.valid;
    const valid = !normalized.some((issue) => issue.severity === 'error');
    const sameIssues =
      oldIssues.length === normalized.length &&
      oldIssues.every(
        (issue, index) =>
          issue.code === normalized[index]?.code &&
          issue.message === normalized[index]?.message &&
          issue.severity === normalized[index]?.severity &&
          issue.source === normalized[index]?.source,
      );
    if (sameIssues && oldValid === valid) return null;

    field.validationIssues = normalized;
    field.valid = valid;
    return this.#events.emit({
      type: 'validation:changed',
      surfaceId: this.#surfaceId,
      source,
      causeEventId: causeEventId ?? null,
      payload: {
        field: fieldName,
        oldValid,
        newValid: valid,
        oldIssues,
        issues: normalized,
      },
    });
  }

  commitBaseline(): void {
    for (const field of this.#fields.values()) {
      field.originalValue = field.value;
      field.dirty = false;
    }
  }

  setUx(
    fieldName: string,
    property: keyof FieldUxState,
    value: boolean,
    source: SurfaceEventSource,
    causeEventId?: string | null,
  ): SurfaceEvent | null {
    const field = this.require(fieldName);
    const oldValue = field.ux[property];
    if (oldValue === value) return null;
    field.ux[property] = value;
    return this.#events.emit({
      type: 'field-state:changed',
      surfaceId: this.#surfaceId,
      source,
      causeEventId: causeEventId ?? null,
      payload: { field: fieldName, property, oldValue, newValue: value },
    });
  }
}
