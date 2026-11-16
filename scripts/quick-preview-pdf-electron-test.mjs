import { app, BrowserWindow, protocol } from 'electron';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
app.on('window-all-closed',e=>e.preventDefault());
protocol.registerSchemesAsPrivileged([{scheme:'keyflow-preview',privileges:{standard:true,secure:true,stream:true,supportFetchAPI:true,corsEnabled:true}}]);
(async()=>{
 const dir=await mkdtemp(join(tmpdir(),'keyflow-pdf-ui-'));app.setPath('userData',join(dir,'profile'));
 const timer=setTimeout(()=>{console.error('PDF test timed out');app.exit(1)},30000);let manager;
 try {
  await app.whenReady();const {QuickPreviewWindowManager}=await import('../dist-electron/quick-preview-window.js');
  manager=new QuickPreviewWindowManager(true);manager.warm();const win=BrowserWindow.getAllWindows()[0];
  win.webContents.on('console-message',(_event,_level,message)=>console.log('renderer:',message));
  win.setPosition(-10000,-10000);win.setFocusable(false);manager.showAndCenter=w=>w.showInactive();
  assert.equal(await manager.openPreview(resolve(process.argv[2])),true);
  const waitFor=async expression=>{const end=Date.now()+12000;while(Date.now()<end){if(await win.webContents.executeJavaScript(expression))return;await new Promise(r=>setTimeout(r,50));}throw Error(`Condition not reached: ${expression}; text=${await win.webContents.executeJavaScript('document.body.innerText')}`)};
  await waitFor(`document.body.innerText.includes('1 / 3')`);
  await waitFor(`document.querySelector('.qpo-pdf-scroll canvas')?.width > 0`);
  await win.webContents.executeJavaScript(`document.querySelector('[aria-label="Page 2"]').click()`);
  await waitFor(`document.body.innerText.includes('2 / 3')`);
  await win.webContents.executeJavaScript(`document.querySelector('[aria-label="Zoom in"]').click()`);
  await waitFor(`document.body.innerText.includes('125%')`);
  await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Fit to width').click()`);
  await waitFor(`document.body.innerText.includes('Fit width')`);
  await win.webContents.executeJavaScript(`document.querySelector('[aria-label="Hide page thumbnails"]').click()`);
  assert.equal(await win.webContents.executeJavaScript(`!!document.querySelector('.qpo-pdf-sidebar')`),false);
  const screenshot=await win.webContents.capturePage();await import('node:fs/promises').then(fs=>fs.writeFile(resolve('artifacts/quick-preview-pdf-redesign-check.png'),screenshot.toPNG()));
  console.log('PASS: PDF page selection, zoom, fit, and sidebar toggle');
  clearTimeout(timer);manager.destroy();await rm(dir,{recursive:true,force:true}).catch(()=>{});app.exit(0);
 }catch(e){console.error(e);clearTimeout(timer);manager?.destroy();await rm(dir,{recursive:true,force:true}).catch(()=>{});app.exit(1)}
})().catch(e=>{console.error(e);app.exit(1)});
