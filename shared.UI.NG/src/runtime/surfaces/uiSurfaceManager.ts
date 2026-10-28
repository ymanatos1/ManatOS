import {
  Injectable,
  ViewContainerRef,
  signal,
  afterNextRender,
  inject,
  Injector,
  type ComponentRef,
  type Type,
} from '@angular/core';
import type { ContextTreeRuntime, ManatOSRuntimeRootContext } from '@manatos/shared';
import {
  type UiBusyRuntime,
  UiDirtyCloseCoordinator,
  entryDirtyClosePresentation,
  type UiEntryLevel,
  type UiBusyPresentation,
  type UiLanguageDefinition,
  type UiPublicExternalAuthProvider,
  type UiSurfaceCloseReason,
  type UiSurfaceEventListener,
  type UiSurfaceHandle,
  type UiSurfaceOpenOptions,
  type UiPopupLevel,
  type UiSurfaceManager,
} from '@manatos/shared-ui';
import { SignInPopup } from '../../components/auth/SignInPopup';
import { RegisterPopup } from '../../components/auth/RegisterPopup';
import { ResetPasswordPopup } from '../../components/auth/ResetPasswordPopup';
import { ChangePasswordPopup } from '../../components/auth/ChangePasswordPopup';
import { PopupBase } from '../../components/common/popups/PopupBase';
import { AlertPopup } from '../../components/common/popups/AlertPopup';
import { ErrorPopup } from '../../components/common/popups/ErrorPopup';
import { ChangeReportPopup } from '../../components/common/change-report/ChangeReportPopup';
import { UnsavedChangesPopup } from '../../components/common/popups/UnsavedChangesPopup';
import { PopupContext } from '../../components/surfaces/PopupContext';
import { ListPopupHost } from '../../components/sys-bo/list/ListPopupHost';
import { EntryPopupHost } from '../../components/sys-bo/entry/EntryPopupHost';
import { UiTransientMenuCoordinator } from './TransientMenu';

/** Presentation inputs are obtained from the current NG host, never stored in CTX. */
export interface NgSurfacePresentation {
  readonly contextTree: ContextTreeRuntime<ManatOSRuntimeRootContext>;
  readonly busyRuntime: UiBusyRuntime;
  readonly debuggerAllowed: boolean;
  readonly debuggerForeground: boolean;
  readonly debuggerDocked: boolean;
  readonly debuggerDockWidth: number | null;
  readonly initialFontScalePercent: number;
  readonly languages: readonly UiLanguageDefinition[];
  readonly currentLanguage: UiLanguageDefinition | null;
  readonly entityCapabilitiesFor?:
    ((entityKey: string) => Readonly<Record<string, boolean>>) | null;
  readonly externalProvidersLoader: (() => Promise<readonly UiPublicExternalAuthProvider[]>) | null;
  readonly signInHandler: ((identity: string, password: string) => Promise<void>) | null;
}

/** UI-only output callbacks; business decisions remain outside this handler. */
export interface NgSurfacePresentationEvents {
  fontScaleChanged(percent: number): void;
  languageSelected(language: string): void;
  debuggerRequested(levelPath: string): void;
  flowDebuggerRequested(stepPath: string): void;
  opened(): void;
  closed(): void;
  externalProviderRequested(provider: string): void;
}

type NgPopupComponent = PopupBase;

type SurfaceEntry = {
  readonly ref: ComponentRef<NgPopupComponent>;
  readonly popup: PopupContext;
  readonly name: string;
  readonly unsubscribeOutputs: Array<() => void>;
};

/**
 * Angular-only registry and presentation owner for semantic popup surfaces.
 * Caller-facing code never imports or constructs an individual popup.
 * Each instance owns one Angular component and one existing UiPopupRuntime.
 * There is no cross-session or static process-global instance.
 */
