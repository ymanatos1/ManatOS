import { createNg1HostApp } from './app.js';

import { loadNg1HostConfig } from './config.js';

const config = loadNg1HostConfig();

createNg1HostApp(config).listen(config.uiPort, () => {
  console.log(`ManatOS UI.NG1 resource host: http://localhost:${config.uiPort}`);
});
