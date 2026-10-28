import { Component, input, signal } from '@angular/core';
import type {
  UiPopupFeatureContentDefinition,
  UiStorageSnapshot,
  UiStorageTab,
} from '@manatos/shared-ui';
import { StorageWizardState } from './StorageWizardState';

/** Adapter-owned declarative fields, including conditional inputs and private secrets. */
@Component({
  selector: 'manatos-storage-metadata-fields',
  standalone: true,
  templateUrl: './StorageMetadataFields.html',
})
export class StorageMetadataFields {
  readonly wizard = input.required<StorageWizardState>();
  readonly step = input.required<UiStorageTab>();
  readonly excludeKeys = input<readonly string[]>([]);
  private readonly revealed = signal<ReadonlySet<string>>(new Set());

  protected visibleSecret(key: string): boolean {
    return this.revealed().has(key);
  }

  protected toggleSecret(key: string): void {
    const next = new Set(this.revealed());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.revealed.set(next);
  }

  static layout(
    snapshot: UiStorageSnapshot,
    tabId: string,
    excludeTargetDatabaseField = false,
  ): UiPopupFeatureContentDefinition {
    return {
      id: `storage-${tabId}-fields`,
      kind: 'feature-content',
      variantField: 'adapterId',
      variants: Object.fromEntries(
        snapshot.adapters.flatMap((adapter) => {
          const tab = adapter.tabs.find((candidate) => candidate.id === tabId);
          if (!tab) return [];
          return [
            [
              adapter.id,
              tab.fields
                .filter(
                  (field) =>
                    !excludeTargetDatabaseField ||
                    field.key !== adapter.targetWorkflow?.databaseFieldKey,
                )
                .map((field) => ({
                  id: `storage-setting-${adapter.id}-${field.key}`,
                  kind: 'feature-content' as const,
                })),
            ],
          ];
        }),
      ),
    };
  }
}