@Injectable()
export class NgUiSurfaceManager implements UiSurfaceManager {
  private readonly injector = inject(Injector);
  private readonly transientMenus = inject(UiTransientMenuCoordinator);
  private readonly definitions = new Map<string, Type<NgPopupComponent>>([
    ['auth.signin', SignInPopup],
    ['auth.register', RegisterPopup],
    ['auth.resetPassword', ResetPasswordPopup],
    ['auth.changePassword', ChangePasswordPopup],
    ['message.alert', AlertPopup],
    ['message.error', ErrorPopup],
    ['semantic.changeReport', ChangeReportPopup],
    ['semantic.unsavedChanges', UnsavedChangesPopup],
  ]);
  private readonly entries: SurfaceEntry[] = [];
  private readonly entryClose = new UiDirtyCloseCoordinator();
  private readonly entryCreators: Array<{
    readonly ref: ComponentRef<EntryPopupHost>;
    readonly levelPath: string;
    readonly dispose: () => void;
  }> = [];
  private readonly listSelectors: Array<{
    readonly ref: ComponentRef<ListPopupHost>;
    readonly levelPath: string;
    readonly dispose: () => void;
  }> = [];
  private outlet: ViewContainerRef | null = null;
  private presentation: NgSurfacePresentation | null = null;
  /** Trigger specialized child popups when host debugger/language presentation changes. */
  readonly popupPresentationRevision = signal(0);
  private events: NgSurfacePresentationEvents | null = null;

  attach(outlet: ViewContainerRef, events: NgSurfacePresentationEvents): void {
    if (this.outlet && this.outlet !== outlet) throw new Error('Surfaces host already attached.');
    this.outlet = outlet;
    this.events = events;
  }

  configure(presentation: NgSurfacePresentation): void {
    this.presentation = presentation;
    this.popupPresentationRevision.update((revision) => revision + 1);
    // Reapply reactive presentation inputs to all still-open semantic surfaces.
    for (const entry of this.entries) this.applyInputs(entry.ref);
    for (const entry of this.entryCreators) {
      entry.ref.setInput(
        'language',
        presentation.currentLanguage?.id?.toLowerCase() === 'el' ? 'EL' : 'EN',
      );
      entry.ref.setInput('debuggerForeground', presentation.debuggerForeground);
      entry.ref.setInput('debuggerAllowed', presentation.debuggerAllowed);
      entry.ref.setInput('debuggerDocked', presentation.debuggerDocked);
      entry.ref.setInput('debuggerDockWidth', presentation.debuggerDockWidth);
      entry.ref.setInput('currentLanguage', presentation.currentLanguage);
      entry.ref.setInput(
        'permissions',
        presentation.entityCapabilitiesFor?.(entry.ref.instance.entityKey()) ?? {},
      );
      entry.ref.setInput('languages', presentation.languages);
    }
    for (const entry of this.listSelectors) {
      entry.ref.setInput(
        'language',
        presentation.currentLanguage?.id?.toLowerCase() === 'el' ? 'EL' : 'EN',
      );
      entry.ref.setInput('debuggerForeground', presentation.debuggerForeground);
      entry.ref.setInput('debuggerAllowed', presentation.debuggerAllowed);
      entry.ref.setInput('debuggerDocked', presentation.debuggerDocked);
      entry.ref.setInput('debuggerDockWidth', presentation.debuggerDockWidth);
      entry.ref.setInput('currentLanguage', presentation.currentLanguage);
      entry.ref.setInput('languages', presentation.languages);
    }
  }

  /** Reuse normal popup UI tools for specialized editors; keep credentials private. */
  popupPresentation(): Pick<
    NgSurfacePresentation,
    | 'languages'
    | 'currentLanguage'
    | 'debuggerAllowed'
    | 'debuggerForeground'
    | 'debuggerDocked'
    | 'debuggerDockWidth'
    | 'initialFontScalePercent'
  > | null {
    const active = this.presentation;
    return active
      ? {
          languages: active.languages,
          currentLanguage: active.currentLanguage,
          debuggerAllowed: active.debuggerAllowed,
          debuggerForeground: active.debuggerForeground,
          debuggerDocked: active.debuggerDocked,
          debuggerDockWidth: active.debuggerDockWidth,
          initialFontScalePercent: active.initialFontScalePercent,
        }
      : null;
  }
  requestPopupLanguage(language: string): void {
    this.events?.languageSelected(language);
  }
  requestPopupDebugger(path: string): void {
    this.events?.debuggerRequested(path);
  }

  withBusy<T>(operation: () => Promise<T>, presentation: UiBusyPresentation = {}): Promise<T> {
    const busy = this.presentation?.busyRuntime;
    if (!busy) throw new Error('UI busy runtime is not configured.');
    return busy.run(operation, presentation);
  }

