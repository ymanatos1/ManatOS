import type {
  ContextTreeRuntime,
  ManatOSRuntimeRootContext,
  MetadataLanguage,
} from '@manatos/shared';
import { uiListEntityLabel } from '@manatos/shared-ui';
import { acquireEjsModal, type EjsModalLease } from '../../runtime/modal-host.js';
import { PopupTitle, type MountedPopupTitle } from '../surfaces/PopupTitle.js';
import { renderListPageHost, mountListPageHost, type MountedListPageHost } from './ListPageHost.js';

/** EJS modal chrome around the SAME List Page component. No UiPopupRuntime or extra #level. */
export class ListPopupHost {
  private element: HTMLDivElement | null = null;
  private mounted: MountedListPageHost | null = null;
  private modal: EjsModalLease | null = null;
  private title: MountedPopupTitle | null = null;
  private language: MetadataLanguage;
  readonly levelPath: string;
  constructor(
    private readonly tree: ContextTreeRuntime<ManatOSRuntimeRootContext>,
    readonly entityKey: string,
    readonly parentLevelPath: string,
    language: MetadataLanguage,
    private readonly onSelected: (id: string) => Promise<boolean>,
    private readonly requestClose: () => void,
    private readonly debuggerForeground: () => boolean,
    private readonly debuggerRequested: (path: string) => void,
    private readonly debuggerDockWidth: () => number | null,
    private readonly languages: () => readonly import('@manatos/shared-ui').UiLanguageDefinition[],
    private readonly selectLanguage: (language: string) => void,
    private readonly initialFontScalePercent: () => number,
  ) {
    this.language = language;
    this.levelPath = `${parentLevelPath}.level`;
  }

  open(): void {
    if (this.element) throw new Error('List selector already open.');
    const backdrop = document.createElement('div');
    backdrop.className = 'ejs-semantic-popup-backdrop manatos-list-popup-backdrop';
    const dialog = document.createElement('section');
    dialog.className = 'ejs-semantic-popup sign-in-dialog manatos-list-popup-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.tabIndex = -1;
    dialog.dataset.uiLevelPath = this.levelPath;
    dialog.style.width = 'min(1080px, calc(100vw - 2rem))';
    dialog.style.maxHeight = 'calc(100vh - 2rem)';
    dialog.style.overflowY = 'auto';
    dialog.innerHTML = renderListPageHost(this.language);
    backdrop.append(dialog);
    document.body.append(backdrop);
    this.element = backdrop;
    try {
      this.mounted = mountListPageHost(dialog, this.tree, this.entityKey, this.language, {
        host: 'popup',
        parentLevelPath: this.parentLevelPath,
        selectionMode: 'single',
        onRowSelected: (id) => {
          void this.choose(id);
        },
        onCancel: () => {
          this.requestClose();
        },
      });
      this.title = PopupTitle.mount(dialog, {
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
          this.requestClose();
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
  private choosing = false;
  private async choose(id: string): Promise<void> {
    if (this.choosing) return;
    this.choosing = true;
    this.element?.querySelector<HTMLElement>('[data-selection-error]')?.replaceChildren();
    try {
      const accepted = await this.onSelected(id);
      if (!accepted && this.element) {
        const dialog = this.element.querySelector<HTMLElement>('[role="dialog"]');
        if (dialog) {
          let status = dialog.querySelector<HTMLElement>('[data-selection-error]');
          if (!status) {
            status = dialog.ownerDocument.createElement('p');
            status.dataset['selectionError'] = '';
            status.setAttribute('role', 'alert');
            status.className = 'manatos-entry-selection-error';
            dialog.querySelector('[data-list-page-host]')?.before(status);
          }
          status.textContent =
            this.language === 'EL'
              ? 'Η εγγραφή δεν είναι διαθέσιμη για επιλογή.'
              : 'This entry is not eligible for selection.';
        }
      }
    } catch {
      if (this.element) {
        const dialog = this.element.querySelector<HTMLElement>('[role="dialog"]');
        if (dialog) {
          let status = dialog.querySelector<HTMLElement>('[data-selection-error]');
          if (!status) {
            status = dialog.ownerDocument.createElement('p');
            status.dataset['selectionError'] = '';
            status.setAttribute('role', 'alert');
            status.className = 'manatos-entry-selection-error';
            dialog.querySelector('[data-list-page-host]')?.before(status);
          }
          status.textContent =
            this.language === 'EL'
              ? 'Η επιλογή απέτυχε. Δοκιμάστε ξανά.'
              : 'Selection failed. Please retry.';
        }
      }
    } finally {
      this.choosing = false;
    }
  }
  private titleModel() {
    return {
      icon: 'bi-list-ul',
      title: uiListEntityLabel(this.entityKey, this.language),
      subtitle: this.language === 'EL' ? 'Επιλογή υπάρχουσας εγγραφής' : 'Select an existing entry',
    };
  }
  private readonly onBackdrop = (event: MouseEvent): void => {
    if (event.target === this.element && this.modal?.isTopmost()) this.requestClose();
  };
  private readonly onKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !this.modal?.isTopmost()) return;
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
  }
  refreshDebuggerControls(allowed: boolean): void {
    this.title?.updateDebugger(allowed, this.debuggerForeground());
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
