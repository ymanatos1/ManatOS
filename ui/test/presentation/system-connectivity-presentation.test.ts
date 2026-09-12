import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const source = (path: string) => readFile(resolve(testDirectory, '..', '..', path), 'utf8');

describe('system connectivity watchdog', () => {
  it('fails over locally after three transport failures and stops background polling', async () => {
    const watchdog = await source('public/js/shell/system-connectivity.js');
    const bootstrap = await source('public/js/runtime/bootstrap-runtime.js');
    const traffic = await source('public/js/debugger/api-traffic.js');
    const shell = await source('views/layout/shell.ejs');

    expect(watchdog).toContain('const FAILURE_THRESHOLD = 3');
    expect(watchdog).toContain('ManatOS system unavailable');
    expect(watchdog).toContain('automatic polling has been stopped');
    expect(watchdog).toContain('data-system-retry');
    expect(watchdog).toContain("fetch('/runtime/health'");
    expect(watchdog).toContain('workspaceRecovery?.markUnavailableAndDispose?.()');
    expect(watchdog).toContain("await fetch('/auth/logout'");
    expect(watchdog).toContain("location.assign('/?auth=signin')");
    expect(watchdog).not.toContain('data-system-sign-in');
    expect(watchdog).not.toContain('signInAndRecover');
    expect(watchdog).toContain('manatos:system-unavailable');
    expect(watchdog).toContain('dismissTransientUi();');
    expect(watchdog).toContain('manatos:dismiss-transient-ui');
    expect(watchdog).toContain('[data-manatos-transient-ui]');
    expect(watchdog).toContain('document.querySelectorAll(\'[data-bs-toggle="dropdown"]\')');
    expect(watchdog).toContain('bootstrapApi.Dropdown.getInstance(toggle)?.hide()');
    expect(shell.indexOf('/js/runtime/workspace-recovery.js')).toBeLessThan(
      shell.indexOf('/js/shell/system-connectivity.js'),
    );
    expect(shell.indexOf('/js/shell/system-connectivity.js')).toBeLessThan(
      shell.indexOf('/js/runtime/bootstrap-runtime.js'),
    );

    expect(bootstrap).toContain("reportFailure?.('ui-bootstrap')");
    expect(bootstrap).toContain("reportSuccess?.('ui-bootstrap')");
    expect(bootstrap).toContain("reportFailure?.('ui-health')");
    expect(bootstrap).toContain("reportSuccess?.('ui-health')");
    expect(bootstrap).toContain("fetch('/runtime/health'");
    expect(bootstrap).toContain("window.addEventListener('manatos:system-unavailable'");

    expect(traffic).toContain("reportFailure?.('api-traffic')");
    expect(traffic).toContain("reportSuccess?.('api-traffic')");
    expect(traffic).toContain("window.addEventListener('manatos:system-unavailable'");
    expect(traffic).toContain('window.clearInterval(pollTimer)');
    expect(traffic).toContain('state.pollInFlight');
    expect(traffic).toContain('window.ManatOS?.connectivity?.unavailable === true');
    expect(traffic).toContain('state.pollInFlight = true');
    expect(traffic).toContain('state.pollInFlight = false');
  });

  it('counts transport rejection only, not an HTTP error response, as connectivity failure', async () => {
    const bootstrap = await source('public/js/runtime/bootstrap-runtime.js');
    const traffic = await source('public/js/debugger/api-traffic.js');

    const bootstrapFetch = bootstrap.indexOf('const fetchBootstrap = async () =>');
    const bootstrapSuccess = bootstrap.indexOf("reportSuccess?.('ui-bootstrap')", bootstrapFetch);
    const bootstrapErrorCheck = bootstrap.indexOf('if (!response.ok)', bootstrapFetch);
    expect(bootstrapFetch).toBeGreaterThan(-1);
    expect(bootstrapSuccess).toBeGreaterThan(bootstrapFetch);
    expect(bootstrapSuccess).toBeLessThan(bootstrapErrorCheck);
    const healthSuccess = bootstrap.indexOf("reportSuccess?.('ui-health')");
    const healthErrorCheck = bootstrap.indexOf('if (!response.ok)', healthSuccess);
    expect(healthSuccess).toBeGreaterThan(-1);
    expect(healthSuccess).toBeLessThan(healthErrorCheck);
    expect(traffic.indexOf("reportSuccess?.('api-traffic')")).toBeLessThan(
      traffic.indexOf('if (!response.ok)'),
    );
  });
});
