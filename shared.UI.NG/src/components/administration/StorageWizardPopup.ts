import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  input,
  output,
  untracked,
} from '@angular/core';
import {
  type UiPopupDefinition,
  type UiPopupTabDefinition,
  type UiStorageSnapshot,
  type UiStorageConfiguration,
  type UiSurfaceCloseReason,
} from '@manatos/shared-ui';
import { PopupBase } from '../common/popups/PopupBase';
import { PopupTitle } from '../surfaces/PopupTitle';
import { AuthPopupActions } from '../auth/AuthPopupActions';
import { PopupFooterActions } from '../common/popups/PopupFooterActions';
import { PopupBodyOutlet, popupBodyRegistry } from '../common/popups/PopupBodyOutlet';
import { PopupContext } from '../surfaces/PopupContext';
import { defineStoragePopup } from './storage/StoragePopupDefinition';
import { StorageWizardState } from './storage/StorageWizardState';
import { StorageMetadataTab } from './storage/StorageMetadataTab';
import { StorageTabBase } from './storage/StorageTabBase';
import { storageTabComponents } from './storage/StorageTabComponents';

/** Register feature content at its owner, not in the shared PopupBodyOutlet module. */
popupBodyRegistry.register('storage', {
  component: StorageMetadataTab,
  inputs: ['popup', 'tab', 'language', 'featureContext'],
  focus: (instance) => (instance as StorageMetadataTab).focusFirst(),
});

for (const tab of storageTabComponents) {
  popupBodyRegistry.registerTab('storage', tab.id, {
    component: tab.component,
    inputs: ['popup', 'tab', 'language', 'featureContext'],
    focus: (instance) => (instance as StorageTabBase).focusFirst(),
  });
}

/**
 * Storage-specific concrete popup host.
 * PopupBase owns its modal, title, footer, focus, keyboard and single CTX #level.
 * Shared workflow semantics belong to UiStorageWorkflowController; tab children own their markup.
 */
@Component({
  selector: 'manatos-storage-wizard-popup',
  standalone: true,
  imports: [PopupTitle, PopupBodyOutlet, AuthPopupActions, PopupFooterActions],
  templateUrl: '../common/popups/Popup.html',
  styleUrls: ['../auth/AuthPopup.css', '../auth/RegisterPopup.css', './StorageWizardPopup.css'],
})
export class StorageWizardPopup extends PopupBase implements OnInit, OnDestroy {
  readonly snapshot = input.required<UiStorageSnapshot>();
  readonly configuration = input<UiStorageConfiguration | null>(null);
  readonly readOnly = input(false);
  readonly language = input<'EN' | 'EL'>('EN');
  readonly dismissed = output<void>();
  readonly closeRequested = output<void>();
  readonly committed = output<void>();

  protected override readonly popupLanguage = computed(() => this.language());

  protected override readonly localizedTitle = computed(() => {
    const tab = this.activeTab();
    return {
      ...tab.title,
      title: this.tabTitle(tab),
      subtitle: this.multilingual().resolve(tab.title.subtitle),
    };
  });

  protected override tabStatusIcon(tabId: string): string {
    if (tabId === 'configuration' || tabId === 'capabilities') return '';
    const step = this.state?.stepById(tabId);
    if (!step || !this.state) return '';
    if (tabId === 'connection' && this.state.connectionState() === 'verified')
      return 'bi-check-circle-fill text-success';
    if (tabId === 'database' && this.state.databaseState() === 'ready')
      return 'bi-check-circle-fill text-success';
    if (tabId === 'schema' && this.state.schemaState() === 'ready')
      return 'bi-check-circle-fill text-success';
    if (!this.state.stepAccessible(step)) return 'bi-lock-fill text-secondary';
    if (this.state.stepNeedsCurrentVerification(step))
      return 'bi-exclamation-triangle-fill text-warning';
    return '';
  }

  protected override tabTitle(tab: UiPopupTabDefinition): string {
    return (
      this.state?.translate(
        this.state.stepById(tab.id)?.label ??
          (tab.id === 'capabilities' ? 'Capabilities' : 'Configuration'),
      ) ?? super.tabTitle(tab)
    );
  }

  protected definition: UiPopupDefinition = {
    id: 'administration.storage',
    showLanguageSelection: true,
    allowFontScale: true,
    allowDebugger: true,
    fields: [],
    rules: [],
    view: {
      id: 'configuration',
      title: { title: 'Storage', subtitle: '', icon: 'bi-database' },
      content: [],
      actions: [],
    },
  };
  private state: StorageWizardState | null = null;

  constructor() {
    super();
    // Language changes update feature content without rebuilding the popup level.
    effect(() => {
      const language = this.language();
      this.state?.language.set(language);
    });

    // Reactive tab reconciliation can change #state.tab without a DOM click.
    // In that case, restore focus through the same common popup focus policy.
    effect(() => {
      const activeId = this.popupContext()?.activeTab().id;
      if (activeId) untracked(() => this.focusActiveTab());
    });
  }

  ngOnInit(): void {
    this.definition = defineStoragePopup(this.snapshot(), this.readOnly());
    this.state = new StorageWizardState(
      this.snapshot(),
      this.configuration(),
      this.readOnly(),
      this.language(),
      () => this.committed.emit(),
    );
    this.popupFeatureContext.set(this.state);
    const popup = this.open({ allowXClosure: true, allowBackdropClosure: true });
    this.state.attach(popup);
  }

  protected override onPopupAction(popup: PopupContext, actionId: string): void {
    if (actionId === 'save' && this.state && !popup.busy()) {
      void this.state.save();
    }
  }

  /** All dismissal routes, including Escape and backdrop, use one dirty-state policy. */
  override close(
    force = false,
    reason: UiSurfaceCloseReason = 'flow',
    actionId: string | null = null,
  ): void {
    if (!force && (this.popupContext()?.busy() || this.state?.busy())) {
      return;
    }
    if (!force && this.hasUnsavedChanges()) {
      this.closeRequested.emit();
      return;
    }
    const wasOpen = this.popupContext() !== null;
    super.close(force, reason, actionId);
    if (wasOpen && this.popupContext() === null) {
      this.dismissed.emit();
    }
  }

  protected override popupSaveMode(): 'create' | 'update' {
    return this.state?.configuration() ? 'update' : 'create';
  }

  protected override popupDirty(): boolean {
    return this.hasUnsavedChanges();
  }

  hasUnsavedChanges(): boolean {
    return !this.readOnly() && this.state?.hasUnsavedChanges() === true;
  }

  override ngOnDestroy(): void {
    super.ngOnDestroy();
    this.state?.dispose();
    this.state = null;
  }
}
