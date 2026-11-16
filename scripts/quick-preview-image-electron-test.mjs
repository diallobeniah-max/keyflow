import { app, BrowserWindow, protocol } from 'electron';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
app.on('window-all-closed',e=>e.preventDefault());
protocol.registerSchemesAsPrivileged([{scheme:'keyflow-preview',privileges:{standard:true,secure:true,stream:true,supportFetchAPI:true,corsEnabled:true}}]);
(async()=>{
 const dir=await mkdtemp(join(tmpdir(),'keyflow-image-ui-'));app.setPath('userData',join(dir,'profile'));
 const timer=setTimeout(()=>{console.error('Image test timed out');app.exit(1)},30000);let manager;
 try {
  await app.whenReady();const {QuickPreviewWindowManager}=await import('../dist-electron/quick-preview-window.js');
  manager=new QuickPreviewWindowManager(true);manager.warm();const win=BrowserWindow.getAllWindows()[0];
  win.webContents.setBackgroundThrottling(false);
  win.setPosition(-10000,-10000);win.setFocusable(false);manager.showAndCenter=w=>w.showInactive();
  assert.equal(await manager.openPreview(resolve(process.argv[2])),true);
  const waitFor=async expression=>{const end=Date.now()+10000;while(Date.now()<end){if(await win.webContents.executeJavaScript(expression))return;await new Promise(r=>setTimeout(r,50));}throw Error(`Condition not reached: ${expression}`)};
  await waitFor(`document.querySelector('.qpo-image')?.naturalWidth > 0`);
  await win.webContents.executeJavaScript(`document.querySelector('[aria-label="Zoom in"]').click()`);
  await waitFor(`document.querySelector('.qpo-zoom-label')?.textContent==='125%'`);
  await win.webContents.executeJavaScript(`document.querySelector('[aria-label="Rotate right"]').click()`);
  await waitFor(`document.querySelector('.qpo-image-inner')?.style.transform.includes('90deg')`);
  await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Fit').click()`);
  await waitFor(`document.querySelector('.qpo-zoom-label')?.textContent==='100%'`);
  await new Promise(r=>setTimeout(r,800));
  const screenshot=await win.webContents.capturePage();await writeFile(resolve('artifacts/quick-preview-image-redesign-check.png'),screenshot.toPNG());
  console.log('PASS: image load, zoom, rotation, and fit');clearTimeout(timer);manager.destroy();await rm(dir,{recursive:true,force:true}).catch(()=>{});app.exit(0);
 }catch(e){console.error(e);clearTimeout(timer);manager?.destroy();await rm(dir,{recursive:true,force:true}).catch(()=>{});app.exit(1)}
})().catch(e=>{console.error(e);app.exit(1)});
