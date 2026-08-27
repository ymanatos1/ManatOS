import { config } from './config.js';
import { createUiApp } from './app.js';
import { startUiBootstrapRefresh } from './bootstrap/ui-bootstrap.js';

createUiApp().listen(config.UI_PORT, () => {
  console.log(`ManatOS UI: http://localhost:${config.UI_PORT}`);
  console.log(`API: ${config.API_BASE_URL}`);

  /**
   * Bootstrap refresh starts only after the UI is already listening, so API
   * availability is never a UI startup dependency. It then retries
   * periodically and automatically discovers an API that starts or recovers
   * later.
   */
  startUiBootstrapRefresh();
});
