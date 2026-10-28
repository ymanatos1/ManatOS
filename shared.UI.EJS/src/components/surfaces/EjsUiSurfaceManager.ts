import type { ContextTreeRuntime, ManatOSRuntimeRootContext } from '@manatos/shared';
import {
  UiBusyRuntime,
  UiDirtyCloseCoordinator,
  entryDirtyClosePresentation,
  type UiEntryLevel,
  type UiBusyPresentation,
  type UiLanguageDefinition,
  type UiSurfaceCloseReason,
  type UiSurfaceHandle,
  type UiSurfaceManager,
  type UiSurfaceOpenOptions,
} from '@manatos/shared-ui';
import { BusyOverlay } from '../shell/BusyOverlay.js';
import { PopupBase, type EjsPopupHost } from '../common/popups/PopupBase.js';
import { SignInPopup } from '../auth/SignInPopup.js';
import { RegisterPopup } from '../auth/RegisterPopup.js';
import { ResetPasswordPopup } from '../auth/ResetPasswordPopup.js';
import { ChangePasswordPopup } from '../auth/ChangePasswordPopup.js';
import { AlertPopup } from '../common/popups/AlertPopup.js';
import { ErrorPopup } from '../common/popups/ErrorPopup.js';
import { ChangeReportPopup } from '../common/change-report/ChangeReportPopup.js';
import { UnsavedChangesPopup } from '../common/popups/UnsavedChangesPopup.js';
import { ListPopupHost } from '../list/ListPopupHost.js';
import { EntryPopupHost } from '../entry/EntryPopupHost.js';
import { StorageWizardPopup } from '../administration/StorageWizardPopup.js';
import type { UiStorageSnapshot, UiStorageConfiguration } from '@manatos/shared-ui';

type PopupFactory = (invocation: UiSurfaceOpenOptions, host: EjsPopupHost) => PopupBase;
type SurfaceEntry = { readonly name: string; readonly popup: PopupBase };

/**
 * Application/session-level EJS surface registry and lifecycle owner.
 *
 * Mirrors the responsibilities of NgUiSurfaceManager, but uses native DOM
 * popup instances rather than Angular ComponentRefs. A surface's DOM, CTX
 * #level, private credential fields and subscriptions belong to its PopupBase;
 * only this manager can close a registered surface or its descendants.
 *
 * There are no static/global popup instances or process-wide user state.
 */
export class EjsUiSurfaceManager implements UiSurfaceManager {
  private readonly definitions = new Map<string, PopupFactory>([
    ['auth.signin', (invocation, host) => new SignInPopup(invocation, host)],
    ['auth.register', (invocation, host) => new RegisterPopup(invocation, host)],
    ['auth.resetPassword', (invocation, host) => new ResetPasswordPopup(invocation, host)],
    ['auth.changePassword', (invocation, host) => new ChangePasswordPopup(invocation, host)],
    ['message.alert', (invocation, host) => new AlertPopup(invocation, host)],
    ['message.error', (invocation, host) => new ErrorPopup(invocation, host)],
    ['semantic.changeReport', (invocation, host) => new ChangeReportPopup(invocation, host)],
    ['semantic.unsavedChanges', (invocation, host) => new UnsavedChangesPopup(invocation, host)],
    [
      'administration.storage',
      (invocation, host) => new StorageWizardPopup(invocation, host, this),
    ],
  ]);
  private readonly entries: SurfaceEntry[] = [];
  private readonly listSelectors: ListPopupHost[] = [];
  private readonly entryCreators: EntryPopupHost[] = [];
  private readonly entryClose = new UiDirtyCloseCoordinator();
  private readonly busy: UiBusyRuntime;
  private readonly busyOverlay: BusyOverlay;
  private debuggerAvailable = true;
  private destroyed = false;

