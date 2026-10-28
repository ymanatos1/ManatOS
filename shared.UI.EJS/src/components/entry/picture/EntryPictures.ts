import type {
  ContextTreeRuntime,
  ManatOSRuntimeRootContext,
  MetadataLanguage,
} from '@manatos/shared';
import {
  PicturePendingResources,
  pictureEditorPolicy,
  assertPictureSource,
  pendingPictureDescriptor,
  type PreparedPicture,
  type UiEntryPageRuntime,
  type UiLanguageDefinition,
} from '@manatos/shared-ui';
import { PictureEditorPopup } from './PictureEditorPopup.js';

/** Private image bytes belong to the Entry instance; history contains descriptors only. */
export class EntryPictures {
  private readonly resources = new PicturePendingResources();
  private popup: PictureEditorPopup | null = null;
  private disposed = false;
  constructor(
    private readonly tree: ContextTreeRuntime<ManatOSRuntimeRootContext>,
    private readonly runtime: UiEntryPageRuntime,
    private readonly root: HTMLElement,
    private readonly entityKey: string,
    private readonly language: () => MetadataLanguage,
    private readonly foreground: () => boolean = () => false,
    private readonly debuggerRequested: (path: string) => void = () => {},
    private readonly debuggerAllowed: () => boolean = () => false,
    private readonly debuggerDockWidth: () => number | null = () => null,
    private readonly languages: () => readonly UiLanguageDefinition[] = () => [],
    private readonly changeLanguage: (language: string) => void = () => {},
    private readonly fontScale: () => number = () => 100,
  ) {}
  /** No second CTX data store or separate set-field authorization path. */
  async handle(
    event: CustomEvent<{
      field: string;
      action: string;
      files?: File[];
      collection?: boolean;
      index?: number;
      from?: number;
      to?: number;
    }>,
  ): Promise<void> {
    const { field, action } = event.detail;
    if (this.disposed || !this.runtime.level.state.fields[field]?.editable) return;
    const current = this.runtime.level.data.current?.[field];
    if (action === 'choose') {
      const files = event.detail.files ?? [];
      if (!files.length || this.popup) return;
      try {
        const policy = pictureEditorPolicy(this.entityKey, field);
        for (const file of files) assertPictureSource(file, policy);
        const popup = new PictureEditorPopup(
          this.tree,
          this.runtime.levelPath,
          field,
          files,
          event.detail.collection === true,
          policy,
          this.language(),
          async (prepared) => {
            if (
              this.disposed ||
              this.popup !== popup ||
              !this.runtime.level.state.fields[field]?.editable
            )
              return;
            await this.accept(field, prepared, event.detail.collection === true);
          },
          () => this.close(),
          this.foreground,
          this.debuggerRequested,
          this.debuggerAllowed,
          this.debuggerDockWidth,
          this.languages,
          this.changeLanguage,
          this.fontScale,
        );
        this.popup = popup;
        popup.open();
      } catch (error) {
        this.close();
        this.showError(field, error);
      }
    } else {
      try {
        if (action === 'remove') {
          if (Array.isArray(current)) {
            const index = event.detail.index;
            if (
              !Number.isInteger(index) ||
              index === undefined ||
              index < 0 ||
              index >= current.length
            )
              return;
            await this.runtime.setField(
              field,
              current.filter((_, i) => i !== index),
            );
          } else await this.runtime.setField(field, null);
        } else if (action === 'move' && Array.isArray(current)) {
          const { from, to } = event.detail;
          if (
            !Number.isInteger(from) ||
            !Number.isInteger(to) ||
            from === undefined ||
            to === undefined ||
            from < 0 ||
            to < 0 ||
            from >= current.length ||
            to >= current.length
          )
            return;
          const updated = [...current];
          updated.splice(to, 0, ...updated.splice(from, 1));
          await this.runtime.setField(field, updated);
        } else if (action === 'undo') await this.runtime.undoField(field);
        else if (action === 'redo') await this.runtime.redoField(field);
        this.prune();
        this.paint();
      } catch (error) {
        this.showError(field, error);
      }
    }
  }
  private async accept(
    field: string,
    prepared: readonly PreparedPicture[],
    collection: boolean,
  ): Promise<void> {
    if (!prepared.length) return;
    const current = this.runtime.level.data.current?.[field];
    const descriptors = prepared.map((data) => {
      const descriptor = pendingPictureDescriptor(data, `pending:${crypto.randomUUID()}`);
      this.resources.add(descriptor, data);
      return descriptor;
    });
    try {
      await this.runtime.setField(
        field,
        collection ? [...(Array.isArray(current) ? current : []), ...descriptors] : descriptors[0],
      );
      this.prune();
      this.paint();
    } catch (error) {
      for (const descriptor of descriptors) this.resources.remove(descriptor.id);
      throw error;
    }
  }
  private showError(field: string, error: unknown): void {
    const slot = Array.from(this.root.querySelectorAll<HTMLElement>('[data-entry-field]')).find(
      (element) => element.dataset.entryField === field,
    );
    const node = slot?.querySelector<HTMLElement>('[data-picture-error]');
    if (node) {
      node.textContent = error instanceof Error ? error.message : String(error);
      node.hidden = false;
    }
  }
  /** History keeps a descriptor live even when Undo has removed it from #data.current. */
  private prune(): void {
    const level = this.runtime.level;
    const used = new Set<string>();
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const item of value) visit(item);
        return;
      }
      if (!value || typeof value !== 'object') return;
      if ('id' in value && typeof value.id === 'string' && value.id.startsWith('pending:'))
        used.add(value.id);
    };
    Object.values(level.data.current ?? {}).forEach(visit);
    Object.values(level.data.original ?? {}).forEach(visit);
    for (const history of Object.values(level.data.history))
      for (const change of history.changes) {
        visit(change.before);
        visit(change.after);
      }
    for (const id of this.resources.ids()) if (!used.has(id)) this.resources.remove(id);
  }
  paint(): void {
    if (this.disposed) return;
    const current = this.runtime.level.data.current;
    const recordId = current?.id;
    this.root.setAttribute('data-entry-record-id', typeof recordId === 'string' ? recordId : '');
    for (const owner of this.root.querySelectorAll<HTMLElement>('[data-entry-field]')) {
      const field = owner.dataset.entryField;
      if (!field) continue;
      const control = owner.querySelector<HTMLElement>('[data-entry-typed-field="picture"]');
      const collection = owner.querySelector<HTMLElement>('[data-entry-typed-field="pictures"]');
      if (control) {
        const value = current?.[field];
        const pending = this.pendingSource(value);
        control.toggleAttribute('data-picture-pending', !!pending);
        if (pending) control.setAttribute('data-picture-pending-source', pending);
        else control.removeAttribute('data-picture-pending-source');
        const image = control.querySelector<HTMLImageElement>('[data-entry-photo-thumbnail]');
        const empty = control.querySelector<HTMLElement>('[data-entry-photo-empty]');
        const source =
          pending ||
          (value &&
          typeof value === 'object' &&
          'id' in value &&
          String(value.id).startsWith('pending:')
            ? ''
            : image?.getAttribute('src') || '');
        if (image) {
          if (!source) image.removeAttribute('src');
          else if (image.getAttribute('src') !== source) image.src = source;
          image.hidden = !source;
        }
        if (empty) empty.hidden = !!source;
        const remove = control.querySelector<HTMLButtonElement>('[data-picture-delete]');
        if (remove) remove.hidden = !source || !this.runtime.level.state.fields[field]?.editable;
      }
      if (collection) {
        const value = current?.[field];
        if (!Array.isArray(value)) continue;
        value.forEach((descriptor, index) => {
          const source = this.pendingSource(descriptor);
          const image = collection.querySelector<HTMLImageElement>(
            `[data-picture-item-image="${index}"]`,
          );
          if (source && image) image.src = source;
        });
      }
    }
  }
  private pendingSource(value: unknown): string | null {
    if (!value || typeof value !== 'object' || !('id' in value)) return null;
    const picture = this.resources.get(String(value.id));
    return picture ? `data:${picture.contentType};base64,${picture.dataBase64}` : null;
  }
  refreshLanguage(language: MetadataLanguage): void {
    this.popup?.refreshLanguage(language);
  }
  refreshDebugger(): void {
    this.popup?.refreshDebuggerControls();
  }
  close(): void {
    const popup = this.popup;
    this.popup = null;
    popup?.dispose();
  }
  dispose(): void {
    this.disposed = true;
    this.close();
    this.resources.clear();
  }
}