  open(name: string, invocation: UiSurfaceOpenOptions = {}): UiSurfaceHandle {
    this.transientMenus.dismiss();
    const componentType = this.definitions.get(name);
    const outlet = this.outlet;
    const config = this.presentation;
    if (!componentType) throw new Error(`Unknown UI surface: ${name}`);
    if (!outlet || !config) throw new Error('UI Surfaces host is not ready.');

    const ref = outlet.createComponent(componentType);
    const subscriptions: Array<() => void> = [];
    let entry: SurfaceEntry | null = null;
    try {
      this.applyInputs(ref);
      if (ref.instance instanceof PopupBase) {
        this.bindPopupOutputs(ref.instance, subscriptions);
      }
      // Subscribe before opening so a synchronous close cannot be lost.
      const closed = ref.instance.closed.subscribe(() => {
        if (entry) this.release(entry);
      });
      subscriptions.push(() => closed.unsubscribe());

      ref.changeDetectorRef.detectChanges();
      const popup = ref.instance.open(invocation);
      entry = { ref, popup, name, unsubscribeOutputs: subscriptions };
      this.entries.push(entry);
      const ownedEntry = entry;
      // afterNextRender happens after the caller receives its handle and
      // subscribes, and after Angular has committed the popup's DOM.
      afterNextRender(
        () => {
          if (this.entries.includes(ownedEntry)) popup.notifyShown();
        },
        { injector: this.injector },
      );
      return {
        name,
        levelPath: popup.levelPath,
        instanceId: popup.level().control.instanceId,
        isOpen: (): boolean => this.entries.includes(ownedEntry),
        setBusy: (value: boolean): void => {
          if (this.entries.includes(ownedEntry)) popup.setBusy(value);
        },
        readSignInCredentials: () =>
          this.entries.includes(ownedEntry) && ref.instance instanceof PopupBase
            ? ref.instance.readSignInCredentials()
            : null,
        readRegisterCredentials: () =>
          this.entries.includes(ownedEntry) && ref.instance instanceof PopupBase
            ? ref.instance.readRegisterCredentials()
            : null,
        readResetPasswordCredentials: () =>
          this.entries.includes(ownedEntry) && ref.instance instanceof PopupBase
            ? ref.instance.readResetPasswordCredentials()
            : null,
        readChangePasswordCredentials: () =>
          this.entries.includes(ownedEntry) && ref.instance instanceof PopupBase
            ? ref.instance.readChangePasswordCredentials()
            : null,
        setResource: (resource: string, value: unknown): void => {
          if (!this.entries.includes(ownedEntry)) return;
          popup.setResource(resource, value);
        },
        setResourceStatus: (
          resource: string,
          status: 'idle' | 'loading' | 'ready' | 'error',
          error: string | null = null,
        ): void => {
          if (!this.entries.includes(ownedEntry)) return;
          popup.setResourceStatus(resource, status, error);
        },
        onEvent(listener: UiSurfaceEventListener<UiPopupLevel>): () => void {
          return popup.onSurfaceEvent(listener);
        },
        close: (reason: UiSurfaceCloseReason = 'flow'): void => {
          if (!this.entries.includes(ownedEntry)) return;
          this.closeEntry(ownedEntry, reason);
        },
      };
    } catch (error) {
      for (const unsubscribe of subscriptions) {
        try {
          unsubscribe();
        } catch {
          /* Keep original opening error. */
        }
      }
      // If opening failed after CTX creation, Angular host teardown performs cleanup.
      try {
        ref.destroy();
      } catch {
        /* Keep original opening error. */
      }
      throw error;
    }
  }

