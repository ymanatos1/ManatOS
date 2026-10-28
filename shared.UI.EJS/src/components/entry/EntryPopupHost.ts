import type {
  ContextTreeRuntime,
  ManatOSRuntimeRootContext,
  MetadataLanguage,
} from '@manatos/shared';
import { uiEntryCaption, type UiChangeReport } from '@manatos/shared-ui';
import { acquireEjsModal, type EjsModalLease } from '../../runtime/modal-host.js';
import { PopupTitle, type MountedPopupTitle } from '../surfaces/PopupTitle.js';
import {
  mountEntryUIViewSelector,
  type MountedEntryUIViewSelector,
} from './EntryUIViewSelector.js';
import {
  renderEntryPageHost,
  mountEntryPageHost,
  type MountedEntryPageHost,
} from './EntryPageHost.js';

/** Popup chrome; mountEntryPageHost owns the one nested Entry #level. */
export class EntryPopupHost {
  readonly levelPath: string;
  private element: HTMLDivElement | null = null;
  private mounted: MountedEntryPageHost | null = null;
  private modal: EjsModalLease | null = null;
  private title: MountedPopupTitle | null = null;
  private viewSelector: MountedEntryUIViewSelector | null = null;
  private language: MetadataLanguage;
  private saving = false;
  constructor(
    private readonly tree: ContextTreeRuntime<ManatOSRuntimeRootContext>,
    readonly entityKey: string,
    readonly parentLevelPath: string,
    language: MetadataLanguage,
    private readonly onCreated: (record: Readonly<Record<string, unknown>>) => Promise<boolean>,
    private readonly requestClose: () => void,
    private readonly debuggerForeground: () => boolean,
    private readonly debuggerRequested: (path: string) => void,
    private readonly debuggerDockWidth: () => number | null,
    private readonly languages: () => readonly import('@manatos/shared-ui').UiLanguageDefinition[],
    private readonly selectLanguage: (language: string) => void,
    private readonly initialFontScalePercent: () => number,
    private readonly openReferenceList: (
      entityKey: string,
      parentLevelPath: string,
      select: (id: string, canCommit: () => boolean) => Promise<boolean>,
    ) => void,
    private readonly openReferenceCreator: (
      entityKey: string,
      parentLevelPath: string,
      accept: (record: Readonly<Record<string, unknown>>) => Promise<boolean>,
    ) => void,
    private readonly recordId: string = 'new',
    private readonly mode: 'view' | 'edit' | 'create' = 'create',
    private readonly openReferenceViewer?: (
      entityKey: string,
      parentLevelPath: string,
      recordId: string,
    ) => void,
    private readonly permissions: Readonly<Record<string, boolean>> = {},
    private readonly entityCapabilitiesFor: (
      entityKey: string,
    ) => Readonly<Record<string, boolean>> = () => ({}),
    private readonly inspectCtx?: (path: string) => void,
    private readonly openChangeReport?: (report: UiChangeReport) => void,
    private readonly inspectorAllowed: () => boolean = () => false,
  ) {
    this.language = language;
    this.levelPath = `${parentLevelPath}.level`;
  }
  isSelecting(): boolean {
    return this.saving;
  }
  open(): void {
    if (this.element) throw new Error('Entry creator already open.');
    const backdrop = document.createElement('div');
    backdrop.className = 'ejs-semantic-popup-backdrop manatos-list-popup-backdrop';
    const dialog = document.createElement('section');
    dialog.className = 'ejs-semantic-popup sign-in-dialog manatos-list-popup-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.tabIndex = -1;
    // The nested EntryPageHost alone marks the semantic #level DOM root.
    dialog.style.width = 'min(1080px, calc(100vw - 2rem))';
    dialog.style.maxHeight = 'calc(100vh - 2rem)';
    dialog.style.overflowY = 'auto';
    dialog.innerHTML = renderEntryPageHost();
    backdrop.append(dialog);
    document.body.append(backdrop);
    this.element = backdrop;
    try {
      this.mounted = mountEntryPageHost(
        dialog,
        this.tree,
        this.entityKey,
        this.recordId,
        this.language,
        {
          host: 'popup',
          onUIViewStateChanged: () => this.viewSelector?.refresh(),
          mode: this.mode,
          permissions: this.permissions,
          canReadEntity: (entityKey) => this.entityCapabilitiesFor(entityKey).read === true,
          canCreateEntity: (entityKey) => this.entityCapabilitiesFor(entityKey).create === true,
          inspectorAllowed: () => this.inspectorAllowed() && this.inspectCtx !== undefined,
          inspectCtx: this.inspectCtx,
          openChangeReport: this.openChangeReport,
          debuggerForeground: this.debuggerForeground,
          debuggerRequested: this.debuggerRequested,
          debuggerDockWidth: this.debuggerDockWidth,
          languages: this.languages,
          selectLanguage: this.selectLanguage,
          initialFontScalePercent: this.initialFontScalePercent,
          parentLevelPath: this.parentLevelPath,
          onCancel: () => {
            if (!this.saving && !this.hasPendingReferenceSelection()) this.requestClose();
          },
          openReferenceViewer: this.openReferenceViewer,
          openReferenceList: this.openReferenceList,
          openReferenceCreator: this.openReferenceCreator,
          onCreated: (record) => {
            if (this.saving) return;
            this.saving = true;
            void this.onCreated(record)
              .then((accepted) => {
                if (!this.element) return;
                if (accepted) this.requestClose();
                else
                  this.showError(
                    this.language === 'EL'
                      ? 'Η εγγραφή δημιουργήθηκε, αλλά δεν μπορεί να επιλεγεί.'
                      : 'Entry created, but it cannot be selected.',
                  );
              })
              .catch(() => {
                if (this.element)
                  this.showError(
                    this.language === 'EL'
                      ? 'Η εγγραφή δημιουργήθηκε, αλλά δεν μπορεί να επιλεγεί.'
                      : 'The created entry could not be selected.',
                  );
              })
              .finally(() => {
                this.saving = false;
              });
          },
        },
      );
      const viewHolder = dialog.ownerDocument.createElement('div');
      this.viewSelector = mountEntryUIViewSelector(
        viewHolder,
        this.entityKey,
        () => this.language,
        () => ({
          key: this.mounted?.getSelectedUIView() ?? 'main',
          mode: this.mounted?.getEntryMode() ?? this.mode,
          busy: this.saving || this.mounted?.isUIViewBusy() !== false,
        }),
        (key) => this.mounted?.selectUIView(key),
      );
      this.title = PopupTitle.mount(dialog, {
        leadingControl: viewHolder,
        title: this.titleModel(),
        language: () => this.language,
        languages: this.languages(),
        selectLanguage: this.selectLanguage,
        showLanguageSelection: true,
        showClose: true,
        showFontScale: true,
        initialFontScalePercent: this.initialFontScalePercent(),
        showDebugger: true,
        debuggerRequested: () => this.debuggerRequested(this.levelPath),
        flowDebuggerRequested: () => {},
        closeRequested: () => {
          if (!this.saving && !this.hasPendingReferenceSelection()) this.requestClose();
        },
      });
      this.modal = acquireEjsModal(document, () => dialog, this.debuggerForeground);
      backdrop.addEventListener('click', this.onBackdrop);
      document.addEventListener('keydown', this.onKeydown, true);
      dialog.focus();
    } catch (error) {
      this.dispose();
      throw error;
    }
  }
  private titleModel() {
    return {
      icon:
        this.mode === 'create'
          ? 'bi-plus-circle'
          : this.mode === 'edit'
            ? 'bi-pencil-square'
            : 'bi-eye',
      title: uiEntryCaption(this.entityKey, null, this.language),
      subtitle:
        this.mode === 'create'
          ? this.language === 'EL'
            ? 'Νέα σχετική εγγραφή'
            : 'Create related entry'
          : this.mode === 'edit'
            ? this.language === 'EL'
              ? 'Επεξεργασία σχετικής εγγραφής'
              : 'Edit related entry'
            : this.language === 'EL'
              ? 'Προβολή σχετικής εγγραφής'
              : 'View related entry',
    };
  }
  private showError(message: string): void {
    const header = this.element?.querySelector<HTMLElement>('[data-entry-layout="Header"]');
    if (header) {
      header.hidden = false;
      header.textContent = message;
    }
  }
  private hasPendingReferenceSelection(): boolean {
    // A failed view recovery must never trap the popup behind a stale selector.
    if (this.mounted?.hasFailedUIViewRecovery()) return false;
    return Boolean(
      this.element?.querySelector(
        '[data-entry-reference-selector]:not([hidden])[data-reference-selecting="true"]',
      ),
    );
  }
  private readonly onBackdrop = (event: MouseEvent): void => {
    if (
      event.target === this.element &&
      this.modal?.isTopmost() &&
      !this.saving &&
      !this.hasPendingReferenceSelection()
    )
      this.requestClose();
  };
  private readonly onKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !this.modal?.isTopmost() || this.saving) return;
    if (
      this.viewSelector &&
      event.target instanceof Node &&
      this.viewSelector.element.contains(event.target)
    )
      return;
    if (this.hasPendingReferenceSelection()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    // A child quick selector owns its own first Escape, not the Entry modal.
    if (
      event.target instanceof Element &&
      event.target.closest('[data-entry-reference-selector]:not([hidden])')
    )
      return;
    if (this.debuggerForeground() && !this.element?.contains(event.target as Node)) return;
    event.preventDefault();
    event.stopPropagation();
    this.requestClose();
  };
  refreshLanguage(language: MetadataLanguage): void {
    if (!this.element || this.language === language) return;
    this.language = language;
    this.mounted?.updateLanguage(language);
    this.title?.updateTitle(this.titleModel());
    this.title?.updateLanguage();
    this.viewSelector?.refresh();
  }
  refreshDebuggerControls(allowed: boolean): void {
    this.title?.updateDebugger(allowed, this.debuggerForeground());
    this.mounted?.refreshPictureDebugger();
    const dialog = this.element?.querySelector<HTMLElement>('[role="dialog"]');
    const width = allowed && this.debuggerForeground() ? this.debuggerDockWidth() : null;
    if (this.element)
      this.element.style.paddingRight =
        width !== null && width > 0 ? `${Math.round(width) + 16}px` : '';
    if (dialog) {
      if (this.debuggerForeground()) dialog.removeAttribute('aria-modal');
      else dialog.setAttribute('aria-modal', 'true');
    }
  }
  dispose(): void {
    document.removeEventListener('keydown', this.onKeydown, true);
    this.element?.removeEventListener('click', this.onBackdrop);
    this.viewSelector?.dispose();
    this.viewSelector = null;
    this.title?.dispose();
    this.title = null;
    this.mounted?.destroy();
    this.mounted = null;
    this.modal?.release();
    this.modal = null;
    this.element?.remove();
    this.element = null;
  }
}
