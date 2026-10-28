import { Component, OnDestroy, OnInit, computed, input, signal } from '@angular/core';

import {
  UiBrowserAdministrationClient,
  configurationInputError,
  groupUiConfigurations,
  hasDirtyConfigurationDrafts,
  type UiConfigurationSetting,
} from '@manatos/shared-ui';

type ConfigurationFeedback = {
  ok: boolean;
  message: string;
};

/**
 * Configuration presents API-projected settings as independent Apply operations.
 * Unsaved drafts (including replacement secrets) stay in component memory and
 * are discarded on navigation; they are not added to CTX or persistent state.
 */
@Component({
  selector: 'manatos-configuration-page-host',
  standalone: true,
  templateUrl: './ConfigurationPageHost.html',
  styleUrl: './ConfigurationPageHost.css',
})
export class ConfigurationPageHost implements OnInit, OnDestroy {
  readonly language = input<'EN' | 'EL'>('EN');
  readonly readOnly = input(false);

  private readonly api = new UiBrowserAdministrationClient();
  private readonly controller = new AbortController();
  private disposed = false;

  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly items = signal<readonly UiConfigurationSetting[]>([]);
  protected readonly groups = computed(() => groupUiConfigurations(this.items()));
  protected readonly saving = signal<ReadonlySet<string>>(new Set());
  protected readonly feedback = signal<ReadonlyMap<string, ConfigurationFeedback>>(new Map());

  private readonly drafts = signal<ReadonlyMap<string, string>>(new Map());

  hasUnsavedChanges(): boolean {
    return !this.readOnly() && hasDirtyConfigurationDrafts(this.items(), this.drafts());
  }

  ngOnInit(): void {
    void this.reload();
  }

  ngOnDestroy(): void {
    this.disposed = true;
    this.controller.abort();

    // No secret or unapplied setting survives the page component's lifecycle.
    this.drafts.set(new Map());
  }

  protected groupIcon(name: string): string {
    const icons: Record<string, string> = {
      UI: 'bi-window',
      API: 'bi-braces',
      Mail: 'bi-envelope-at',
      Logging: 'bi-journal-text',
      'Errors & diagnostics': 'bi-bug',
      Sessions: 'bi-clock-history',
    };
    return icons[name] ?? 'bi-gear';
  }

  protected t(en: string, el: string): string {
    return this.language() === 'EL' ? el : en;
  }

  protected draft(item: UiConfigurationSetting): string {
    return this.drafts().get(item.id) ?? this.originalValue(item);
  }

  protected canEdit(item: UiConfigurationSetting): boolean {
    return !this.readOnly() && item.editable && item.enabled;
  }

  /** Update only the edited setting so other inputs retain their current state. */
  protected edit(item: UiConfigurationSetting, event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
      return;
    }

    const nextDrafts = new Map(this.drafts());
    nextDrafts.set(item.id, target.value);
    this.drafts.set(nextDrafts);
    this.clearFeedback(item.id);
  }

  protected async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set('');

    try {
      const settings = await this.api.configurations(this.controller.signal);
      if (this.disposed) {
        return;
      }

      this.items.set(settings);
      this.drafts.set(new Map());
      this.feedback.set(new Map());
    } catch (error) {
      if (!this.disposed) {
        this.error.set(this.reason(error));
      }
    } finally {
      if (!this.disposed) {
        this.loading.set(false);
      }
    }
  }

  protected async apply(item: UiConfigurationSetting): Promise<void> {
    if (!this.canEdit(item) || this.saving().has(item.id)) {
      return;
    }

    const value = this.draft(item);
    const validationError = configurationInputError(item, value);

    if (validationError) {
      this.setFeedback(item.id, false, validationError);
      return;
    }

    // An empty sensitive input means "unchanged", never "clear the stored secret".
    if (item.sensitive && !value) {
      return;
    }

    this.beginSaving(item.id);

    try {
      const updated = await this.api.setConfigurationValue(item.id, value, this.controller.signal);
      if (this.disposed) {
        return;
      }

      // Replace one row without losing the page scroll position or other drafts.
      this.items.update((current) =>
        current.map((setting) => (setting.id === item.id ? updated : setting)),
      );
      this.forgetDraft(item.id);
      this.setFeedback(item.id, true, this.t('Applied.', 'Εφαρμόστηκε.'));
    } catch (error) {
      if (!this.disposed) {
        this.setFeedback(item.id, false, this.reason(error));
      }
    } finally {
      if (!this.disposed) {
        this.finishSaving(item.id);
      }
    }
  }

  protected result(id: string): ConfigurationFeedback | undefined {
    return this.feedback().get(id);
  }

  private originalValue(item: UiConfigurationSetting): string {
    return item.sensitive ? '' : (item.value ?? '');
  }

  private beginSaving(id: string): void {
    this.saving.update((active) => new Set([...active, id]));
    this.clearFeedback(id);
  }

  private finishSaving(id: string): void {
    this.saving.update((active) => {
      const next = new Set(active);
      next.delete(id);
      return next;
    });
  }

  private forgetDraft(id: string): void {
    const next = new Map(this.drafts());
    next.delete(id);
    this.drafts.set(next);
  }

  private clearFeedback(id: string): void {
    const next = new Map(this.feedback());
    next.delete(id);
    this.feedback.set(next);
  }

  private setFeedback(id: string, ok: boolean, message: string): void {
    const next = new Map(this.feedback());
    next.set(id, { ok, message });
    this.feedback.set(next);
  }

  private reason(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
