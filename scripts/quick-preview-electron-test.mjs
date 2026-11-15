import { app, BrowserWindow, ipcMain } from 'electron';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

(async () => {
const dir = await mkdtemp(join(tmpdir(), 'keyflow-preview-fixture-'));
app.setPath('userData', join(dir, 'profile'));
const timeout = setTimeout(() => { console.error('Quick Preview fixture timed out'); app.exit(1); }, 30000);
let manager;
try {
  console.log('Starting isolated Electron preview fixture');
  await app.whenReady();
  console.log('Electron ready');
  let inputConfigs = 0;
  ipcMain.handle('input:update-shortcuts', () => { inputConfigs++; });
  const { QuickPreviewWindowManager } = await import('../dist-electron/quick-preview-window.js');
  const first = join(dir, 'first.txt');
  const second = join(dir, 'second.txt');
  await writeFile(first, 'First fixture contents');
  await writeFile(second, 'Second fixture contents');
  manager = new QuickPreviewWindowManager(false);
  ipcMain.handle('quick-preview:close', () => { manager.closePreview(); return true; });
  console.log('Opening first fixture');
  assert.equal(await manager.openPreview(first), true);
  const win = BrowserWindow.getAllWindows()[0];
  assert.ok(win?.isVisible());
  const waitFor = async (expected) => {
    for (let i = 0; i < 100; i++) {
      const content = await win.webContents.executeJavaScript('document.body.innerText');
      if (content.includes(expected)) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`Preview did not show: ${expected}`);
  };
  await waitFor('First fixture contents');
  assert.equal(inputConfigs, 0, 'preview renderer must not reconfigure global shortcuts');
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Space'});
  for (let i=0; i<30 && win.isVisible(); i++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(win.isVisible(), false, 'Space should close the focused preview');
  assert.equal(await manager.openPreview(first), true);
  await waitFor('First fixture contents');
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});
  for (let i=0; i<30 && win.isVisible(); i++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(win.isVisible(), false, 'Escape should close the focused preview');
  assert.equal(await manager.openPreview(first), true);
  await waitFor('First fixture contents');
  const pending = manager.openPreview(first);
  manager.closePreview();
  await pending;
  assert.equal(win.isVisible(), false, 'closing must invalidate the pending open');
  assert.equal(await manager.openPreview(second), true);
  await waitFor('Second fixture contents');
  assert.ok(!(await win.webContents.executeJavaScript('document.body.innerText')).includes('First fixture contents'));
  manager.closePreview();
  console.log('PASS: first render, Space and Escape close, stale open cancellation, and reopen');
  clearTimeout(timeout); manager.destroy(); manager.destroy();
  assert.equal(await manager.openPreview(first), false, 'destroyed manager must not reopen');
  await rm(dir, { recursive: true, force: true });
  app.exit(0);
} catch (error) {
  console.error(error); clearTimeout(timeout); manager?.destroy();
  await rm(dir, { recursive: true, force: true });
  app.exit(1);
}
})().catch(error => { console.error(error); app.exit(1); });
