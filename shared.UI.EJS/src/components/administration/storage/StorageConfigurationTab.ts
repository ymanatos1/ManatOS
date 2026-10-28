import type { UiPopupFeatureContentDefinition, UiStorageAdapter } from '@manatos/shared-ui';
import { renderNativeComponent } from '../../native-template.js';
import { type StorageView, StorageTabStatus, e, t, tr } from './StorageParts.js';
/** Independent main tab: owns EJS template and explicit embedded composition. */
export class StorageConfigurationTab {
  readonly id = 'configuration';
  static layout(): UiPopupFeatureContentDefinition[] {
    return [
      ...StorageTabStatus.layout(),
      {
        id: 'storage-configuration-form',
        kind: 'feature-content',
        children: [
          { id: 'storage-name', kind: 'feature-content' },
          { id: 'storage-adapter', kind: 'feature-content' },
        ],
      },
    ];
  }
  render(view: StorageView): string {
    const flow = view.workflow;
    const form = renderNativeComponent(
      'StorageConfigurationForm',
      {},
      {
        Content: `
      <div class="col-md-7" data-popup-layout-id="storage-name"><label class="form-label fw-semibold" for="storage-name">${e(t(view, 'Configuration name', 'Όνομα ρύθμισης'))}</label><input class="form-control" id="storage-name" data-storage-name value="${e(flow.draft.name)}" maxlength="160" ${flow.readOnly || flow.busy ? 'disabled' : ''}></div>
      <div class="col-md-5" data-popup-layout-id="storage-adapter"><label class="form-label fw-semibold" for="storage-adapter-picker">${e(t(view, 'Storage adapter', 'Προσαρμογέας'))}</label>
      <details class="storage-rich-picker" data-storage-adapter-picker>
        <summary class="btn btn-outline-secondary w-100 d-flex align-items-center text-start gap-2" id="storage-adapter-picker" ${flow.readOnly || flow.busy || flow.configuration ? 'aria-disabled="true" tabindex="-1"' : ''}>
          <img src="${e(flow.adapter?.logoUrl ?? '/images/storage-adapters/json.svg')}" alt="" width="24" height="24" class="rounded">
          <span>${tr(view, flow.adapter?.name ?? '')}</span><i class="bi bi-chevron-down ms-auto" aria-hidden="true"></i>
        </summary>
        <div class="storage-rich-picker-menu">${(() => {
          const groups = new Map<string, UiStorageAdapter[]>();
          for (const adapter of flow.snapshot.adapters) {
            const family =
              adapter.familyPath.map((name) => tr(view, name)).join(' › ') ||
              e(t(view, 'Other', 'Άλλο'));
            const members = groups.get(family) ?? [];
            members.push(adapter);
            groups.set(family, members);
          }
          return [...groups]
            .map(
              ([family, members]) =>
                `<div class="storage-picker-family">${family}</div>${members.map((item) => `<button type="button" class="storage-rich-option d-flex align-items-center gap-2 ${item.id === flow.draft.adapterId ? 'active' : ''}" data-storage-adapter-choice="${e(item.id)}"><img src="${e(item.logoUrl ?? '/images/storage-adapters/json.svg')}" alt="" width="24" height="24" class="rounded">${tr(view, item.name)}</button>`).join('')}`,
            )
            .join('');
        })()}</div>
      </details></div>
      <div class="col-12 small text-secondary">${tr(view, flow.adapter?.description ?? '')}</div>
      <div class="col-12 small">${e(t(view, 'Adapter family', 'Οικογένεια'))}: ${(flow.adapter?.familyPath ?? []).map((item) => tr(view, item)).join(' / ')} · ${flow.adapter?.runtimeAvailable ? e(t(view, 'Runtime available', 'Διαθέσιμο')) : e(t(view, 'Configuration and preparation only', 'Μόνο διαμόρφωση και προετοιμασία'))}</div>`,
      },
    );
    return renderNativeComponent(
      'StorageConfigurationTab',
      {},
      {
        Status: StorageTabStatus.render(view, false, 'configuration'),
        Form: form,
        Footer: StorageTabStatus.render(view, true),
      },
    );
  }
}
