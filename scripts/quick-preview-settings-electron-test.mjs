import { app, BrowserWindow, ipcMain } from 'electron';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { conflictsWithActiveShortcuts, conflictsWithEmergencyShortcut, parseQuickPreviewBinding } from '../dist-electron/quick-preview-binding.js';

const dir = mkdtempSync(join(tmpdir(), 'keyflow-settings-test-'));
app.setPath('userData', dir);
const timer = setTimeout(() => app.exit(1), 45000);
let win;
let previewConfig;
let previewHealth = 'ready';
(async () => {
  try {
    await app.whenReady();
    const channels = ['input:update-shortcuts','input:set-drag-switcher','hot-corners:configure','screen-tint:update','dim-screen:update','media-player:update','app:set-login-item-settings','app:update-tray','app:update-icon','backup:update-state','backup:set-config','popup:update-data','input:set-paused','input:get-suppression','navigation:get-state','window:set-titlebar-theme','input:set-smooth-scroll','native:get-active-app','navigation:set-feedback-config','navigation:set-mouse-chord','clipboard:get-history','clipboard:get-stats','notes:get-preferences','action:run','system:get-windows-conflicts','input:get-touchpad-status','dim-screen:get-state','media-player:get-state','backup:get-config','window:close','window:minimize','window:maximize'];
    for (const channel of channels) ipcMain.handle(channel, () => ({ok:true}));
    ipcMain.handle('quick-preview:configure', (_e, config) => {previewConfig = config; return true;});
    ipcMain.handle('quick-preview:get-status', () => previewHealth);
    ipcMain.handle('native:get-status', () => ({backend:'native',engineStatus:'ready'}));
    ipcMain.handle('quick-preview:validate-binding', (_e, value, emergency, active) => { const binding = parseQuickPreviewBinding(value); return !!binding && !conflictsWithEmergencyShortcut(binding, emergency) && !conflictsWithActiveShortcuts(binding, active); });
    win = new BrowserWindow({show:false,webPreferences:{preload:resolve('dist-electron/preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,offscreen:!!process.env.KEYFLOW_SETTINGS_SCREENSHOT}});
    win.webContents.on('console-message', (_event, _level, message) => { if (/error|Error|TypeError/.test(message)) console.log('Renderer:', message); });
    await win.loadFile(resolve('dist/index.html'));
    await new Promise(r => setTimeout(r, 1000));
    const run = code => win.webContents.executeJavaScript(code);
    const wait = async code => {
      for (let i=0;i<100;i++) { if (await run(code)) return; await new Promise(r => setTimeout(r,50)); }
      console.log('Renderer text on timeout:', (await run('document.body.innerText')).slice(0,1500));
      throw new Error(`Timed out: ${code}`);
    };
    const skip = await run(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Skip intro'))?.click(); true`);
    assert.ok(skip);
    await wait(`!![...document.querySelectorAll('.nav-item')].find(e=>e.textContent.includes('Quick Preview'))`);
    await run(`[...document.querySelectorAll('.nav-item')].find(e=>e.textContent.includes('Quick Preview')).click()`);
    await wait(`document.querySelector('.qp-page-header h1')?.textContent === 'Quick Preview'`);
    if (process.env.KEYFLOW_SETTINGS_SCREENSHOT) {
      await new Promise(r => setTimeout(r, 1500));
      writeFileSync(process.env.KEYFLOW_SETTINGS_SCREENSHOT, (await win.webContents.capturePage()).toPNG());
    }
    assert.equal(await run(`document.querySelector('.qp-kbd-display').textContent`), 'Space');
    await run(`document.querySelector('#qp-row-enable button[role="switch"]').click()`);
    await wait(`document.querySelector('#qp-row-enable button[role="switch"]').getAttribute('aria-checked') === 'true'`);
    await wait(`document.querySelector('.qp-status-badge')?.textContent === 'Active'`);
    for (let i=0; i<40 && !previewConfig?.enabled; i++) await new Promise(r=>setTimeout(r,25));
    assert.equal(previewConfig?.enabled, true);
    assert.equal(previewConfig?.paused, false, 'the emergency shortcut string must not pause Quick Preview');
    assert.equal(previewConfig?.emergencyShortcut, 'Ctrl+Shift+K');
    previewHealth = 'unavailable';
    await wait(`document.querySelector('.qp-status-badge')?.textContent === 'Unavailable'`);
    previewHealth = 'ready';
    await wait(`document.querySelector('.qp-status-badge')?.textContent === 'Active'`);
    await run(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Change').click()`);
    await run(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Browse')).click()`);
    await wait(`!!document.querySelector('button[title="Select F8"]')`);
    await run(`document.querySelector('button[title="Select F8"]').click()`);
    await run(`document.querySelector('button[aria-label="Ctrl modifier"]').click()`);
    await run(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Save').click()`);
    await wait(`document.querySelector('.qp-kbd-display')?.textContent === 'Ctrl+F8'`);
    await run(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Change').click()`);
    await wait(`!!document.querySelector('button[aria-label="Ctrl modifier"][aria-pressed="true"]')`);
    await win.reload();
    await wait(`!![...document.querySelectorAll('.nav-item')].find(e=>e.textContent.includes('Quick Preview'))`);
    await run(`[...document.querySelectorAll('.nav-item')].find(e=>e.textContent.includes('Quick Preview')).click()`);
    await wait(`document.querySelector('.qp-kbd-display')?.textContent === 'Ctrl+F8'`);
    assert.equal(await run(`document.querySelector('#qp-row-enable button[role="switch"]').getAttribute('aria-checked')`), 'true');
    await run(`(() => { const d=JSON.parse(localStorage.getItem('keyflow:state')); d.shortcuts.push({...d.shortcuts[0],id:'preview-conflict-test',profileId:d.settings.general.defaultProfileId,key:'F8',modifiers:['Ctrl'],enabled:true,mouse:false}); localStorage.setItem('keyflow:state',JSON.stringify(d)); })()`);
    await win.reload();
    await wait(`!![...document.querySelectorAll('.nav-item')].find(e=>e.textContent.includes('Quick Preview'))`);
    await run(`[...document.querySelectorAll('.nav-item')].find(e=>e.textContent.includes('Quick Preview')).click()`);
    await wait(`document.querySelector('.qp-status-badge')?.textContent === 'Shortcut unavailable'`);
    await run(`(() => { const d=JSON.parse(localStorage.getItem('keyflow:state')); d.shortcuts.find(s=>s.id==='preview-conflict-test').appScope={scopeType:'executable',executablePath:'C:\\Apps\\Photoshop.exe'}; localStorage.setItem('keyflow:state',JSON.stringify(d)); })()`);
    await win.reload();
    await wait(`!![...document.querySelectorAll('.nav-item')].find(e=>e.textContent.includes('Quick Preview'))`);
    await run(`[...document.querySelectorAll('.nav-item')].find(e=>e.textContent.includes('Quick Preview')).click()`);
    await wait(`document.querySelector('.qp-status-badge')?.textContent === 'Active'`);
    console.log('PASS: change, validate, save, reopen, and persist Ctrl+F8 binding');
    console.log('PASS: global conflicts are shown; another app’s scoped shortcut remains usable');
    clearTimeout(timer); win.destroy(); try { rmSync(dir,{recursive:true,force:true}); } catch {} app.exit(0);
  } catch (error) {
    console.error(error); clearTimeout(timer); win?.destroy(); try { rmSync(dir,{recursive:true,force:true}); } catch {} app.exit(1);
  }
})().catch(error => { console.error(error); app.exit(1); });
