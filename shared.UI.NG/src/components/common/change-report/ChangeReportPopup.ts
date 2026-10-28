/**
 * UIS SOURCE NAVIGATION — ChangeReportPopup.
 * Angular native adapter: renders the shared semantic component; does not own canonical #layout/data.
 * Breakpoints here: constructor/registration; follow inherited hooks below.
 * Follow: common/popups/PopupBase.ts -> shared.UI/src/popups/embedded.
 * Cross-layer: Semantic owner: shared.UI/src/popups/embedded; EJS: shared.UI.EJS/src/components/common.
 * Source tracing: setUiComponentSourceTraceSink() in shared.UI/src/runtime/source-trace.ts.
 */
import { Component, computed } from '@angular/core';
import { resolveMetadataText, type MetadataLanguage } from '@manatos/shared';
import {
  CHANGE_REPORT_POPUP,
  localizedChangeReport,
  type UiChangeReport,
  type UiPopupDefinition,
} from '@manatos/shared-ui';
import { PopupBase } from '../popups/PopupBase';
import { PopupTitle } from '../../surfaces/PopupTitle';
import { AuthPopupActions } from '../../auth/AuthPopupActions';
import { HierarchicalReport } from './HierarchicalReport';

/** Domain-independent semantic popup. PopupBase owns CTX, focus, modal and disposal. */
@Component({
  selector: 'manatos-change-report-popup',
  standalone: true,
  imports: [PopupTitle, AuthPopupActions, HierarchicalReport],
  templateUrl: './ChangeReportPopup.html',
  styleUrls: ['../../auth/AuthPopup.css', './HierarchicalReport.css'],
})
export class ChangeReportPopup extends PopupBase {
  protected readonly definition: UiPopupDefinition = CHANGE_REPORT_POPUP;
  protected readonly reportLanguage = computed<MetadataLanguage>(() =>
    this.currentLanguage()?.id?.toLowerCase() === 'el' ? 'EL' : 'EN',
  );
  protected readonly report = computed<UiChangeReport | null>(() => {
    const value = this.popupContext()?.level().data.content['report'];
    return value && typeof value === 'object' && !Array.isArray(value)
      ? localizedChangeReport(value as UiChangeReport, this.reportLanguage())
      : null;
  });
  protected readonly title = computed(() => ({
    title: resolveMetadataText('@CM.UnsavedChanges', this.reportLanguage()),
    subtitle: '',
    icon: 'bi-pencil-square',
  }));
}
