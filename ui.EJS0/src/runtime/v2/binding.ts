import {
  navigateRelationship,
  type RelationshipNavigationDirection,
  type RelationshipNavigationResult,
  type RelationshipRecord,
  type ResolvedRelationshipDefinition,
} from '@manatos/shared/metadata/bo';
import { UiContext, type UiCtxChange, type UiCtxMutationCause } from './ui-context.js';

export type UiBindingMode = 'read' | 'read-write';
export type UiBindingListener<T> = (value: T, change: UiCtxChange) => void;

/**
 * CTX-native binding. It stores no semantic value: reads and writes always go
 * through the owning UiContext and therefore the canonical CTX authority.
 */
export class CtxBinding<T = unknown> {
  readonly kind: string = 'ctx';

  constructor(
    readonly context: UiContext,
    readonly relativePath: string,
    readonly mode: UiBindingMode = 'read-write',
    readonly writeGuard?: () => boolean,
  ) {
    if (!relativePath.trim()) throw new Error('A CTX binding requires a relative path.');
  }

  get path(): string {
    return this.context.pathOf(this.relativePath);
  }

  get writable(): boolean {
    return this.mode === 'read-write' && (this.writeGuard?.() ?? true);
  }

  read(): T {
    return this.context.get(this.relativePath) as T;
  }

  write(value: T, cause?: UiCtxMutationCause): unknown {
    if (!this.writable) throw new Error(`CTX binding is read-only: ${this.path}`);
    return this.context.replace(this.relativePath, value, cause);
  }

  subscribe(
    listener: UiBindingListener<T>,
    details?: { readonly kind?: string; readonly label?: string },
  ): () => void {
    const subscriptionDetails =
      details?.label === undefined
        ? { kind: details?.kind ?? 'binding' }
        : { kind: details?.kind ?? 'binding', label: details.label };
    return this.context.subscribe(
      this.relativePath,
      (change) => listener(this.read(), change),
      subscriptionDetails,
    );
  }
}

/** Canonical editable entity-field binding: fields.<key>.value is the sole write authority. */
export class EntityFieldBinding<T = unknown> extends CtxBinding<T> {
  override readonly kind: string = 'entity-field';
  constructor(
    context: UiContext,
    readonly fieldKey: string,
    mode: UiBindingMode = 'read-write',
    writeGuard?: () => boolean,
  ) {
    super(context, `data.fields.${fieldKey}.value`, mode, writeGuard);
  }

  get currentPath(): string {
    return this.context.pathOf(`data.entry.current.${this.fieldKey}`);
  }

  get originalPath(): string {
    return this.context.pathOf(`data.entry.original.${this.fieldKey}`);
  }
}

/**
 * Typed V2 relationship binding. The binding owns no relationship state: it
 * derives navigation from canonical 18A/18C metadata plus the owning level's
 * live field values and caller-supplied candidate rows.
 */
export class EntityRelationshipBinding {
  readonly kind = 'entity-relationship';

  constructor(
    readonly context: UiContext,
    readonly definition: ResolvedRelationshipDefinition,
    readonly candidates: () => readonly RelationshipRecord[],
    readonly direction: RelationshipNavigationDirection = 'forward',
  ) {}

  get cardinality() {
    return this.direction === 'forward'
      ? this.definition.relationship.cardinality
      : this.definition.inverseCardinality;
  }

  private currentRecord(): RelationshipRecord {
    const fields =
      this.direction === 'forward'
        ? this.definition.relationship.fields
        : this.definition.relationship.references.fields;
    return Object.fromEntries(
      fields.map((fieldKey) => [fieldKey, this.context.get(`data.fields.${fieldKey}.value`)]),
    );
  }

  read(): RelationshipNavigationResult {
    return navigateRelationship(
      this.definition,
      this.direction,
      this.currentRecord(),
      this.candidates(),
    );
  }

  subscribe(
    listener: UiBindingListener<RelationshipNavigationResult>,
    details?: { readonly label?: string },
  ): () => void {
    const fields =
      this.direction === 'forward'
        ? this.definition.relationship.fields
        : this.definition.relationship.references.fields;
    const releases = fields.map((fieldKey) =>
      this.context.subscribe(
        `data.fields.${fieldKey}.value`,
        (change) => listener(this.read(), change),
        details?.label === undefined
          ? { kind: 'relationship-binding' }
          : { kind: 'relationship-binding', label: details.label },
      ),
    );
    return () => releases.forEach((release) => release());
  }
}