  // Keep the browser host's existing constructor contract unchanged. All
  // callback values are presentation-only and never copied into CTX.
  constructor(
    private readonly context: ContextTreeRuntime<ManatOSRuntimeRootContext>,
    private readonly language: () => 'EN' | 'EL',
    private readonly revealContext?: (path: string) => boolean,
    private readonly selectLanguage?: (language: string) => void,
    busyRuntime?: UiBusyRuntime,
    private readonly initialFontScalePercent: () => number = () => 100,
    private readonly revealFlowStep?: (path: string) => boolean,
    private readonly isDebuggerForeground: () => boolean = () => false,
    private readonly popupClosed: () => void = () => {},
    private readonly popupOpened: () => void = () => {},
    private readonly debuggerDockWidth: () => number | null = () => null,
    private readonly languages: () => readonly UiLanguageDefinition[] = () => [],
    private readonly entityCapabilitiesFor: (
      entityKey: string,
    ) => Readonly<Record<string, boolean>> = () => ({}),
  ) {
    this.busy = busyRuntime ?? new UiBusyRuntime();
    this.busyOverlay = new BusyOverlay(document, this.busy, language);
  }

  withBusy<T>(operation: () => Promise<T>, presentation: UiBusyPresentation = {}): Promise<T> {
    return this.busy.run(operation, presentation);
  }

  open(name: string, invocation: UiSurfaceOpenOptions = {}): UiSurfaceHandle {
    if (this.destroyed) throw new Error('UI Surfaces host has been destroyed.');
    const create = this.definitions.get(name);
    if (!create) throw new Error(`Unsupported semantic popup: ${name}`);

    // The entry exists before mounting, so synchronous close requests from
    // a component cannot race registration. The popup's CTX is created once.
    const host: EjsPopupHost = {
      context: this.context,
      language: this.language,
      languages: this.languages,
      revealContext: this.revealContext,
      selectLanguage: this.selectLanguage,
      initialFontScalePercent: this.initialFontScalePercent,
      debuggerDockWidth: this.debuggerDockWidth,
      revealFlowStep: this.revealFlowStep,
      isDebuggerForeground: this.isDebuggerForeground,
      requestClose: (reason, actionId) => this.closeEntry(entry, reason, actionId),
      opened: () => {
        this.popupOpened();
        this.refreshDebuggerControls(this.debuggerAvailable);
      },
      closed: () => this.release(entry),
    };
    const popup = create(invocation, host);
    const entry: SurfaceEntry = { name, popup };
    this.entries.push(entry);
    try {
      const handle = popup.open();
      popup.refreshDebuggerControls(this.debuggerAvailable);
      return handle;
    } catch (error) {
      // A mounted popup releases itself during failed-open disposal.
      // If failure occurred before mounting, unregister silently: no visible
      // surface opened, so there must be no synthetic "closed" output.
      const index = this.entries.indexOf(entry);
      if (index >= 0) this.entries.splice(index, 1);
      throw error;
    }
  }

  /** One Storage wizard under the existing semantic popup/CTX manager. */
  openStorageWizard(
    snapshot: UiStorageSnapshot,
    configuration: UiStorageConfiguration | null,
    readOnly: boolean,
    onSaved: () => void,
  ): UiSurfaceHandle {
    const handle = this.open('administration.storage', {
      params: { snapshot, configuration, readOnly },
      allowXClosure: true,
      allowBackdropClosure: true,
    });
    const entry = this.entries.find((candidate) => candidate.popup.levelPath === handle.levelPath);
    if (!(entry?.popup instanceof StorageWizardPopup))
      throw new Error('Storage wizard host was not registered.');
    entry.popup.onSaved(onSaved);
    return handle;
  }

  /** Reuse the canonical List Page as a nested popup Surface, with standard modal/title. */
  openListSelector(
    entityKey: string,
    parentLevelPath: string,
    onSelected: (id: string, canCommit: () => boolean) => Promise<boolean>,
  ): { close(): void; isOpen(): boolean } {
    if (this.destroyed) throw new Error('UI Surfaces host has been destroyed.');
    if (!/^ctx\.ui(?:\.level)+$/.test(parentLevelPath))
      throw new Error('Invalid List parent Surface.');
    if (
      this.context.get(parentLevelPath) === undefined ||
      this.context.get(`${parentLevelPath}.level`) !== undefined
    )
      throw new Error('List parent is missing or already has a nested Surface.');
    const popup = new ListPopupHost(
      this.context,
      entityKey,
      parentLevelPath,
      this.language(),
      async (id) => {
        const isOpen = (): boolean => this.listSelectors.includes(popup);
        if (!isOpen()) return false;
        const accepted = await onSelected(id, isOpen);
        if (accepted && isOpen()) {
          close();
          return true;
        }
        return false;
      },
      () => close(),
      this.isDebuggerForeground,
      (path) => {
        if (this.debuggerAvailable) this.revealContext?.(path);
      },
      this.debuggerDockWidth,
      this.languages,
      (id) => this.selectLanguage?.(id),
      this.initialFontScalePercent,
    );
    const close = (): void => {
      const index = this.listSelectors.indexOf(popup);
      if (index < 0) return;
      this.listSelectors.splice(index, 1);
      try {
        this.closeDescendants(popup.levelPath);
        popup.dispose();
      } finally {
        this.popupClosed();
      }
    };
    this.listSelectors.push(popup);
    try {
      popup.open();
      popup.refreshDebuggerControls(this.debuggerAvailable);
      this.popupOpened();
      return { close, isOpen: () => this.listSelectors.includes(popup) };
    } catch (error) {
      const index = this.listSelectors.indexOf(popup);
      if (index >= 0) this.listSelectors.splice(index, 1);
      popup.dispose();
      throw error;
    }
  }

