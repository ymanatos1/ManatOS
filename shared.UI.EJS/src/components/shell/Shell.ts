export interface ShellOptions {
  header: string;
  primaryNavigation: string;
  workspaceNavigation: string;
  /** Optional host projection: no sidebar or restore control before authentication is verified. */
  workspaceNavigationAvailable?: boolean;
  workspace: string;
  debugger?: string;
  footer: string;
  language?: 'EN' | 'EL';
}

export function renderShell(options: ShellOptions): string {
  const greek = options.language === 'EL';
  const navigationAvailable = options.workspaceNavigationAvailable !== false;
  return `
    <div class="shell">
      ${options.header}
      ${options.primaryNavigation}

      <div class="shell-body${navigationAvailable ? '' : ' navigation-collapsed navigation-unavailable'}" data-shell-body>
        <div
          id="workspaceNavigationRegion"
          class="workspace-navigation-region${navigationAvailable ? '' : ' collapsed'}"
          aria-hidden="${!navigationAvailable}"
          data-workspace-navigation-region
        >
          <button
            type="button"
            class="shell-navigation-collapse"
            data-workspace-navigation-collapse
            title="${greek ? 'Σύμπτυξη πλοήγησης' : 'Collapse navigation'}"
            aria-label="${greek ? 'Σύμπτυξη πλοήγησης εφαρμογής' : 'Collapse application navigation'}"
            aria-controls="workspaceNavigationRegion"
            aria-expanded="${navigationAvailable}"
          >
            <i class="bi bi-chevron-left" aria-hidden="true"></i>
          </button>

          ${options.workspaceNavigation}
        </div>

        <button
          type="button"
          class="shell-navigation-restore"
          data-workspace-navigation-restore
          title="${greek ? 'Εμφάνιση πλοήγησης' : 'Show navigation'}"
          aria-label="${greek ? 'Εμφάνιση πλοήγησης εφαρμογής' : 'Show application navigation'}"
          aria-controls="workspaceNavigationRegion"
          aria-expanded="false"
          hidden
        >
          <i class="bi bi-layout-sidebar-inset" aria-hidden="true"></i>
        </button>

        <main>${options.workspace}</main>
        ${options.debugger ?? ''}
      </div>

      ${options.footer}
    </div>
  `;
}
