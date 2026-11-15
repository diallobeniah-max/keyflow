import { app, BrowserWindow } from 'electron';
import { resolve } from 'node:path';

app.setPath('userData', resolve(process.argv[2]));
(async () => {
  try {
    await app.whenReady();
    const win = new BrowserWindow({show:false});
    await win.loadFile(resolve('dist/index.html'));
    for (let i=0;i<100;i++) {
      if (await win.webContents.executeJavaScript(`!![...document.querySelectorAll('button')].find(b=>b.textContent.includes('Skip intro'))`)) break;
      await new Promise(r=>setTimeout(r,50));
    }
    await win.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Skip intro')).click()`);
    await new Promise(r=>setTimeout(r,100));
    await win.webContents.executeJavaScript(`(() => {
      const data=JSON.parse(localStorage.getItem('keyflow:state'));
      data.shortcuts=[];
      data.settings.shortcuts.clipboardShortcutEnabled=false;
      data.settings.shortcuts.altCapsLockBypass=false;
      data.settings.shortcuts.hyperKeyEnabled=false;
      data.settings.shortcuts.hyperKeyConfig.enabled=false;
      data.settings.wasdNavigation.toggleWithMouseChord=false;
      data.settings.smoothScroll.enabled=false;
      data.settings.general.minimizeToTray=false;
      data.settings.quickPreview.enabled=true;
      data.settings.quickPreview.shortcut='Space';
      data.settings.quickPreview.shortcutVersion=1;
      data.settings.privacy.safeMode=false;
      data.onboardingDone=true;
      localStorage.setItem('keyflow:state', JSON.stringify(data));
    })()`);
    await win.webContents.session.flushStorageData();
    win.destroy(); app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
})().catch(error => { console.error(error); app.exit(1); });
