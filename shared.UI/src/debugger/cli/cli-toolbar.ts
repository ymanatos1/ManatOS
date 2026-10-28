/**
 * Framework-independent Global CLI toolbar contract.
 * Angular and EJS render the same caption, accessible actions, iconography and
 * ordering. Each platform owns DOM/event wiring, not a separate UI policy.
 */
export const UI_CLI_TOOLBAR = Object.freeze({
  globalCaption: 'Global CLI',
  contextualCaption: 'CTX CLI',
  terminalIcon: 'bi bi-terminal',
  fontSizeSubject: 'CLI',
  decreaseFontSize: 'Decrease CLI font size',
  resetFontSize: 'Reset CLI font size to 100%',
  increaseFontSize: 'Increase CLI font size',
  detach: 'Detach Global CLI',
  attach: 'Attach Global CLI',
  detachIcon: 'bi bi-box-arrow-up-right',
  attachIcon: 'bi bi-box-arrow-in-down-left',
  close: 'Close CLI',
});
