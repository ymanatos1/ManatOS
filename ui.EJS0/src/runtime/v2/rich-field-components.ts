import type { EntityFieldBinding, UiBindingListener } from './binding.js';
import type { UiComponentController, UiComponentDefinition } from './component.js';
import type { UiFieldComponentDefinition } from './field.js';
import type { UiRegistry } from './registry.js';

/** Private editor mode. This is presentation state and never belongs in semantic CTX. */
export type RichTextEditorMode = 'visual' | 'markdown' | 'preview';

/**
 * Host-neutral rich-text component controller.
 *
 * The canonical value is always the binding string. Editor document models,
 * selection/caret and mode remain private presentation state.
 */
export class RichTextFieldComponentController implements UiComponentController {
  #mode: RichTextEditorMode = 'markdown';

  constructor(readonly binding: EntityFieldBinding<string | null>) {}

  get writable(): boolean {
    return this.binding.writable;
  }

  get mode(): RichTextEditorMode {
    return this.#mode;
  }

  setMode(mode: RichTextEditorMode): void {
    this.#mode = mode;
  }

  mount(): void {}

  read(): string | null {
    return this.binding.read();
  }

  write(value: string | null): unknown {
    return this.binding.write(value, { source: 'rich-text-component' });
  }

  subscribe(listener: UiBindingListener<string | null>): () => void {
    return this.binding.subscribe(listener, {
      kind: 'component',
      label: 'Canonical rich-text component',
    });
  }
}

/** Storage-neutral semantic descriptor. Providers may add further JSON-like metadata. */
export type PictureDescriptor = Readonly<Record<string, unknown>>;
export type PictureValue = PictureDescriptor | null;

/**
 * Binary payload is intentionally private component state. CTX receives only
 * the storage-neutral descriptor through the field binding.
 */
export interface PendingPicturePayload {
  readonly contentType: string;
  readonly dataBase64: string;
}

export class PictureFieldComponentController {
  #pendingPayload: PendingPicturePayload | null = null;

  constructor(readonly binding: EntityFieldBinding<PictureValue>) {}

  get writable(): boolean {
    return this.binding.writable;
  }

  read(): PictureValue {
    return this.binding.read();
  }

  setPending(descriptor: PictureDescriptor, payload: PendingPicturePayload): unknown {
    if (!this.binding.writable) throw new Error('Picture field is read-only.');
    this.#pendingPayload = payload;
    return this.binding.write(descriptor, { source: 'picture-component', action: 'select' });
  }

  clear(): unknown {
    if (!this.binding.writable) throw new Error('Picture field is read-only.');
    this.#pendingPayload = null;
    return this.binding.write(null, { source: 'picture-component', action: 'clear' });
  }

  pendingPayload(): PendingPicturePayload | null {
    return this.#pendingPayload;
  }

  dispose(): void {
    this.#pendingPayload = null;
  }
}

export type PicturesValue = readonly PictureDescriptor[];

export class PicturesFieldComponentController {
  readonly #pendingPayloads = new Map<string, PendingPicturePayload>();

  constructor(readonly binding: EntityFieldBinding<PicturesValue>) {}

  get writable(): boolean {
    return this.binding.writable;
  }

  read(): PicturesValue {
    return this.binding.read();
  }

  replace(value: PicturesValue): unknown {
    return this.binding.write(value, { source: 'pictures-component', action: 'replace' });
  }

  rememberPending(key: string, payload: PendingPicturePayload): void {
    this.#pendingPayloads.set(key, payload);
  }

  pendingPayload(key: string): PendingPicturePayload | undefined {
    return this.#pendingPayloads.get(key);
  }

  forgetPending(key: string): void {
    this.#pendingPayloads.delete(key);
  }

  dispose(): void {
    this.#pendingPayloads.clear();
  }
}

const richDefinition = (
  id: string,
  type: 'picture' | 'pictures' | 'richText',
  create: UiComponentDefinition<EntityFieldBinding>['create'],
): UiFieldComponentDefinition => ({
  id,
  contractVersion: 1,
  binding: { kinds: new Set(['entity-field']) },
  field: { types: new Set([type]), representations: new Set(['default']) },
  create,
});

/** Stateful rich/binary field vocabulary; semantic values still live only in bindings/CTX. */
export const RICH_FIELD_COMPONENTS: readonly UiFieldComponentDefinition[] = Object.freeze([
  richDefinition(
    'field.rich-text',
    'richText',
    (context) =>
      new RichTextFieldComponentController(context.binding as EntityFieldBinding<string | null>),
  ),
  richDefinition(
    'field.picture',
    'picture',
    (context) =>
      new PictureFieldComponentController(context.binding as EntityFieldBinding<PictureValue>),
  ),
  richDefinition(
    'field.pictures',
    'pictures',
    (context) =>
      new PicturesFieldComponentController(context.binding as EntityFieldBinding<PicturesValue>),
  ),
]);

export function registerRichFieldComponents(registry: UiRegistry<UiComponentDefinition>): void {
  for (const definition of RICH_FIELD_COMPONENTS) registry.register(definition);
}
