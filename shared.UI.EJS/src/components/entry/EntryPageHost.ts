import { renderNativeComponent } from '../native-template.js';
import { EjsTransientMenus } from '../../runtime/transient-menu.js';
import { EntryPictures } from './picture/EntryPictures.js';
import {
  ContextTreeRuntime,
  appendContextPathMember,
  type ManatOSRuntimeRootContext,
  type MetadataLanguage,
} from '@manatos/shared';
import {
  UiEntryPageRuntime,
  uiEntryTabs,
  uiEntryTabNavigationVisible,
  uiEntryUIViewOptions,
  uiEntryCaption,
  uiEntryFieldPresentation,
  uiEntryRelatedCollection,
  entryChangeReportLocalized,
  createUiBrowserSurfaceResourcePort,
  type UiEntryLevel,
  type UiChangeReport,
  type UiLanguageDefinition,
} from '@manatos/shared-ui';
import { mountEntryFieldControls, disposeEntryFieldControls } from './fields/FieldComponents.js';
import {
  renderEntryTabs,
  renderEntryPanels,
  updateEntryTabs,
  selectEntryTab,
} from './EntryTabs.js';
import { renderSurfaceActions } from '../surfaces/SurfaceActions.js';
import { renderEntryChangeStatus, updateEntryChangeStatus } from './EntryChangeStatus.js';
import { updateEntryFormFields } from './fields/FormField.js';
import { updateEntrySections } from './EntrySections.js';
import { dismissFieldTools, performFieldToolAction } from './fields/FieldToolsMenu.js';

/** This Host owns Entry Surface lifetime, dirty-close policy and metadata
 * re-mounts; it composes Tabs/Panels/Actions but DOES NOT inspect field-native
 * markup or interpret a child tool action. See updateEntryTabs and
 * updateEntryFormFields for the component-owned update paths. */
