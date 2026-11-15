import { app, BrowserWindow, ipcMain } from 'electron';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

// Isolated debug helper: never reads or modifies the user's KeyFlow settings.
const dir = mkdtempSync(join(tmpdir(), 'keyflow-preview-hook-'));
app.setPath('userData', join(dir, 'profile'));
process.env.KEYFLOW_INPUT_HELPER = resolve('artifacts/quick-preview-native-target/debug/keyflow-input.exe');
process.env.KEYFLOW_PREVIEW_TEST_INJECTED = '1';
let helper, monitor, controller, manager, cleanupStarted = false;
const key = process.env.KEYFLOW_TEST_SPACE === '1' ? 'Space' : 'F8';
const vk = key === 'Space' ? 0x20 : 0x77;
const timeout = setTimeout(() => cleanup(1, 'Timed out waiting for preview'), 45000);

function cleanup(code, message) {
  if (cleanupStarted) return;
  cleanupStarted = true;
  clearTimeout(timeout);
  console.log(message);
  monitor?.destroy(); controller?.destroy(); manager?.destroy(); helper?.shutdown();
  try { rmSync(dir, {recursive:true,force:true}); } catch {}
  app.exit(code);
}

app.whenReady().then(async () => {
  const { QuickPreviewWindowManager, getExplorerSelection, getExplorerSelectionSnapshot, warmExplorerSelection, disposeExplorerSelection } = await import('../dist-electron/quick-preview-window.js');
  const { QuickPreviewController } = await import('../dist-electron/quick-preview-controller.js');
  const { QuickPreviewMonitor } = await import('../dist-electron/quick-preview-monitor.js');
  const { NativeInputHelper } = await import('../dist-electron/native-input-helper.js');
  manager = new QuickPreviewWindowManager(false);
  controller = new QuickPreviewController(manager, getExplorerSelection, warmExplorerSelection, disposeExplorerSelection);
  monitor = new QuickPreviewMonitor(getExplorerSelectionSnapshot);
  ipcMain.handle('quick-preview:close', () => { controller.close(); return true; });
  helper = new NativeInputHelper(() => {}, status => {
    if (status === 'ready') {
      monitor.setPort(helper); console.log(`READY_FOR_${key.toUpperCase()}`);
      if (process.env.KEYFLOW_TEST_NO_TRIGGER === '1') setTimeout(() => cleanup(0, 'PASS: no preview trigger while editing'), 30000);
    }
    if (status === 'failed') cleanup(1, 'Native helper failed');
  });
  helper.setOnQuickPreviewRevision((revision, available) => monitor.onRevision(revision, available));
  if (process.env.KEYFLOW_TEST_HEALTH_ONLY === '1') {
    const check = setInterval(() => {
      if (monitor.getHealth() === 'ready') { clearInterval(check); cleanup(0, 'PASS: native helper reported preview observer readiness'); }
    }, 50);
    check.unref();
  }
  helper.setOnQuickPreviewTriggered(async () => {
    console.log('TRIGGER_RECEIVED');
    if (process.env.KEYFLOW_TEST_NO_TRIGGER === '1') return cleanup(1, 'Unexpected preview while editing');
    const opened = await controller.toggle();
    const win = BrowserWindow.getAllWindows().find(w => w.isVisible());
    if (!opened || !win) return cleanup(1, 'Preview failed to open');
    for (let i=0;i<80;i++) {
      const loaded = await win.webContents.executeJavaScript('!!document.querySelector(".qpo-content img, .qpo-text-content, .qpo-unsupported, .qpo-pdf-frame, .qpo-media-wrap")');
      if (loaded) return cleanup(0, 'PASS: Explorer selection, native shortcut and rendered preview');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    cleanup(1, 'Preview renderer did not display content');
  });
  controller.configure({ enabled:true, paused:false, shortcut:key, closeWithEscape:true });
  monitor.configure({ enabled:true, key:vk, modifiers:0 });
  helper.start(process.pid);
}).catch(error => { console.error(error); cleanup(1, 'Fixture failed'); });