  /** One generic Entry popup host with explicit mode, shared by Create/View/Edit. */
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
    if (this.destroyed) throw new Error('UI Surfaces host has been destroyed.');
    const permissions = this.entityCapabilitiesFor(entityKey);
    if (mode !== 'create' && permissions.read !== true)
      throw new Error('Entry view not authorized.');
    if (mode === 'edit' && permissions.update !== true)
      throw new Error('Entry edit not authorized.');
    if (!/^ctx\.ui(?:\.level)+$/.test(parentLevelPath))
      throw new Error('Invalid Entry parent Surface.');
    if (
      this.context.get(parentLevelPath) === undefined ||
      this.context.get(`${parentLevelPath}.level`) !== undefined
    )
      throw new Error('Entry parent is missing or already has a nested Surface.');
    const popup = new EntryPopupHost(
      this.context,
      entityKey,
      parentLevelPath,
      this.language(),
      onCreated,
      () => this.requestEntryCreatorClose(popup, close),
      this.isDebuggerForeground,
      (path) => {
        if (this.debuggerAvailable) this.revealContext?.(path);
      },
      this.debuggerDockWidth,
      this.languages,
      (id) => this.selectLanguage?.(id),
      this.initialFontScalePercent,
      (key, parent, select) => {
        this.openListSelector(key, parent, select);
      },
      (key, parent, accept) => {
        this.openEntryCreator(key, parent, accept);
      },
      recordId,
      mode,
      (key, parent, id) => this.openEntryViewer(key, parent, id),
      this.entityCapabilitiesFor(entityKey),
      this.entityCapabilitiesFor,
      (path) => {
        if (this.debuggerAvailable) this.revealContext?.(path);
      },
      (report) => {
        this.open('semantic.changeReport', {
          params: { report },
          allowXClosure: true,
          allowBackdropClosure: true,
        });
      },
      () => this.debuggerAvailable,
    );
    const close = (): void => {
      const index = this.entryCreators.indexOf(popup);
      if (index < 0) return;
      this.entryCreators.splice(index, 1);
      try {
        this.closeDescendants(popup.levelPath);
        popup.dispose();
      } finally {
        this.popupClosed();
      }
    };
    this.entryCreators.push(popup);
    try {
      popup.open();
      popup.refreshDebuggerControls(this.debuggerAvailable);
      this.popupOpened();
      return { close, isOpen: () => this.entryCreators.includes(popup) };
    } catch (error) {
      const index = this.entryCreators.indexOf(popup);
      if (index >= 0) this.entryCreators.splice(index, 1);
      popup.dispose();
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

  private requestEntryCreatorClose(popup: EntryPopupHost, close: () => void): void {
    const current = this.context.get(popup.levelPath) as UiEntryLevel | undefined;
    if (!current || current.state.entry.saving || popup.isSelecting()) return;
    this.entryClose.requestExit(
      () => {
        const level = this.context.get(popup.levelPath) as UiEntryLevel | undefined;
        return level?.state.entry.dirty === true;
      },
      close,
      this,
      entryDirtyClosePresentation(current, this.language()),
    );
  }

  /** Close nested popups before their owning Entry Page is replaced. */
  closeDescendants(parentLevelPath: string): void {
    if (!/^ctx\.ui(?:\.level)+$/.test(parentLevelPath))
      throw new Error('Invalid owner Surface path.');
    for (const popup of [...this.entryCreators].reverse()) {
      if (popup.levelPath.startsWith(`${parentLevelPath}.level`)) this.closeEntryCreator(popup);
    }
    for (const popup of [...this.listSelectors].reverse()) {
      if (popup.levelPath.startsWith(`${parentLevelPath}.level`)) this.closeListSelector(popup);
    }
    for (const entry of [...this.entries].reverse()) {
      if (entry.popup.levelPath?.startsWith(`${parentLevelPath}.level`))
        this.closeEntry(entry, 'host');
    }
  }

  private closeEntryCreator(popup: EntryPopupHost): void {
    const index = this.entryCreators.indexOf(popup);
    if (index < 0) return;
    this.entryCreators.splice(index, 1);
    try {
      this.closeDescendants(popup.levelPath);
      popup.dispose();
    } finally {
      this.popupClosed();
    }
  }

  private closeListSelector(popup: ListPopupHost): void {
    const index = this.listSelectors.indexOf(popup);
    if (index < 0) return;
    this.listSelectors.splice(index, 1);
    try {
      this.closeDescendants(popup.levelPath);
      popup.dispose();
    } finally {
      this.popupClosed();
    }
  }

  /** Reapply debugger presentation state to each live instance. */
  refreshDebuggerControls(allowed: boolean): void {
    this.debuggerAvailable = allowed;
    for (const entry of [...this.entries]) entry.popup.refreshDebuggerControls(allowed);
    for (const popup of [...this.listSelectors]) popup.refreshDebuggerControls(allowed);
    for (const popup of [...this.entryCreators]) popup.refreshDebuggerControls(allowed);
  }

  /** A language change must not destroy or rebuild any native input. */
  refreshLanguage(): void {
    this.busyOverlay.refreshLanguage();
    for (const entry of [...this.entries]) entry.popup.refreshLanguage();
    for (const popup of [...this.listSelectors]) popup.refreshLanguage(this.language());
    for (const popup of [...this.entryCreators]) popup.refreshLanguage(this.language());
  }

  /**
   * Only the manager may close a surface. The non-host close path is forbidden
   * when a later surface is open, matching NG1's stack/CTX ownership rule.
   * Host teardown closes children first; a throwing observer cannot orphan the
   * remaining popups or suppress cleanup of their siblings.
   */
  private closeEntry(
    entry: SurfaceEntry,
    reason: UiSurfaceCloseReason,
    actionId: string | null = null,
  ): void {
    const index = this.entries.indexOf(entry);
    if (index < 0) return;
    if (index < this.entries.length - 1 && reason !== 'host') {
      throw new Error(`Close the nested surface before closing its ancestor.`);
    }
    let firstError: unknown;
    if (reason === 'host') {
      for (const child of [...this.entries.slice(index + 1)].reverse()) {
        try {
          this.closeEntry(child, 'host');
        } catch (error) {
          firstError ??= error;
        }
      }
    }
    try {
      entry.popup.dispose(reason, actionId);
    } catch (error) {
      firstError ??= error;
    }
    if (firstError !== undefined) throw firstError;
  }

  private release(entry: SurfaceEntry): void {
    const index = this.entries.indexOf(entry);
    if (index < 0) return;
    this.entries.splice(index, 1);
    try {
      this.popupClosed();
    } finally {
      this.refreshDebuggerControls(this.debuggerAvailable);
    }
  }

  /** Dispose in reverse creation order and release only the manager's overlay. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    let firstError: unknown;
    try {
      for (const popup of [...this.entryCreators].reverse()) {
        try {
          this.closeEntryCreator(popup);
        } catch (error) {
          firstError ??= error;
        }
      }
      for (const popup of [...this.listSelectors].reverse()) {
        try {
          this.closeListSelector(popup);
        } catch (error) {
          firstError ??= error;
        }
      }
      for (const entry of [...this.entries].reverse()) {
        try {
          this.closeEntry(entry, 'host');
        } catch (error) {
          firstError ??= error;
        }
      }
    } finally {
      this.busyOverlay.destroy();
    }
    if (firstError !== undefined) throw firstError;
  }
}
