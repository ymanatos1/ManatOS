import { createUiApp } from './app.js';
import { loadEjs1Config } from './config.js';

const config = loadEjs1Config();

createUiApp(config).listen(config.uiPort, () => {
  console.log(`ManatOS UI.EJS1: ${config.publicBaseUrl}`);
  console.log(`API: ${config.apiBaseUrl}`);
});