  /** List popup owns no second popup runtime: ListPageHost publishes the child #level. */
  openListSelector(
    entityKey: string,
    parentLevelPath: string,
    onSelected: (id: string) => Promise<boolean>,
  ): { close(): void; isOpen(): boolean } {
    this.transientMenus.dismiss();
    const outlet = this.outlet;
    const config = this.presentation;
    if (!outlet || !config) throw new Error('UI Surfaces host is not ready.');
    if (!/^ctx\.ui(?:\.level)+$/.test(parentLevelPath))
      throw new Error('Invalid List parent Surface.');
    if (
      config.contextTree.get(parentLevelPath) === undefined ||
      config.contextTree.get(`${parentLevelPath}.level`) !== undefined
    )
      throw new Error('List parent is missing or already has a nested Surface.');
    const ref = outlet.createComponent(ListPopupHost);
    const levelPath = `${parentLevelPath}.level`;
    const off: Array<() => void> = [];
    let entry: (typeof this.listSelectors)[number] | null = null;
    const dispose = (): void => {
      if (!entry || !this.listSelectors.includes(entry)) return;
      this.listSelectors.splice(this.listSelectors.indexOf(entry), 1);
      this.closeDescendants(levelPath);
      for (const unsubscribe of off) unsubscribe();
      ref.destroy();
      this.events?.closed();
    };
    try {
      let selecting = false;
      const selected = ref.instance.selected.subscribe((id) => {
        if (selecting) return;
        selecting = true;
        ref.instance.setSelecting(true);
        void Promise.resolve()
          .then(() => onSelected(id))
          .then((accepted) => {
            if (entry && this.listSelectors.includes(entry)) {
              if (accepted) dispose();
              else ref.instance.selectionRejected();
            }
          })
          .catch(() => {
            if (entry && this.listSelectors.includes(entry)) ref.instance.selectionRejected();
          })
          .finally(() => {
            selecting = false;
            if (entry && this.listSelectors.includes(entry)) ref.instance.setSelecting(false);
          });
      });
      // List selectors own no Entry draft or dirty state: dismiss the List directly.
      const dismissed = ref.instance.dismissed.subscribe(() => dispose());
      const debuggerRequest = ref.instance.debuggerRequested.subscribe((path) =>
        this.events?.debuggerRequested(path),
      );
      const languageRequest = ref.instance.languageSelected.subscribe((id) =>
        this.events?.languageSelected(id),
      );
      off.push(
        () => selected.unsubscribe(),
        () => dismissed.unsubscribe(),
        () => debuggerRequest.unsubscribe(),
        () => languageRequest.unsubscribe(),
      );
      ref.setInput('contextTree', config.contextTree);
      ref.setInput('entityKey', entityKey);
      ref.setInput('parentLevelPath', parentLevelPath);
      ref.setInput('language', config.currentLanguage?.id?.toLowerCase() === 'el' ? 'EL' : 'EN');
      ref.setInput('debuggerForeground', config.debuggerForeground);
      ref.setInput('debuggerAllowed', config.debuggerAllowed);
      ref.setInput('debuggerDocked', config.debuggerDocked);
      ref.setInput('debuggerDockWidth', config.debuggerDockWidth);
      ref.setInput('currentLanguage', config.currentLanguage);
      ref.setInput('languages', config.languages);
      ref.setInput('initialFontScalePercent', config.initialFontScalePercent);
      entry = { ref, levelPath, dispose };
      this.listSelectors.push(entry);
      ref.changeDetectorRef.detectChanges();
      this.events?.opened();
      return { close: dispose, isOpen: () => entry !== null && this.listSelectors.includes(entry) };
    } catch (error) {
      if (entry && this.listSelectors.includes(entry))
        this.listSelectors.splice(this.listSelectors.indexOf(entry), 1);
      this.closeDescendants(levelPath);
      for (const unsubscribe of off) unsubscribe();
      ref.destroy();
      throw error;
    }
  }

  canReadEntity(entityKey: string): boolean {
    return this.presentation?.entityCapabilitiesFor?.(entityKey).read === true;
  }

  canCreateEntity(entityKey: string): boolean {
    return this.presentation?.entityCapabilitiesFor?.(entityKey).create === true;
  }

