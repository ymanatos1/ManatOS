/*
 * ManatOS NG1 public runtime configuration.
 *
 * This file is loaded by the browser before Angular starts and may be replaced
 * per deployment without rebuilding the NG1 application artifact.
 *
 * IMPORTANT: EVERYTHING in this file is public and visible to every browser.
 * Never put INTERNAL_API_KEY, passwords, client secrets, encryption keys,
 * session secrets, or any other confidential value here.
 */
globalThis.manatosConfig = Object.freeze({
  /*
   * ManatOS API origin used directly by the browser.
   *
   * Development: http://localhost:3000
   * Production:  https://api.manatos.info
   *
   * Because NG1 calls the API directly, this origin must be permitted by the
   * API CORS policy for the browser origin from which NG1 is being served.
   */
  apiBaseUrl: 'http://localhost:3000',
});
