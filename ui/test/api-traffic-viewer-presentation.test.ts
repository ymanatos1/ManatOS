import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { sourceWithoutWhitespace } from './source-contract.js';

const shellSource = readFileSync(resolve(process.cwd(), 'public/js/shell.js'), 'utf8');
const viewerSource = readFileSync(
  resolve(process.cwd(), 'public/js/debugger/api-traffic.js'),
  'utf8',
);
const navSource = readFileSync(
  resolve(process.cwd(), 'views/components/navigation/horizontal-nav.ejs'),
  'utf8',
);
const shellViewSource = readFileSync(resolve(process.cwd(), 'views/layout/shell.ejs'), 'utf8');
const viewerViewSource = readFileSync(
  resolve(process.cwd(), 'views/components/debugging/api-traffic.ejs'),
  'utf8',
);
const developerToolsViewSource = readFileSync(
  resolve(process.cwd(), 'views/components/debugging/developer-tools.ejs'),
  'utf8',
);
const debuggerCssSource = readFileSync(
  resolve(process.cwd(), 'public/css/debugger/ctx-debug.css'),
  'utf8',
);
const layoutSource = readFileSync(resolve(process.cwd(), 'public/css/layout.css'), 'utf8');
const appSource = readFileSync(resolve(process.cwd(), 'src/app.ts'), 'utf8');
const bootstrapSource = readFileSync(
  resolve(process.cwd(), 'src/bootstrap/ui-bootstrap.ts'),
  'utf8',
);
const browserBootstrapSource = readFileSync(
  resolve(process.cwd(), 'public/js/ui-bootstrap-runtime.js'),
  'utf8',
);

describe('API Traffic developer viewer', () => {
  it('hosts CTX Viewer and API Traffic as tabs of one dock and remembers the active tab', () => {
    expect(navSource).toContain('id="toggleDebugPanel"');
    expect(navSource).toContain('aria-controls="developerToolsDock"');
    expect(navSource).toContain('Show/hide Developer tools');
    expect(navSource).not.toContain('toggleApiTrafficPanel');
    expect(shellViewSource).toContain("include('../components/debugging/developer-tools')");
    expect(developerToolsViewSource).toContain("include('ctx-debug')");
    expect(developerToolsViewSource).toContain("include('api-traffic')");
    expect(developerToolsViewSource).toContain('data-developer-tool-tab="ctx"');
    expect(developerToolsViewSource).toContain('data-developer-tool-tab="apiTraffic"');
    expect(developerToolsViewSource).toContain('class="developer-tools-tab-caption">CTX VIEWER');
    expect(developerToolsViewSource).toContain('class="developer-tools-tab-caption">API TRAFFIC');
    expect(sourceWithoutWhitespace(debuggerCssSource)).toContain(
      sourceWithoutWhitespace('.developer-tools-tab-caption { color: #172b4d; font-weight: 400; }'),
    );
    expect(sourceWithoutWhitespace(debuggerCssSource)).toContain(
      sourceWithoutWhitespace(
        '.developer-tools-tab.is-active .developer-tools-tab-caption { color: #0d6efd; font-weight: 700; }',
      ),
    );
    expect(shellSource).toContain("DEVELOPER_TOOL_TAB_STORAGE_KEY = 'manatos.debug.activeTab.v1'");
    expect(shellSource).toContain('setDeveloperToolTab(tab, persist = true)');
    expect(shellSource).toContain('toggleDeveloperTools()');
    expect(shellSource).not.toContain('toggleApiTrafficPanelButton');
    expect(shellSource).toContain("this.setDeveloperToolsVisible(true, 'apiTraffic', persist)");
    expect(shellSource).not.toContain("appShell.classList.add('has-api-traffic')");
    expect(layoutSource).toContain('grid-area: debug;');
    expect(viewerViewSource).toContain('apiTrafficFilter');
  });

  it('provides live filtering, pause, clear, errors-only and request details', () => {
    expect(viewerSource).toContain("'/bo/debug/api-traffic/clear'");
    expect(viewerSource).toContain('state.errorsOnly');
    expect(viewerSource).toContain('state.paused');
    expect(viewerSource).toContain('renderDetails');
    expect(viewerSource).toContain('state.renderedDetailKey === detailKey');
    expect(viewerSource).toContain('Polling must never rebuild its DOM');
    expect(viewerSource).toContain('setInterval');
    expect(viewerSource).toContain('hiddenRoutes');
    expect(viewerSource).toContain('ignoreRouteSelections');
    expect(viewerSource).toContain(
      '!state.ignoreRouteSelections && state.hiddenRoutes.has(routeKey(entry))',
    );
    expect(viewerSource).toContain('refreshIgnoreRoutesButton');
    expect(viewerSource).toContain('routeKey');
    expect(viewerSource).toContain('routeCounts');
    expect(viewerSource).toContain('ROUTE_COUNT_STATE_KEY');
    expect(viewerSource).toContain('countTraffic(incoming)');
    expect(sourceWithoutWhitespace(viewerSource)).toContain(
      sourceWithoutWhitespace('sessionStorage.setItem(ROUTE_COUNT_STATE_KEY'),
    );
    expect(viewerSource).not.toContain('counterStartedAt');
    expect(viewerSource).toContain('ROUTE_CATALOG_KEY');
    expect(viewerSource).toContain("separator.className = 'api-traffic-route-separator'");
    expect(viewerSource).toContain("pathPart.className = 'api-traffic-route-path'");
    expect(viewerSource).toContain('selectedId');
    expect(viewerSource).toContain('STATE_KEY');
    expect(viewerSource).toContain('[...entries].reverse()');
    expect(viewerSource).toContain('compactPath');
    expect(viewerSource).toContain('resourcePathHtml');
    expect(viewerSource).toContain('<strong>${escapeHtml(match[2])}</strong>');
    expect(viewerSource).toContain('state.pollingSuspended');
    expect(viewerViewSource).toContain('apiTrafficRequestTab');
    expect(viewerViewSource).toContain('apiTrafficResponseTab');
    expect(viewerViewSource).toContain('apiTrafficFilter');
    expect(viewerViewSource).toContain('apiTrafficRoutes');
    expect(viewerViewSource).toContain('apiTrafficIgnoreRoutes');
    expect(viewerViewSource).toContain('placeholder="Search traffic"');
    expect(viewerViewSource.indexOf('apiTrafficDetails')).toBeLessThan(
      viewerViewSource.indexOf('apiTrafficList'),
    );
    expect(viewerViewSource).toContain('apiTrafficDetails');
  });

  it('persists route visibility locally and keeps polling/column infrastructure singleton-safe', () => {
    expect(viewerSource).toContain('localStorage.setItem(ROUTE_STATE_KEY');
    expect(viewerSource).toContain('localStorage.setItem(ROUTE_CATALOG_KEY');
    expect(viewerSource).not.toContain('localStorage.setItem(ROUTE_COUNT_STATE_KEY');
    expect(viewerSource).toContain('countedEntryIds');
    expect(viewerSource).toContain('Route counters are');
    expect(viewerSource).not.toContain('state.routeCounts.clear()');
    expect(viewerSource).toContain('window.__manatosApiTrafficRuntime?.dispose?.()');
    expect(viewerSource).toContain("window.addEventListener('online', resumePolling)");
    expect(viewerSource).not.toContain("document.addEventListener('pointerdown', resumePolling");
    expect(viewerSource).toContain('data-api-traffic-column-resize');
    expect(viewerViewSource).toContain('apiTrafficColumns');
    expect(debuggerCssSource).toContain('.api-traffic-route-count.is-active');
    expect(debuggerCssSource).toContain('.api-traffic-route-path');
  });

  it('keeps selected detail inspection stable while traffic continues and uses health for routine bootstrap monitoring', () => {
    expect(viewerSource).toContain('if (!force && state.renderedDetailKey === detailKey) return;');
    expect(viewerSource).toContain('Polling must never rebuild its DOM');
    expect(appSource).toContain("app.get('/runtime/health'");
    expect(browserBootstrapSource).toContain("fetch('/runtime/health'");
    expect(bootstrapSource).toContain("apiClient.get<ApiHealthState>('/health')");
    expect(bootstrapSource).toContain('heartbeatCount % 10 === 0');
    expect(bootstrapSource).toContain('bootstrapRefreshInFlight');
  });

  it('polls through a lightweight diagnostic route before page-context hydration', () => {
    const debugRoute = appSource.indexOf("app.use('/bo/debug', createDebugRoutes())");
    const pageContext = appSource.indexOf('app.use(pageContextMiddleware)');
    expect(debugRoute).toBeGreaterThan(-1);
    expect(pageContext).toBeGreaterThan(debugRoute);
  });
});

