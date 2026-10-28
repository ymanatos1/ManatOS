import { MANATOS_COMPANY } from '@manatos/shared/domain/company-platform';

export const MANATOS_UI_BRANDING = MANATOS_COMPANY.branding;

export * from './application-state.js';

export * from './api/api-client.js';
export * from './api/apiHandler.js';
export * from './api/browser-api-transport.js';
export * from './bootstrap/ui-bootstrap.js';
export * from './bootstrap/ui-bootstrap-runtime.js';
export * from './authorization/ui-authorization.js';
export * from './expressions/ui-expression-capability.js';
export * from './diagnostics/ui-diagnostics-runtime.js';
export * from './multilingual/ui-language.js';

export * from './preferences/ui-preferences.js';
export * from './state/ui-tab-state.js';
export * from './state/ui-state-persistence.js';
export * from './state/ui-cli-history.js';
export * from './state/ui-state-runtime.js';
export * from './state/browser-ui-state-runtime.js';

export * from './platform/ui-platform.js';

export * from './navigation/ui-navigation.js';

export * from './debugger/debugger-ui-state.js';
export * from './debugger/api-traffic-history.js';
export * from './debugger/ctx-inspection.js';
export * from './debugger/layout/UiSurfaceLayoutHighlight.js';
export * from './runtime/source-trace.js';
export * from './debugger/cli/cli-toolbar.js';
export * from './debugger/cli/ctx-cli-engine.js';
export * from './debugger/api-traffic/api-traffic-view.js';

export * from './debugger/api-traffic/api-traffic-context.js';

export * from './pages/page.js';
export * from './runtime/content/template.js';
export * from './pages/source.js';
export * from './pages/runtime.js';
export * from './pages/documentation/documentation-source.js';
export * from './pages/documentation/documentation-browser.js';
export * from './pages/documentation/documentation-popup.js';

export * from './browser/detached-window-host.js';
export * from './browser/popup-window-host.js';
export * from './browser/auth-client.js';
export * from './browser/administration-client.js';
export * from './administration/storage.js';
export * from './administration/storage-workflow.js';
export * from './administration/configuration.js';

export * from './browser/font-scale.js';
export * from './browser/native-component-events.js';

export * from './runtime/component.js';
export * from './runtime/effect-dispatcher.js';
export * from './runtime/ui-busy-runtime.js';
export * from './runtime/content/runtime.js';
export * from './runtime/layout/node.js';
export * from './runtime/layout/path.js';
export * from './runtime/layout/writer.js';
export * from './runtime/reactivity.js';

export * from './runtime/surface/invocation.js';
export * from './runtime/surface/actions.js';
export * from './runtime/surface/lifecycle.js';
export * from './runtime/surface/events.js';
export * from './runtime/surface/embedded-runtime.js';

export * from './popups/auth/embedded/external-providers-layout.js';
export * from './popups/auth/embedded/registry.js';
export * from './popups/popup-definition.js';
export * from './popups/unsaved-changes-definition.js';
export * from './runtime/surface/dirty-close-coordinator.js';
export * from './runtime/surface/entry-dirty-level.js';
export * from './components/entry/EntryDirtyClosePresentation.js';
export * from './popups/auth/definitions.js';
export * from './popups/popup-runtime.js';
export * from './popups/embedded/registry.js';
export * from './popups/embedded/PopupComponents.js';

export * from './popups/messages/definitions.js';
export * from './runtime/surface/uiSurfaceManager.js';
export * from './flows/flowRunner.js';

export * from './popups/auth/reset-password-definition.js';
export * from './popups/auth/change-password-definition.js';
export * from './flows/auth/sessionHandler.js';

export * from './components/list/ListPageRuntime.js';

export * from './runtime/surface/host-runtime.js';
export * from './runtime/surface/host-level-runtime.js';

export * from './runtime/surface/resource-port.js';
export * from './browser/surface-resource-port.js';
export * from './components/list/data/entity-list-contracts.js';
export * from './components/list/data/entity-list-query.js';
export * from './components/list/data/entity-list-runtime.js';

export * from './components/fields/field-types.js';
export * from './components/fields/registry.js';
export * from './components/fields/FieldToolsView.js';
export * from './components/entry/EntryMetadata.js';
export * from './components/entry/EntryViews.js';
export * from './components/entry/EntrySections.js';
export * from './components/entry/EntryEditState.js';
export * from './components/entry/EntryRuntime.js';

export { EnumFieldBehavior } from './components/fields/types/EnumFieldBehavior.js';
export { uiDateInputValue } from './components/fields/types/DateFieldBehavior.js';
export { uiDatetimeInputValue } from './components/fields/types/DatetimeFieldBehavior.js';
export {
  uiDurationParts,
  uiDurationFromParts,
} from './components/fields/types/DurationFieldBehavior.js';
export { uiVersionParts } from './components/fields/types/VersionFieldBehavior.js';
export * from './components/common/change-report/change-report.js';
export * from './components/common/change-report/popup-definition.js';

export * from './components/picture/PictureEditor.js';