  /** One generic Entry popup host with explicit mode; EJS0-equivalent semantics. */
  openEntry(
    entityKey: string,
    parentLevelPath: string,
    mode: 'create' | 'view' | 'edit',
    recordId: string,
    onCreated: (record: Readonly<Record<string, unknown>>) => Promise<boolean> = async () => false,
  ): { close(): void; isOpen(): boolean } {
    if ((mode === 'create') !== (recordId === 'new'))
      throw new Error('Entry mode and record identifier do not match.');
    if (recordId !== 'new' && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(recordId))
      throw new Error('Invalid related Entry id.');
    const outlet = this.outlet;
    const config = this.presentation;
    if (!outlet || !config) throw new Error('UI Surfaces host is not ready.');
    const permissions = config.entityCapabilitiesFor?.(entityKey) ?? {};
    if (mode !== 'create' && permissions.read !== true)
      throw new Error('Entry view not authorized.');
    if (mode === 'edit' && permissions.update !== true)
      throw new Error('Entry edit not authorized.');
    if (!/^ctx\.ui(?:\.level)+$/.test(parentLevelPath))
      throw new Error('Invalid Entry parent Surface.');
    if (
      config.contextTree.get(parentLevelPath) === undefined ||
      config.contextTree.get(`${parentLevelPath}.level`) !== undefined
    )
      throw new Error('Entry parent is missing or already has a nested Surface.');
    const ref = outlet.createComponent(EntryPopupHost);
    const levelPath = `${parentLevelPath}.level`;
    const off: Array<() => void> = [];
    let entry: (typeof this.entryCreators)[number] | null = null;
    let selecting = false;
    const dispose = (): void => {
      if (!entry || !this.entryCreators.includes(entry)) return;
      this.entryCreators.splice(this.entryCreators.indexOf(entry), 1);
      this.closeDescendants(levelPath);
      for (const unsubscribe of off) unsubscribe();
      ref.destroy();
      this.events?.closed();
    };
    try {
      const created = ref.instance.created.subscribe((record) => {
        if (selecting) return;
        selecting = true;
        void onCreated(record)
          .then((accepted) => {
            if (accepted) dispose();
            else {
              selecting = false;
              ref.instance.selectionRejected();
            }
          })
          .catch(() => {
            selecting = false;
            ref.instance.selectionRejected();
          });
      });
      const dismissed = ref.instance.dismissed.subscribe(() => {
        const level = config.contextTree.get(levelPath) as UiEntryLevel | undefined;
        if (!level || level.state.entry.saving || selecting) return;
        this.entryClose.requestExit(
          () =>
            (config.contextTree.get(levelPath) as UiEntryLevel | undefined)?.state.entry.dirty ===
            true,
          dispose,
          this,
          entryDirtyClosePresentation(
            level,
            config.currentLanguage?.id?.toLowerCase() === 'el' ? 'EL' : 'EN',
          ),
        );
      });
      const changeReportRequest = ref.instance.changeReportRequested.subscribe((report) => {
        if (!entry || !this.entryCreators.includes(entry)) return;
        this.open('semantic.changeReport', {
          params: { report },
          allowXClosure: true,
          allowBackdropClosure: true,
        });
      });
      const debuggerRequest = ref.instance.debuggerRequested.subscribe((path) =>
        this.events?.debuggerRequested(path),
      );
      const languageRequest = ref.instance.languageSelected.subscribe((id) =>
        this.events?.languageSelected(id),
      );
      off.push(
        () => created.unsubscribe(),
        () => dismissed.unsubscribe(),
        () => changeReportRequest.unsubscribe(),
        () => debuggerRequest.unsubscribe(),
        () => languageRequest.unsubscribe(),
      );
      ref.setInput('contextTree', config.contextTree);
      ref.setInput('entityKey', entityKey);
      ref.setInput('recordId', recordId);
      ref.setInput('entryMode', mode);
      ref.setInput('permissions', config.entityCapabilitiesFor?.(entityKey) ?? {});
      ref.setInput('parentLevelPath', parentLevelPath);
      ref.setInput('language', config.currentLanguage?.id?.toLowerCase() === 'el' ? 'EL' : 'EN');
      ref.setInput('debuggerForeground', config.debuggerForeground);
      ref.setInput('debuggerAllowed', config.debuggerAllowed);
      ref.setInput('debuggerDocked', config.debuggerDocked);
      ref.setInput('debuggerDockWidth', config.debuggerDockWidth);
      ref.setInput('currentLanguage', config.currentLanguage);
      ref.setInput('languages', config.languages);
      ref.setInput('initialFontScalePercent', config.initialFontScalePercent);
      entry = { ref, levelPath, dispose };
      this.entryCreators.push(entry);
      ref.changeDetectorRef.detectChanges();
      this.events?.opened();
      return { close: dispose, isOpen: () => entry !== null && this.entryCreators.includes(entry) };
    } catch (error) {
      if (entry && this.entryCreators.includes(entry))
        this.entryCreators.splice(this.entryCreators.indexOf(entry), 1);
      for (const unsubscribe of off) unsubscribe();
      ref.destroy();
      throw error;
    }
  }

