import { Injectable, inject, signal } from '@angular/core';
import { NgUiSurfaceManager } from '../../../runtime/surfaces/uiSurfaceManager';
import {
  ContextTreeRuntime,
  appendContextPathMember,
  type ManatOSRuntimeRootContext,
  type MetadataLanguage,
} from '@manatos/shared';
import {
  UiEntryPageRuntime,
  pictureEditorPolicy,
  assertPictureSource,
  pendingPictureDescriptor,
  PicturePendingResources,
  type PreparedPicture,
  type PendingPictureDescriptor,
  createUiBrowserSurfaceResourcePort,
  uiEntryTabs,
  uiEntryUIViewOptions,
  uiEntryTabNavigationVisible,
  uiEntryCaption,
  uiEntryFieldLabel,
  uiEntryFieldPresentation,
  type UiEntryFieldPresentation,
  type UiEntryLevel,
  type UiEmbeddedInteractionEvent,
  type UiEmbeddedDispatchResult,
} from '@manatos/shared-ui';

@Injectable()
/** UIS ownership: the Angular Entry Surface projection used by tabs/layout/fields; avoid shadow state in child controls. */
export class EntryContext {
  private runtime: UiEntryPageRuntime | null = null;
  private owner: ContextTreeRuntime<ManatOSRuntimeRootContext> | null = null;
  private parentPath: string | null = null;
  private readonly surfaces = inject(NgUiSurfaceManager, { optional: true });
  private unsubscribe: (() => void) | null = null;
  readonly level = signal<UiEntryLevel | null>(null);
  readonly language = signal<MetadataLanguage>('EN');
  readonly pictureRequest = signal<{
    field: string;
    files: readonly File[];
    collection: boolean;
  } | null>(null);
  private readonly picturesPending = new PicturePendingResources();
  private readonly pictureVersion = signal(0);
  openPictureEditor(field: string, files: readonly File[], collection: boolean): void {
    if (
      this.level()?.state.entry.recoveryFailed ||
      !this.level()?.state.fields[field]?.editable ||
      !files.length ||
      this.pictureRequest()
    )
      return;
    const policy = pictureEditorPolicy(this.entityKey(), field);
    for (const file of files) assertPictureSource(file, policy);
    this.pictureRequest.set({ field, files, collection });
  }
  closePictureEditor(): void {
    this.pictureRequest.set(null);
  }
  pictureSource(descriptor: unknown): string | null {
    this.pictureVersion();
    if (!descriptor || typeof descriptor !== 'object' || !('id' in descriptor)) return null;
    const id = String(descriptor.id);
    const bytes = this.picturesPending.get(id);
    return bytes ? `data:${bytes.contentType};base64,${bytes.dataBase64}` : null;
  }
  /** History remains authoritative in the owning Entry #data, never a Field component store. */
  fieldHistory(field: string) {
    return this.level()?.data.history[field] ?? null;
  }
  canUndo(field: string): boolean {
    const history = this.fieldHistory(field);
    return this.level()?.state.fields[field]?.editable === true && !!history && history.cursor > 0;
  }
  canRedo(field: string): boolean {
    const history = this.fieldHistory(field);
    return (
      this.level()?.state.fields[field]?.editable === true &&
      !!history &&
      history.cursor < history.changes.length
    );
  }
  async undoField(field: string): Promise<void> {
    await this.runtime?.undoField(field);
    this.prunePictureResources();
  }
  async redoField(field: string): Promise<void> {
    await this.runtime?.redoField(field);
    this.prunePictureResources();
  }
  /** Only discard staged image bytes once no live or history state references them. */
  private prunePictureResources(): void {
    const level = this.level();
    if (!level) return;
    const live = new Set<string>();
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const item of value) visit(item);
        return;
      }
      if (!value || typeof value !== 'object') return;
      if ('id' in value && typeof value.id === 'string' && value.id.startsWith('pending:')) {
        live.add(value.id);
      }
    };
    Object.values(level.data.current ?? {}).forEach(visit);
    Object.values(level.data.original ?? {}).forEach(visit);
    for (const history of Object.values(level.data.history ?? {})) {
      for (const change of history.changes) {
        visit(change.before);
        visit(change.after);
      }
    }
    for (const id of this.picturesPending.ids()) {
      if (!live.has(id)) this.picturesPending.remove(id);
    }
    this.pictureVersion.update((v) => v + 1);
  }
  async acceptPictureEdit(
    field: string,
    prepared: readonly PreparedPicture[],
    collection: boolean,
  ): Promise<void> {
    if (!this.runtime || !this.level()?.state.fields[field]?.editable || !prepared.length) return;
    const current = this.level()?.data.current?.[field];
    const descriptors: PendingPictureDescriptor[] = [];
    for (const data of prepared) {
      const id = `pending:${crypto.randomUUID()}`;
      const descriptor = pendingPictureDescriptor(data, id);
      descriptors.push(descriptor);
      this.picturesPending.add(descriptor, data);
    }
    try {
      await this.runtime.setField(
        field,
        collection ? [...(Array.isArray(current) ? current : []), ...descriptors] : descriptors[0],
      );
      this.prunePictureResources();
    } catch (error) {
      for (const item of descriptors) this.picturesPending.remove(item.id);
      throw error;
    }
    this.closePictureEditor();
  }
  async removePicture(field: string, index?: number): Promise<void> {
    if (!this.runtime || !this.level()?.state.fields[field]?.editable) return;
    const current = this.level()?.data.current?.[field];
    if (Array.isArray(current)) {
      if (index === undefined || index < 0 || index >= current.length) return;
      await this.runtime.setField(
        field,
        current.filter((_, i) => i !== index),
      );
      this.prunePictureResources();
    } else {
      await this.runtime.setField(field, null);
      this.prunePictureResources();
    }
    this.pictureVersion.update((v) => v + 1);
  }
  async movePicture(field: string, from: number, to: number): Promise<void> {
    const current = this.level()?.data.current?.[field];
    if (
      !this.runtime ||
      !this.level()?.state.fields[field]?.editable ||
      !Array.isArray(current) ||
      from < 0 ||
      to < 0 ||
      from >= current.length ||
      to >= current.length
    )
      return;
    const next = [...current];
    next.splice(to, 0, ...next.splice(from, 1));
    await this.runtime.setField(field, next);
    this.prunePictureResources();
  }

  /** Exactly one tools menu per Entry surface; the owner controls dismissal. */
  readonly openToolsField = signal<string | null>(null);
  readonly openReferenceField = signal<string | null>(null);
  openReferenceSelector(field: string): void {
    const level = this.level();
    if (level?.state.entry.recoveryFailed || !level?.state.fields[field]?.editable) return;
    this.openReferenceField.set(field);
  }
  dismissReferenceSelector(): void {
    this.openReferenceField.set(null);
  }
  /** The normal field-input path, not a second state setter, commits selection. */
  browseReferences(field: string, entityKey: string): void {
    const level = this.level();
    if (!this.runtime || !this.surfaces || !level?.state.fields[field]?.editable) return;
    const reference = this.field(field);
    if (reference?.relatedEntityKey !== entityKey || !this.surfaces.canReadEntity(entityKey))
      return;
    this.dismissReferenceSelector();
    const owner = this.runtime;
    let popup: ReturnType<NgUiSurfaceManager['openListSelector']> | null = null;
    popup = this.surfaces.openListSelector(entityKey, owner.levelPath, (id) =>
      this.runtime === owner && popup?.isOpen()
        ? owner.selectAuthorizedReference(
            field,
            entityKey,
            id,
            () => this.runtime === owner && popup?.isOpen() === true,
          )
        : Promise.resolve(false),
    );
  }
  /** The authenticated List result is authoritative for Browse availability. */
  hasBrowsableReferences(field: string, entityKey: string): Promise<boolean> {
    if (!this.runtime || !this.surfaces?.canReadEntity(entityKey)) return Promise.resolve(false);
    return this.runtime.hasBrowsableRelatedEntries(field, entityKey);
  }
  /** Quick and Browse selections share the same authenticated, authoritative GUID validation. */
  selectReference(
    field: string,
    entityKey: string,
    id: string,
    canCommit: () => boolean = () => true,
  ): Promise<boolean> {
    const level = this.level();
    if (
      !this.runtime ||
      !level?.state.fields[field]?.editable ||
      this.field(field)?.relatedEntityKey !== entityKey
    )
      return Promise.resolve(false);
    return this.runtime.selectAuthorizedReference(field, entityKey, id, canCommit);
  }
  selectRelatedView(reference: string, viewKey: string): void {
    this.runtime?.setRelatedView(reference, viewKey);
  }
  viewRelatedEntry(entityKey: string, recordId: string): void {
    if (
      !this.runtime ||
      !this.surfaces?.canReadEntity(entityKey) ||
      !/^[0-9a-f-]{36}$/i.test(recordId)
    )
      return;
    this.dismissReferenceSelector();
    this.surfaces.openEntryViewer(entityKey, this.runtime.levelPath, recordId);
  }
  /** Create uses the identical mounted Entry content and returns the server-issued record. */
  create(): Promise<Readonly<Record<string, unknown>> | null> {
    return this.runtime?.create() ?? Promise.resolve(null);
  }
  createReference(field: string, entityKey: string): void {
    if (!this.runtime || !this.surfaces || !this.level()?.state.fields[field]?.editable) return;
    if (
      this.field(field)?.relatedEntityKey !== entityKey ||
      !this.surfaces.canCreateEntity(entityKey)
    )
      return;
    this.dismissReferenceSelector();
    const owner = this.runtime;
    this.surfaces.openEntryCreator(entityKey, owner.levelPath, async (record) => {
      if (this.runtime !== owner) return false;
      return owner.acceptCreatedReference(field, entityKey, record);
    });
  }
  readonly inspectorAllowed = signal(false);
  inspectField(field: string): void {
    const level = this.level();
    if (!this.inspectorAllowed() || !this.runtime || !level?.state.fields[field]) return;
    const parent =
      level.data.current && Object.hasOwn(level.data.current, field)
        ? `${this.runtime.levelPath}.data.current`
        : `${this.runtime.levelPath}.state.fields`;
    const path = appendContextPathMember(parent, field);
    window.dispatchEvent(new CustomEvent('manatos:entry-inspect-ctx', { detail: { path } }));
  }
  toggleTools(field: string): void {
    this.openToolsField.update((current: string | null) => (current === field ? null : field));
  }
  dismissTools(): void {
    this.openToolsField.set(null);
  }
  get contextTree(): ContextTreeRuntime<ManatOSRuntimeRootContext> | null {
    return this.owner;
  }
  get levelPath(): string | null {
    return this.runtime?.levelPath ?? null;
  }
  entityKey(): string {
    return String(this.level()?.control.invocation.params['entityKey'] ?? '');
  }
  tabs() {
    const level = this.level();
    return uiEntryTabs(this.entityKey(), this.language(), {
      mode: level?.state.entry.mode ?? 'view',
      permissions: level?.state.entry.permissions ?? {},
      record: level?.data.current,
      viewKey: level?.state.entry.uiViewKey,
    });
  }
  viewOptions() {
    const level = this.level();
    return uiEntryUIViewOptions(
      this.entityKey(),
      level?.state.entry.uiViewKey ?? 'main',
      level?.state.entry.mode ?? 'edit',
      this.language(),
    );
  }
  viewNavigationVisible(): boolean {
    return uiEntryTabNavigationVisible(this.entityKey(), this.level()?.state.entry.uiViewKey);
  }
  pendingUIViewTransition(): { generation: number; viewKey: string } | null {
    return this.runtime?.pendingUIViewTransition() ?? null;
  }
  acknowledgeUIViewRendered(generation: number, viewKey: string): void {
    this.runtime?.acknowledgeUIViewRendered(generation, viewKey);
  }
  reportUIViewRenderError(error: unknown): void {
    this.runtime?.reportUIViewRenderError(error);
  }
  selectUIView(viewKey: string): Promise<void> {
    this.dismissTools();
    this.dismissReferenceSelector();
    return this.runtime?.selectUIView(viewKey) ?? Promise.resolve();
  }
  caption(): string {
    return uiEntryCaption(this.entityKey(), this.level()?.data.original ?? null, this.language());
  }
  label(field: string): string {
    return uiEntryFieldLabel(this.entityKey(), field, this.language());
  }
  field(field: string, labelOverride?: string): UiEntryFieldPresentation | null {
    const level = this.level();
    const record = level?.data.current;
    const presentation = uiEntryFieldPresentation(
      this.entityKey(),
      field,
      record?.[field],
      this.language(),
      labelOverride,
      typeof record?.id === 'string' ? record.id : undefined,
      level?.data.references,
      level?.state.fields[field],
      undefined,
      level?.data.referenceCatalogueStatus,
    );
    if (!presentation) return null;
    if (level?.state.entry.recoveryFailed) return { ...presentation, readOnly: true };
    if (!presentation.relatedEntityKey) return presentation;
    return {
      ...presentation,
      canViewRelated: this.surfaces?.canReadEntity(presentation.relatedEntityKey) ?? false,
      canCreateRelated: this.surfaces?.canCreateEntity(presentation.relatedEntityKey) ?? false,
    };
  }
  setField(field: string, value: unknown): Promise<void> {
    return this.runtime?.setField(field, value) ?? Promise.resolve();
  }
  /** Field adapter -> registered semantic owner -> Entry authoritative mutation. */
  dispatchFieldInteraction(
    field: string,
    event: UiEmbeddedInteractionEvent,
    layoutId?: string,
    tabIndex?: number,
  ): UiEmbeddedDispatchResult {
    return (
      this.runtime?.dispatchFieldInteraction(field, event, layoutId, tabIndex) ?? {
        handled: false,
        consumed: false,
        preventDefault: false,
        effects: [],
      }
    );
  }
  performFieldTool(field: string, action: string): Promise<string | null> {
    return this.runtime?.performFieldTool(field, action) ?? Promise.resolve(null);
  }
  revertField(field: string): Promise<void> {
    return this.runtime?.revertField(field) ?? Promise.resolve();
  }
  selectTab(tab: string): void {
    this.dismissTools();
    this.dismissReferenceSelector();
    this.runtime?.selectTab(tab);
  }
  open(
    tree: ContextTreeRuntime<ManatOSRuntimeRootContext>,
    entityKey: string,
    recordId: string,
    language: MetadataLanguage,
    options: {
      host?: 'page' | 'popup';
      parentLevelPath?: string | null;
      permissions?: Readonly<Record<string, boolean>>;
      mode?: 'view' | 'edit' | 'create';
    } = {},
  ): void {
    this.language.set(language);
    // A CTX path can be reused by a different Surface instance. Reuse only
    // when this runtime still owns the exact published #level object.
    let active = false;
    let current: Readonly<Record<string, unknown>> | undefined;
    if (this.runtime && this.owner === tree) {
      try {
        active = tree.get(this.runtime.levelPath) === this.runtime.level;
        if (active) current = this.runtime.level.control.invocation.params;
      } catch {
        active = false;
      }
    }
    if (
      active &&
      current?.['entityKey'] === entityKey &&
      current['recordId'] === recordId &&
      (options.mode === undefined || current['mode'] === options.mode) &&
      this.runtime?.level.control.host === (options.host ?? 'page') &&
      this.parentPath === (options.parentLevelPath ?? null)
    )
      return;
    this.dispose();
    const runtime = new UiEntryPageRuntime(
      tree,
      entityKey,
      recordId,
      createUiBrowserSurfaceResourcePort(),
      { ...options, language: () => this.language() },
    );
    this.owner = tree;
    this.parentPath = options.parentLevelPath ?? null;
    this.runtime = runtime;
    this.level.set(this.snapshot(runtime.level));
    this.unsubscribe = runtime.subscribe((level) => this.level.set(this.snapshot(level)));
  }
  private snapshot(level: UiEntryLevel): UiEntryLevel {
    return {
      ...level,
      state: { ...level.state, entry: { ...level.state.entry } },
      data: { ...level.data },
    };
  }
  dispose(): void {
    this.closePictureEditor();
    this.picturesPending.clear();
    this.dismissTools();
    this.dismissReferenceSelector();
    this.inspectorAllowed.set(false);
    const runtime = this.runtime;
    // The Surface manager owns all nested popups. Close them before disposing
    // their parent: UiHostLevelRuntime intentionally defers parent disposal
    // while a child is active, and a new Page must never bypass that guard.
    let ownsSurface = false;
    if (runtime && this.owner) {
      try {
        ownsSurface = this.owner.get(runtime.levelPath) === runtime.level;
      } catch {
        // An already-retired runtime does not own current children.
      }
    }
    if (runtime && ownsSurface && this.owner?.get(`${runtime.levelPath}.level`) !== undefined) {
      if (!this.surfaces) throw new Error('No popup manager to close nested Entry surfaces.');
      this.surfaces.closeDescendants(runtime.levelPath);
      if (this.owner?.get(`${runtime.levelPath}.level`) !== undefined)
        throw new Error('Cannot replace Entry while a nested Surface remains active.');
    }
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.runtime = null;
    this.level.set(null);
    this.owner = null;
    this.parentPath = null;
    runtime?.dispose();
  }
}