export function renderEntryPageHost(): string {
  return renderNativeComponent('EntryPageHost');
}
export interface MountedEntryPageHost {
  readonly entityKey: string;
  readonly recordId: string;
  readonly levelPath: string;
  updateLanguage(language: MetadataLanguage): void;
  refreshPictureDebugger(): void;
  getSelectedUIView(): string;
  getUIViewOptions(language: MetadataLanguage): ReturnType<typeof uiEntryUIViewOptions>;
  getEntryMode(): 'view' | 'edit' | 'create';
  isUIViewBusy(): boolean;
  hasFailedUIViewRecovery(): boolean;
  selectUIView(key: string): Promise<void>;
  destroy(): void;
}
/** UIS ownership: Entry Surface lifecycle, dirty-close decisions and action dispatch; embedded children own tabs and field markup. */
export function mountEntryPageHost(
  scope: ParentNode,
  tree: ContextTreeRuntime<ManatOSRuntimeRootContext>,
  entityKey: string,
  recordId: string,
  initialLanguage: MetadataLanguage = 'EN',
  options: {
    host?: 'page' | 'popup';
    parentLevelPath?: string | null;
    permissions?: Readonly<Record<string, boolean>>;
    mode?: 'view' | 'edit' | 'create';
    onCaptionChanged?: (caption: string) => void;
    onUIViewStateChanged?: () => void;
    onCreated?: (record: Readonly<Record<string, unknown>>) => void;
    onCancel?: () => void;
    debuggerForeground?: () => boolean;
    debuggerRequested?: (path: string) => void;
    debuggerDockWidth?: () => number | null;
    languages?: () => readonly UiLanguageDefinition[];
    selectLanguage?: (language: string) => void;
    initialFontScalePercent?: () => number;
    openReferenceViewer?: (entityKey: string, parentLevelPath: string, recordId: string) => void;
    openReferenceCreator?: (
      entityKey: string,
      parentLevelPath: string,
      accept: (record: Readonly<Record<string, unknown>>) => Promise<boolean>,
    ) => void;
    openChangeReport?: (report: UiChangeReport) => void;
    inspectorAllowed?: () => boolean;
    canReadEntity?: (entityKey: string) => boolean;
    canCreateEntity?: (entityKey: string) => boolean;
    inspectCtx?: (path: string) => void;
    openReferenceList?: (
      entityKey: string,
      parentLevelPath: string,
      select: (id: string, canCommit: () => boolean) => Promise<boolean>,
    ) => void;
  } = {},
): MountedEntryPageHost {
  const element = scope.querySelector<HTMLElement>('[data-entry-page-host]');
  if (!element) throw new Error('Entry page host is not mounted.');
  let language = initialLanguage;
  const runtime = new UiEntryPageRuntime(
    tree,
    entityKey,
    recordId,
    createUiBrowserSurfaceResourcePort(),
    { ...options, language: () => language },
  );
  element.dataset.uiLevelPath = runtime.levelPath;
  const pictures = new EntryPictures(
    tree,
    runtime,
    element,
    entityKey,
    () => language,
    options.debuggerForeground,
    options.debuggerRequested ?? options.inspectCtx,
    options.inspectorAllowed,
    options.debuggerDockWidth,
    options.languages,
    options.selectLanguage,
    options.initialFontScalePercent,
  );
  let destroyed = false;
  const tabsForLevel = () =>
    uiEntryTabs(entityKey, language, {
      mode: runtime.level.state.entry.mode,
      permissions: runtime.level.state.entry.permissions,
      record: runtime.level.data.current,
      viewKey: runtime.level.state.entry.uiViewKey,
    });
  const template = (): string => {
    const tabs = tabsForLevel();
    return renderNativeComponent(
      'Entry',
      {},
      {
        Tabs: uiEntryTabNavigationVisible(entityKey, runtime.level.state.entry.uiViewKey)
          ? renderEntryTabs(tabs)
          : '',
        Panels: renderEntryPanels(tabs, entityKey, language),
        ChangeStatus: renderEntryChangeStatus(),
        Actions: renderSurfaceActions('entry', options.host ?? 'page', entityKey, language),
      },
    );
  };
  /** Native events are attached by the mounted Field, never by this page host. */
  const dispatchFieldControl: import('./fields/EntryFieldComponent.js').EjsFieldControlDispatch = (
    field,
    event,
    layoutId,
    tabIndex,
  ) => {
    return runtime.dispatchFieldInteraction(field, event, layoutId, tabIndex);
  };
  element.innerHTML = template();
  mountEntryFieldControls(element, dispatchFieldControl);
  /** Terminal recovery UI must not depend on remounting any Field component.
   * Keep the exit action reachable even if the form's DOM is incomplete.
   */
  const paintRecoveryFailure = (): void => {
    const state = runtime.level.state.entry;
    const message = state.error ?? 'Entry view recovery failed. Close and reopen this Entry.';
    const exitLabel = state.dirty
      ? language === 'EL'
        ? 'Άκυρον'
        : 'Cancel'
      : language === 'EL'
        ? 'Κλείσιμο'
        : 'Close';
    let alert = element.querySelector<HTMLElement>('[data-entry-recovery-error]');
    if (!alert) {
      alert = element.ownerDocument.createElement('div');
      alert.dataset['entryRecoveryError'] = '';
      alert.className = 'manatos-entry-header';
      const text = element.ownerDocument.createElement('span');
      text.setAttribute('role', 'alert');
      alert.append(text);
      element.prepend(alert);
    }
    const text = alert.querySelector<HTMLElement>('[role="alert"]');
    if (text) text.textContent = message;
    alert.hidden = false;
    for (const node of element.querySelectorAll<HTMLElement>(
      '[data-entry-tab-index], [data-entry-layout="Tabs"], [data-entry-layout="ChangeStatus"]',
    ))
      node.inert = true;
    element.querySelector<HTMLElement>('.manatos-entry-action-bar')?.removeAttribute('inert');
    const actions = element.querySelector<HTMLElement>('[data-entry-layout="Actions"]');
    actions?.removeAttribute('inert');
    for (const action of element.querySelectorAll<HTMLButtonElement>(
      'button[data-surface-action], button[data-entry-review-changes]',
    )) {
      action.disabled =
        action.dataset['surfaceAction'] !== 'cancel' && action.dataset['surfaceAction'] !== 'close';
    }
    if (!element.querySelector('[data-surface-action="cancel"], [data-surface-action="close"]')) {
      const footer = element.ownerDocument.createElement('footer');
      footer.className = 'ejs-semantic-popup-footer manatos-surface-actions';
      if (options.host === 'popup') {
        const exit = element.ownerDocument.createElement('button');
        exit.type = 'button';
        exit.className = 'manatos-surface-action';
        exit.dataset['surfaceAction'] = 'cancel';
        exit.textContent = exitLabel;
        footer.append(exit);
      } else {
        const exit = element.ownerDocument.createElement('a');
        exit.className = 'manatos-surface-action';
        exit.dataset['surfaceAction'] = 'close';
        exit.href = `/bo/${encodeURIComponent(entityKey)}`;
        exit.textContent = exitLabel;
        footer.append(exit);
      }
      element.append(footer);
    }
    options.onUIViewStateChanged?.();
  };
  const paint = (): void => {
    if (destroyed) return;
    const level: UiEntryLevel = runtime.level;
    if (level.state.entry.recoveryFailed) {
      paintRecoveryFailure();
      return;
    }
    updateEntryChangeStatus(element, level.state.entry.dirty, language);
    const exitText = element.querySelector<HTMLElement>(
      '[data-surface-action="close"] [data-surface-action-label], [data-surface-action="cancel"] [data-surface-action-label]',
    );
    if (exitText)
      exitText.textContent = level.state.entry.dirty
        ? language === 'EL'
          ? 'Ακύρωση'
          : 'Cancel'
        : language === 'EL'
          ? 'Κλείσιμο'
          : 'Close';
    const save = element.querySelector<HTMLButtonElement>('[data-surface-action="save"]');
    if (save)
      save.disabled =
        options.host !== 'popup' || !level.state.entry.saveReady || level.state.entry.saving;
    const selected = level.state.entry.activeTab;
    element.setAttribute(
      'data-entry-record-id',
      typeof level.data.current?.id === 'string' ? level.data.current.id : '',
    );
    const status =
      level.state.entry.error ??
      (level.state.entry.loading ? (language === 'EL' ? 'Φόρτωση…' : 'Loading…') : '');
    const header = element.querySelector<HTMLElement>('[data-entry-layout="Header"]');
    if (header) {
      header.textContent = status;
      header.hidden = !status;
    }
    if (!status && level.data.current) {
      const caption = uiEntryCaption(entityKey, level.data.original, language);
      if (caption !== lastCaption) {
        lastCaption = caption;
        options.onCaptionChanged?.(caption);
      }
    }
    const tabs = tabsForLevel();
    updateEntryTabs(element, tabs, selected);
    for (const [index] of tabs.entries()) {
      const section = element.querySelector<HTMLElement>(`[data-entry-tab-index="${index}"]`);
      if (section)
        updateEntryFormFields(
          section,
          level,
          entityKey,
          language,
          options.inspectorAllowed?.() === true,
          options.canReadEntity,
          options.canCreateEntity,
        );
    }
    updateEntrySections(element, level, entityKey, language);
    pictures.paint();
    options.onUIViewStateChanged?.();
  };
  let lastCaption = '';
  const tabSignature = () =>
    `${runtime.level.state.entry.uiViewKey}|${tabsForLevel()
      .map((tab) => `${tab.id}:${JSON.stringify(tab.layout)}`)
      .join('|')}`;
  let renderedTabSignature = tabSignature();
  // A failed mount invalidates the physical presentation regardless of the
  // previous signature. The rollback must remount even when its key is equal
  // to the last successfully rendered view.
  let physicalInvalid = false;
  const overlays = EjsTransientMenus.forDocument(element.ownerDocument);
  const remount = (signature: string): void => {
    const replacement = template(); // Prepare before tearing down the old UI.
    physicalInvalid = true;
    overlays.closeOwned(element);
    dismissFieldTools(element);
    disposeEntryFieldControls(element);
    element.innerHTML = replacement;
    try {
      mountEntryFieldControls(element, dispatchFieldControl);
      renderedTabSignature = signature;
      physicalInvalid = false;
    } catch (error) {
      // Dispose controls mounted before the failing Field. Rollback's next
      // notification must remount the old presentation from canonical CTX.
      disposeEntryFieldControls(element);
      throw error;
    }
  };
  const off = runtime.subscribe(() => {
    // A failed rollback is terminal: do not retry the broken Field remount.
    // Paint only the error and exit controls, regardless of physicalInvalid.
    if (runtime.level.state.entry.recoveryFailed) {
      paintRecoveryFailure();
      return;
    }
    try {
      const signature = tabSignature();
      if (physicalInvalid || signature !== renderedTabSignature) remount(signature);
      paint();
      const transition = runtime.pendingUIViewTransition();
      if (
        transition &&
        runtime.level.state.entry.uiViewKey === transition.viewKey &&
        !physicalInvalid
      ) {
        runtime.acknowledgeUIViewRendered(transition.generation, transition.viewKey);
      }
    } catch (error) {
      // CTX deliberately isolates listener errors. The transition coordinator
      // also needs physical failures during rollback, not just activation.
      if (!runtime.reportUIViewRenderError(error)) throw error;
    }
  });
  const dismissTools = (): void => {
    dismissFieldTools(element);
  };
  const closeQuickSelectors = (): void => {
    for (const panel of element.querySelectorAll<HTMLElement>('[data-entry-reference-selector]'))
      panel.hidden = true;
    overlays.closeOwned(element);
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      dismissTools();
      closeQuickSelectors();
    }
  };
  const onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (runtime.level.state.entry.recoveryFailed) {
      const cancel = target.closest<HTMLButtonElement>(
        '[data-surface-action="cancel"], [data-surface-action="close"]',
      );
      if (cancel) options.onCancel?.();
      return;
    }
    const viewTrigger = target.closest<HTMLButtonElement>('[data-entry-related-view-trigger]');
    if (viewTrigger && element.contains(viewTrigger)) {
      const menu = viewTrigger.nextElementSibling;
      if (menu instanceof HTMLElement) {
        menu.hidden = !menu.hidden;
        viewTrigger.setAttribute('aria-expanded', String(!menu.hidden));
      }
      return;
    }
    const viewOption = target.closest<HTMLButtonElement>('[data-entry-related-view-option]');
    if (viewOption && element.contains(viewOption)) {
      const host = viewOption.closest<HTMLElement>('[data-entry-related]');
      if (host) {
        runtime.setRelatedView(
          host.dataset['entryRelated'] ?? '',
          viewOption.dataset['entryRelatedViewOption'] ?? '',
        );
        updateEntrySections(element, runtime.level, entityKey, language);
      }
      return;
    }
    const related = target.closest<HTMLElement>('[data-entry-related-id]');
    if (
      related &&
      element.contains(related) &&
      target.closest('a, [data-entry-related-view-row]')
    ) {
      event.preventDefault();
      const key = related.dataset['entryRelatedKey'] ?? '';
      const id = related.dataset['entryRelatedId'] ?? '';
      const collection = uiEntryRelatedCollection(
        entityKey,
        key,
        runtime.level.state.entry.uiViewKey,
      );
      if (collection && /^[0-9a-f-]{36}$/i.test(id)) {
        const targetEntity = collection.relatedEntityKey ?? collection.entityKey;
        if (options.canReadEntity?.(targetEntity) !== false)
          options.openReferenceViewer?.(targetEntity, runtime.levelPath, id);
      }
      return;
    }
    const action = target.closest<HTMLButtonElement>('[data-surface-action]');
    if (action && element.contains(action)) {
      if (action.dataset['surfaceAction'] === 'cancel') options.onCancel?.();
      else if (action.dataset['surfaceAction'] === 'save' && !action.disabled) {
        void runtime.create().then((created) => {
          if (created && !destroyed) options.onCreated?.(created);
        });
      }
      return;
    }
    const review = target.closest<HTMLButtonElement>('[data-entry-review-changes]');
    if (review) {
      const level = runtime.level;
      if (review.disabled || !level.data.original || !level.data.current) return;
      const report = entryChangeReportLocalized({
        entityKey,
        original: level.data.original,
        current: level.data.current,
        caption: uiEntryCaption(entityKey, level.data.original, language),
        language,
        references: level.data.references,
      });
      if (report.count) options.openChangeReport?.(report);
      return;
    }
    if (selectEntryTab(target, (id) => runtime.selectTab(id))) {
      dismissTools();
      return;
    }

    dismissTools();
  };
  const onFieldToolAction = (event: Event): void => {
    if (!(event instanceof CustomEvent)) return;
    const detail: unknown = event.detail;
    if (!detail || typeof detail !== 'object' || !('field' in detail) || !('action' in detail))
      return;
    const { field, action } = detail;
    if (typeof field !== 'string' || typeof action !== 'string') return;
    performFieldToolAction(
      field,
      action,
      element,
      () => dismissTools(),
      (name, id) => runtime.performFieldTool(name, id),
      (name) => {
        if (!options.inspectorAllowed?.() || !runtime.level.state.fields[name]) return;
        const current = runtime.level.data.current;
        const parent =
          current && Object.hasOwn(current, name)
            ? `${runtime.levelPath}.data.current`
            : `${runtime.levelPath}.state.fields`;
        options.inspectCtx?.(appendContextPathMember(parent, name));
      },
    );
  };
  const onReferenceView = (event: Event): void => {
    if (!(event instanceof CustomEvent) || !options.openReferenceViewer) return;
    const { entityKey: related, id } = event.detail ?? {};
    if (typeof related !== 'string' || typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id))
      return;
    closeQuickSelectors();
    options.openReferenceViewer(related, runtime.levelPath, id);
  };
  const onReferenceBrowseCheck = (event: Event): void => {
    if (!(event instanceof CustomEvent) || destroyed) return;
    const { field, entityKey: related, resolve } = event.detail ?? {};
    if (typeof field !== 'string' || typeof related !== 'string' || typeof resolve !== 'function')
      return;
    if (options.canReadEntity && !options.canReadEntity(related)) {
      resolve(false);
      return;
    }
    void runtime
      .hasBrowsableRelatedEntries(field, related)
      .then((ready) => resolve(ready))
      .catch(() => resolve(false));
  };
  const onReferenceBrowse = (event: Event): void => {
    if (!(event instanceof CustomEvent) || !options.openReferenceList) return;
    const field = event.detail?.field;
    if (typeof field !== 'string' || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(field)) return;
    const current = runtime.level;
    if (!current.state.fields[field]?.editable) return;
    const fieldModel = uiEntryFieldPresentation(
      entityKey,
      field,
      current.data.current?.[field],
      language,
      undefined,
      typeof current.data.current?.id === 'string' ? current.data.current.id : undefined,
      current.data.references,
      current.state.fields[field],
    );
    const related = fieldModel?.relatedEntityKey;
    if (!related) return;
    closeQuickSelectors();
    options.openReferenceList(related, runtime.levelPath, (id, canCommit) =>
      runtime.selectAuthorizedReference(field, related, id, canCommit),
    );
  };
  const onReferenceCreate = (event: Event): void => {
    if (!(event instanceof CustomEvent) || !options.openReferenceCreator) return;
    const field = event.detail?.field;
    if (typeof field !== 'string' || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(field)) return;
    const current = runtime.level;
    if (!current.state.fields[field]?.editable) return;
    const model = uiEntryFieldPresentation(
      entityKey,
      field,
      current.data.current?.[field],
      language,
      undefined,
      typeof current.data.current?.id === 'string' ? current.data.current.id : undefined,
      current.data.references,
      current.state.fields[field],
    );
    if (!model?.relatedEntityKey || !options.canCreateEntity?.(model.relatedEntityKey)) return;
    closeQuickSelectors();
    options.openReferenceCreator(model.relatedEntityKey, runtime.levelPath, (record) =>
      runtime.acceptCreatedReference(field, model.relatedEntityKey!, record),
    );
  };
  const onReferenceClear = (event: Event): void => {
    if (!(event instanceof CustomEvent)) return;
    const field = event.detail?.field;
    if (typeof field !== 'string' || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(field)) return;
    if (!runtime.level.state.fields[field]?.editable) return;
    void runtime.performFieldTool(field, 'clear');
  };
  const onReferenceChoice = (event: Event): void => {
    if (!(event instanceof CustomEvent)) return;
    const { field, id } = event.detail ?? {};
    if (
      typeof field !== 'string' ||
      typeof id !== 'string' ||
      !/^[a-zA-Z][a-zA-Z0-9]*$/.test(field) ||
      !runtime.level.state.fields[field]?.editable
    )
      return;
    const model = uiEntryFieldPresentation(
      entityKey,
      field,
      runtime.level.data.current?.[field],
      language,
      undefined,
      typeof runtime.level.data.current?.id === 'string'
        ? runtime.level.data.current.id
        : undefined,
      runtime.level.data.references,
      runtime.level.state.fields[field],
    );
    if (
      !model?.relatedEntityKey ||
      !model.relatedCandidates?.some((candidate) => candidate.id === id && !candidate.unavailable)
    )
      return;
    const owner = Array.from(element.querySelectorAll<HTMLElement>('[data-entry-field]')).find(
      (node) => node.dataset['entryField'] === field,
    );
    const panel = owner ? overlays.panelFor(owner, '[data-entry-reference-selector]') : null;
    if (!panel || panel.hidden || panel.dataset['referenceSelecting'] === 'true') return;
    const version = String((Number(panel.dataset['referenceRequestVersion']) || 0) + 1);
    panel.dataset['referenceRequestVersion'] = version;
    panel.dataset['referenceSelecting'] = 'true';
    const canCommit = () =>
      !destroyed &&
      overlays.isOpen(panel) &&
      panel.dataset['referenceRequestVersion'] === version &&
      panel.dataset['referenceSelecting'] === 'true';
    const status = panel.querySelector<HTMLElement>('[data-entry-reference-error]');
    if (status) {
      status.hidden = true;
      status.textContent = '';
    }
    void runtime
      .selectAuthorizedReference(field, model.relatedEntityKey, id, canCommit)
      .then((accepted) => {
        if (!canCommit()) return;
        if (accepted) {
          if (overlays.isOpen(panel)) overlays.close();
          else panel.hidden = true;
          owner?.querySelector<HTMLButtonElement>('[data-entry-reference-open]')?.focus();
        } else if (status) {
          status.textContent =
            language === 'EL'
              ? 'Η εγγραφή δεν είναι διαθέσιμη για επιλογή.'
              : 'This entry is not eligible for selection.';
          status.hidden = false;
        }
      })
      .catch(() => {
        if (canCommit() && status) {
          status.textContent =
            language === 'EL'
              ? 'Η επιλογή απέτυχε. Δοκιμάστε ξανά.'
              : 'Selection failed. Please retry.';
          status.hidden = false;
        }
      })
      .finally(() => {
        if (panel.dataset['referenceRequestVersion'] === version)
          delete panel.dataset['referenceSelecting'];
      });
  };
  const onFieldHistory = (event: Event): void => {
    if (!(event instanceof CustomEvent) || destroyed) return;
    const { field, action } = event.detail ?? {};
    if (typeof field !== 'string' || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(field)) return;
    if (action !== 'undo' && action !== 'redo') return;
    if (!runtime.level.state.fields[field]?.editable) return;
    const history = runtime.level.data.history[field];
    if (!history?.changes.length) return;
    if (action === 'undo' && history.cursor > 0) void runtime.undoField(field);
    else if (action === 'redo' && history.cursor < history.changes.length)
      void runtime.redoField(field);
  };
  const onPictureAction = (event: Event): void => {
    if (event instanceof CustomEvent && !destroyed) void pictures.handle(event);
  };
  element.addEventListener('manatos:entry-picture', onPictureAction);
  element.addEventListener('manatos:entry-field-history', onFieldHistory);
  element.addEventListener('manatos:reference-choice', onReferenceChoice);
  element.addEventListener('manatos:reference-clear', onReferenceClear);
  element.addEventListener('manatos:reference-create', onReferenceCreate);
  element.addEventListener('manatos:reference-view', onReferenceView);
  element.addEventListener('manatos:reference-browse', onReferenceBrowse);
  element.addEventListener('manatos:reference-browse-check', onReferenceBrowseCheck);
  element.addEventListener('manatos:entry-field-tool', onFieldToolAction);
  element.addEventListener('click', onClick);
  // A portaled Tools menu still delegates its semantic action to the same Entry.
  const onPortaledClick = (event: MouseEvent): void => {
    if (
      event.target instanceof Node &&
      !element.contains(event.target) &&
      overlays.owns(element, event.target)
    )
      onClick(event);
  };
  element.ownerDocument.addEventListener('click', onPortaledClick);
  document.addEventListener('keydown', onKeyDown);
  paint();
  return {
    entityKey,
    recordId,
    levelPath: runtime.levelPath,
    refreshPictureDebugger(): void {
      pictures.refreshDebugger();
    },
    getSelectedUIView(): string {
      return runtime.level.state.entry.uiViewKey;
    },
    hasFailedUIViewRecovery(): boolean {
      return runtime.level.state.entry.recoveryFailed === true;
    },
    isUIViewBusy: () => {
      const state = runtime.level.state.entry;
      return (
        state.loading ||
        state.saving ||
        state.switching ||
        state.recoveryFailed === true ||
        !runtime.level.data.current
      );
    },
    getEntryMode(): 'view' | 'edit' | 'create' {
      return runtime.level.state.entry.mode;
    },
    getUIViewOptions(nextLanguage: MetadataLanguage) {
      return uiEntryUIViewOptions(
        entityKey,
        runtime.level.state.entry.uiViewKey,
        runtime.level.state.entry.mode,
        nextLanguage,
      );
    },
    async selectUIView(key: string): Promise<void> {
      if (destroyed) return;
      dismissTools();
      closeQuickSelectors();
      await runtime.selectUIView(key);
    },
    updateLanguage(next): void {
      if (!destroyed && next !== language) {
        if (runtime.level.state.entry.recoveryFailed) {
          language = next;
          paintRecoveryFailure();
          return;
        }
        const focused = element.ownerDocument.activeElement;
        const focusedField =
          focused instanceof HTMLElement && element.contains(focused)
            ? focused.closest<HTMLElement>('[data-entry-field]')?.dataset['entryField']
            : undefined;
        const controls = focusedField
          ? Array.from(element.querySelectorAll<HTMLElement>('[data-entry-field]'))
              .find((node) => node.dataset['entryField'] === focusedField)
              ?.querySelectorAll<HTMLElement>('[data-entry-control]')
          : undefined;
        const controlIndex =
          focused && controls ? Array.from(controls).indexOf(focused as HTMLElement) : -1;
        const caret =
          focused instanceof HTMLInputElement &&
          ['text', 'search', 'tel', 'url', 'email'].includes(focused.type)
            ? { start: focused.selectionStart, end: focused.selectionEnd }
            : null;
        language = next;
        pictures.refreshLanguage(next);
        dismissTools();
        disposeEntryFieldControls(element);
        element.innerHTML = template();
        mountEntryFieldControls(element, dispatchFieldControl);
        paint();
        if (focusedField && controlIndex >= 0) {
          const owner = Array.from(
            element.querySelectorAll<HTMLElement>('[data-entry-field]'),
          ).find((node) => node.dataset['entryField'] === focusedField);
          const target = owner?.querySelectorAll<HTMLElement>('[data-entry-control]')[controlIndex];
          target?.focus();
          if (
            caret &&
            target instanceof HTMLInputElement &&
            caret.start !== null &&
            caret.end !== null
          )
            target.setSelectionRange(caret.start, caret.end);
        }
      }
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      dismissTools();
      element.ownerDocument.removeEventListener('click', onPortaledClick);
      overlays.closeOwned(element);
      document.removeEventListener('keydown', onKeyDown);
      element.removeEventListener('manatos:reference-view', onReferenceView);
      element.removeEventListener('manatos:reference-browse', onReferenceBrowse);
      element.removeEventListener('manatos:reference-browse-check', onReferenceBrowseCheck);
      element.removeEventListener('manatos:entry-picture', onPictureAction);
      element.removeEventListener('manatos:entry-field-history', onFieldHistory);
      element.removeEventListener('manatos:reference-choice', onReferenceChoice);
      element.removeEventListener('manatos:reference-clear', onReferenceClear);
      element.removeEventListener('manatos:reference-create', onReferenceCreate);
      element.removeEventListener('manatos:entry-field-tool', onFieldToolAction);
      element.removeEventListener('click', onClick);
      disposeEntryFieldControls(element);
      pictures.dispose();
      off();
      runtime.dispose();
      if (element.dataset.uiLevelPath === runtime.levelPath) delete element.dataset.uiLevelPath;
    },
  };
}