import { sanitizeTrafficValue } from '../src/debug/api-traffic-store.js';

describe('API Traffic sanitization', () => {
  it('redacts secrets before developer traces are stored', () => {
    expect(
      sanitizeTrafficValue({
        authorization: 'Bearer abc',
        password: 'secret',
        nested: { accessToken: 'abc', safe: 'visible' },
      }),
    ).toEqual({
      authorization: '[REDACTED]',
      password: '[REDACTED]',
      nested: { accessToken: '[REDACTED]', safe: 'visible' },
    });
  });

  it('uses one outer dock resize handle and no CTX/API peer divider', () => {
    expect(developerToolsViewSource).toContain('id="ctxDebugPanelResize"');
    expect(viewerViewSource).not.toContain('apiTrafficPanelResize');
    expect(viewerSource).not.toContain('manatos.debug.apiTraffic.split');
    expect(shellSource).toContain(
      "document.addEventListener('pointermove', onDeveloperDockResizeMove",
    );
    expect(shellSource).toContain("document.body.classList.add('is-resizing-developer-dock')");
    expect(shellSource).toContain('DEVELOPER_DOCK_WIDTH_KEY');
    expect(debuggerCssSource).toContain('left: -5px;');
    expect(debuggerCssSource).toContain('width: 10px;');
    expect(debuggerCssSource).toContain('touch-action: none;');
  });

  it('keeps tab contents inside the original single-debugger height contract', () => {
    expect(layoutSource).toContain('.developer-tools-dock {');
    expect(layoutSource).toContain('max-height: calc(100vh - var(--top-header-height, 0px));');
    expect(layoutSource).toContain('position: sticky;');
    expect(debuggerCssSource).toContain('.developer-tools-body > .debug-panel');
    expect(debuggerCssSource).toContain('.developer-tools-body > .api-traffic-panel');
    expect(debuggerCssSource).toContain('height: 100%;');
    expect(layoutSource).not.toContain('has-developer-tools.has-debug.has-api-traffic');
  });
});
