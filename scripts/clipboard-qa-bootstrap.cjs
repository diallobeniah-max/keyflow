// Isolate all history, settings and logs from the user's profile during QA.
const { app } = require('electron');
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
if (!process.env.KEYFLOW_QA_DATA_DIR) throw new Error('KEYFLOW_QA_DATA_DIR is required');
app.setPath('userData', process.env.KEYFLOW_QA_DATA_DIR);
(async () => {
  globalThis.__qaEngine = (await import(pathToFileURL(resolve('dist-electron/clipboard-engine.js')).href)).clipboardEngine;
  globalThis.__qaFiles = await import(pathToFileURL(resolve('dist-electron/clipboard-files.js')).href);
  await import(pathToFileURL(resolve('dist-electron/main.js')).href);
})();