  openEntryViewer(entityKey: string, parentLevelPath: string, recordId: string) {
    return this.openEntry(entityKey, parentLevelPath, 'view', recordId);
  }

  openEntryCreator(
    entityKey: string,
    parentLevelPath: string,
    onCreated: (record: Readonly<Record<string, unknown>>) => Promise<boolean>,
  ) {
    return this.openEntry(entityKey, parentLevelPath, 'create', 'new', onCreated);
  }

  /** Close only nested popup Surfaces owned by this Page, deepest first. */
  closeDescendants(parentLevelPath: string): void {
    if (!/^ctx\.ui(?:\.level)+$/.test(parentLevelPath))
      throw new Error('Invalid owner Surface path.');
    for (const creator of [...this.entryCreators].reverse()) {
      if (creator.levelPath.startsWith(`${parentLevelPath}.level`)) creator.dispose();
    }
    for (const selector of [...this.listSelectors].reverse()) {
      if (selector.levelPath.startsWith(`${parentLevelPath}.level`)) selector.dispose();
    }
    for (const entry of [...this.entries].reverse()) {
      if (entry.popup.levelPath.startsWith(`${parentLevelPath}.level`))
        this.closeEntry(entry, 'host');
    }
  }

  /** Dispose children before parents, in reverse opening order. */
  detach(): void {
    for (const creator of [...this.entryCreators].reverse()) creator.dispose();
    for (const selector of [...this.listSelectors].reverse()) selector.dispose();
    for (const entry of [...this.entries].reverse()) {
      this.closeEntry(entry, 'host');
    }
    this.outlet = null;
    this.events = null;
    this.presentation = null;
  }

  private applyInputs(ref: ComponentRef<NgPopupComponent>): void {
    const config = this.presentation;
    if (!config) return;
    ref.setInput('contextTree', config.contextTree);
    if (!(ref.instance instanceof PopupBase)) return;
    ref.setInput('debuggerAllowed', config.debuggerAllowed);
    ref.setInput('debuggerForeground', config.debuggerForeground);
    ref.setInput('debuggerDocked', config.debuggerDocked);
    ref.setInput('debuggerDockWidth', config.debuggerDockWidth);
    ref.setInput('initialFontScalePercent', config.initialFontScalePercent);
    ref.setInput('languages', config.languages);
    ref.setInput('currentLanguage', config.currentLanguage);
    ref.setInput('externalProvidersLoader', config.externalProvidersLoader);
    ref.setInput('signInHandler', config.signInHandler);
  }

  private bindPopupOutputs(popup: PopupBase, unsubs: Array<() => void>): void {
    const subscriptions = [
      popup.fontScaleChanged.subscribe((value) => this.events?.fontScaleChanged(value)),
      popup.languageSelected.subscribe((value) => this.events?.languageSelected(value)),
      popup.debuggerRequested.subscribe((value) => this.events?.debuggerRequested(value)),
      popup.flowDebuggerRequested.subscribe((value) => this.events?.flowDebuggerRequested(value)),
      popup.opened.subscribe(() => this.events?.opened()),
      popup.closed.subscribe(() => this.events?.closed()),
      popup.externalProviderRequested.subscribe((value) =>
        this.events?.externalProviderRequested(value),
      ),
    ];
    for (const subscription of subscriptions) unsubs.push(() => subscription.unsubscribe());
  }

  private closeEntry(entry: SurfaceEntry, reason: UiSurfaceCloseReason): void {
    if (!this.entries.includes(entry)) return;
    const instance = entry.ref.instance;
    instance.close(reason === 'host', reason);
    // The component's `closed` output normally releases it synchronously.
  }

  private release(entry: SurfaceEntry): void {
    const index = this.entries.indexOf(entry);
    if (index < 0) return;
    this.entries.splice(index, 1);
    for (const unsubscribe of entry.unsubscribeOutputs) unsubscribe();
    entry.ref.destroy();
  }
}
