import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const source = (path: string) => readFile(resolve(testDirectory, '..', path), 'utf8');

describe('system connectivity watchdog', () => {
  it('fails over locally after three transport failures and stops background polling', async () => {
    const watchdog = await source('public/js/system-connectivity.js');
    const bootstrap = await source('public/js/ui-bootstrap-runtime.js');
    const traffic = await source('public/js/debugger/api-traffic.js');
    const shell = await source('views/layout/shell.ejs');

    expect(watchdog).toContain('const FAILURE_THRESHOLD = 3');
    expect(watchdog).toContain('ManatOS system unavailable');
    expect(watchdog).toContain('Automatic polling has been stopped');
    expect(watchdog).toContain("target.closest('a[href]')");
    expect(watchdog).toContain('manatos:system-unavailable');
    expect(watchdog).toContain('dismissTransientUi();');
    expect(watchdog).toContain('manatos:dismiss-transient-ui');
    expect(watchdog).toContain('[data-manatos-transient-ui]');
    expect(watchdog).toContain('document.querySelectorAll(\'[data-bs-toggle="dropdown"]\')');
    expect(watchdog).toContain('bootstrapApi.Dropdown.getInstance(toggle)?.hide()');
    expect(shell.indexOf('/js/system-connectivity.js')).toBeLessThan(
      shell.indexOf('/js/ui-bootstrap-runtime.js'),
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
    expect(traffic).toContain('window.ManatOSConnectivity?.unavailable === true');
    expect(traffic).toContain('state.pollInFlight = true');
    expect(traffic).toContain('state.pollInFlight = false');
  });

  it('counts transport rejection only, not an HTTP error response, as connectivity failure', async () => {
    const bootstrap = await source('public/js/ui-bootstrap-runtime.js');
    const traffic = await source('public/js/debugger/api-traffic.js');

    expect(bootstrap.indexOf("reportSuccess?.('ui-bootstrap')")).toBeLessThan(
      bootstrap.indexOf('if (!response.ok)'),
    );
    const healthSuccess = bootstrap.indexOf("reportSuccess?.('ui-health')");
    const healthErrorCheck = bootstrap.indexOf('if (!response.ok)', healthSuccess);
    expect(healthSuccess).toBeGreaterThan(-1);
    expect(healthSuccess).toBeLessThan(healthErrorCheck);
    expect(traffic.indexOf("reportSuccess?.('api-traffic')")).toBeLessThan(
      traffic.indexOf('if (!response.ok)'),
    );
  });
});
