// Run KeyFlow's real main process with an isolated profile and no visible
// windows or persistent Windows startup changes. The parent owns the timeout.
const { app, BrowserWindow } = require('electron');
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const appPath = process.env.KEYFLOW_TEST_APP_ASAR ? resolve(process.env.KEYFLOW_TEST_APP_ASAR) : resolve('.');
app.setPath('userData', resolve(process.argv[2]));
app.getAppPath = () => appPath;
app.setLoginItemSettings = () => {};
BrowserWindow.prototype.show = function () {};
BrowserWindow.prototype.showInactive = function () {};
BrowserWindow.prototype.focus = function () {};
let exitCode = 0;
const timeout = setTimeout(() => { console.error('Timed out waiting for real app readiness'); exitCode = 1; app.quit(); }, 30000);
app.on('browser-window-created', (_event, win) => {
  win.webContents.once('did-finish-load', async () => {
    if (!win.webContents.getURL().includes('dist/index.html')) return;
    try {
      for (let i=0;i<120;i++) {
        const status = await win.webContents.executeJavaScript(`window.electronAPI?.quickPreview?.getStatus()`);
        if (status === 'ready') {
          const valid = await win.webContents.executeJavaScript(`window.electronAPI.quickPreview.validateBinding('Space', 'Ctrl+Shift+K', [])`);
          if (!valid) throw new Error('Real app rejected Space binding');
          const conflict = await win.webContents.executeJavaScript(`window.electronAPI.quickPreview.validateBinding('Space', 'Ctrl+Shift+K', ['Space'])`);
          if (conflict) throw new Error('Real app accepted a conflicting binding');
          const accepted = await win.webContents.executeJavaScript(`window.electronAPI.quickPreview.configure({enabled:true,paused:false,shortcut:'Space',closeWithEscape:true,emergencyShortcut:'Ctrl+Shift+K',activeShortcuts:['Space']})`);
          if (accepted) throw new Error('Real app enabled a conflicting binding');
          const blocked = await win.webContents.executeJavaScript(`window.electronAPI.quickPreview.getStatus()`);
          if (blocked === 'ready') throw new Error('Conflicting binding reported ready');
          await win.webContents.executeJavaScript(`window.electronAPI.quickPreview.configure({enabled:true,paused:false,shortcut:'Space',closeWithEscape:true,emergencyShortcut:'Ctrl+Shift+K',activeShortcuts:[]})`);
          for (let j=0;j<40;j++) {
            if (await win.webContents.executeJavaScript(`window.electronAPI.quickPreview.getStatus()`) === 'ready') break;
            if (j === 39) throw new Error('Preview did not recover after conflict was removed');
            await new Promise(r=>setTimeout(r,50));
          }
          console.log('PASS: real app settings initialized the native preview helper');
          console.log('PASS: real app rejects shortcut conflicts and recovers when resolved');
          clearTimeout(timeout); app.quit(); return;
        }
        await new Promise(r=>setTimeout(r,100));
      }
      throw new Error('Real app did not report preview ready');
    } catch (error) { console.error(error); clearTimeout(timeout); exitCode = 1; app.quit(); }
  });
});
import(pathToFileURL(resolve(appPath, 'dist-electron/main.js')).href).then(() => {
  // Register after KeyFlow's own cleanup handlers so a failing test still
  // shuts down its native helper and workers before returning a failure code.
  app.on('will-quit', () => { if (exitCode) app.exit(exitCode); });
}).catch(error => { console.error(error); clearTimeout(timeout); app.exit(1); });
