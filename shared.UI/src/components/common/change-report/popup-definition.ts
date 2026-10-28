import type { UiPopupDefinition } from '../../../popups/popup-definition.js';
/** Universal read-only report popup, built on the same Surface popup runtime as Auth. */
export const CHANGE_REPORT_POPUP: UiPopupDefinition = {
  id: 'semantic.changeReport',
  presentation: { content: 'change-report', variant: 'report' },
  showLanguageSelection: true,
  allowFontScale: true,
  allowDebugger: true,
  fields: [],
  rules: [],
  view: {
    id: 'report',
    title: { title: '@CM.UnsavedChanges', subtitle: '', icon: 'bi-pencil-square' },
    content: [{ id: 'change-report-tree', kind: 'note', icon: 'bi-list-nested', text: '' }],
    actions: [{ id: 'cancel', label: '@CM.Close', type: 'button' }],
  },
};
