/** Run with Vite on :1420. Uses a disposable Electron profile, never real history. */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { _electron } = require(process.env.KEYFLOW_PLAYWRIGHT_MODULE || 'C:/Users/wonde/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = mkdtempSync(join(tmpdir(), 'keyflow-clipboard-qa-'));
const profile = join(output, 'profile'); mkdirSync(profile);
const app = await _electron.launch({
  executablePath: resolve('node_modules/electron/dist/electron.exe'),
  args: [resolve('scripts/clipboard-qa-bootstrap.cjs'), '--dev'],
  cwd: process.cwd(),
  env: { ...process.env, KEYFLOW_QA_DATA_DIR: profile, KEYFLOW_DEV_SERVER_URL: 'http://127.0.0.1:1420', KEYFLOW_OPEN_DEVTOOLS: '0' },
});
const errors = [];
const watch = (page) => page.on('pageerror', (error) => errors.push(error.message));
app.on('window', watch);
app.process().stderr.on('data', data => { for (const line of String(data).split('\n')) if (line.includes('[clipboard]') || line.includes('injectKey')) console.log(line); });
let clipboardBackedUp = false;
try {
  const page = await app.firstWindow(); watch(page);
  await page.waitForFunction(() => window.__keyflowStore?.getState().loaded);
  assert.equal(await app.evaluate(({ app }) => app.getPath('userData')), profile);
  await page.evaluate(() => {
    const store = window.__keyflowStore;
    store.getState().finishOnboarding();
    store.getState().setPage('clipboard');
  });
  await page.getByRole('heading', { name: 'Clipboard Hub', exact: true }).waitFor();
  console.log('PASS isolated profile + clipboard page');
  await app.evaluate(async ({ clipboard }) => {
    globalThis.__qaBackup = { text: clipboard.readText(), html: clipboard.readHTML(), image: clipboard.readImage() };
    globalThis.__qaBackup.files = clipboard.readBuffer('FileNameW').length ? await globalThis.__qaFiles.readClipboardFiles() : [];
    globalThis.__qaEngine.setSourceAppProvider(async () => ({ processName: 'keyflow-qa.exe' }));
  });
  clipboardBackedUp = true;
  const write = (text) => app.evaluate(({ clipboard }, text) => clipboard.writeText(text), text);
  const count = () => page.evaluate(async () => (await window.electronAPI.clipboard.getSnapshot()).items.length);
  const waitCount = async (expected) => {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if (await count() === expected) return;
      await page.waitForTimeout(100);
    }
    console.log('Capture diagnostics', await app.evaluate(({ clipboard }) => ({ kinds: globalThis.__qaEngine.snapshot().items.map(i => i.kind), settings: globalThis.__qaEngine.snapshot().settings, formats: clipboard.availableFormats(), hasImage: !clipboard.readImage().isEmpty() })));
    assert.equal(await count(), expected, 'clipboard capture count');
  };
  await write('KeyFlow QA alpha'); await waitCount(1);
  await write('{"qa":"beta","count":2}'); await waitCount(2);
  console.log('PASS real OS text + JSON capture');
  await page.getByLabel('Filter clips', { exact: true }).fill('alpha');
  await page.locator('.clipboard-detail-titles h4').filter({ hasText: 'KeyFlow QA alpha' }).waitFor();
  await page.getByLabel('Filter clips', { exact: true }).fill('no-qa-result');
  await page.waitForFunction(() => !document.querySelector('.clipboard-detail-titles h4'));
  await page.getByLabel('Filter clips', { exact: true }).fill('');
  console.log('PASS search + stale inspector cleared');
  await page.getByText('Capture & popup settings', { exact: true }).click();
  await page.getByLabel('Plain Text & Formatted Copy', { exact: true }).uncheck();
  await write('KeyFlow QA excluded'); await page.waitForTimeout(1000);
  assert.equal(await count(), 2);
  await page.getByLabel('Plain Text & Formatted Copy', { exact: true }).check();
  await page.getByText('Capture & popup settings', { exact: true }).click();
  console.log('PASS capture setting changes runtime');
  await page.evaluate(() => window.electronAPI.clipboard.show());
  let shelf = app.windows().find((p) => p.url().includes('clipboard-popup'));
  if (!shelf) { shelf = await app.waitForEvent('window'); await shelf.waitForURL('**/*window=clipboard-popup'); }
  assert.ok(shelf, 'clipboard popup exists');
  await shelf.getByRole('dialog', { name: 'KeyFlow Clipboard Shelf', exact: true }).waitFor();
  await shelf.evaluate(() => window.electronAPI.clipboard.setKeepOpen(true));
  await write('KeyFlow QA live update'); await waitCount(3);
  await shelf.locator('.clip-shelf-card-title').filter({ hasText: 'KeyFlow QA live update' }).waitFor();
  console.log('PASS popup receives live capture updates');
  await shelf.getByLabel('Search clipboard clips', { exact: true }).fill('alpha');
  await shelf.waitForFunction(() => document.querySelectorAll('.clip-shelf-card').length === 1);
  await shelf.keyboard.press('Control+Enter');
  await shelf.getByRole('status').filter({ hasText: 'Copied to clipboard' }).waitFor();
  assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), 'KeyFlow QA alpha');
  await shelf.waitForTimeout(800); assert.equal(await count(), 3, 'copy should not recapture itself');
  console.log('PASS popup search + Ctrl+Enter copy + no duplicate');
  await shelf.evaluate(async () => {
    await window.electronAPI.clipboard.hidePopup();
    await window.electronAPI.clipboard.show();
  });
  await shelf.waitForTimeout(400);
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('clipboard-popup'))?.isVisible()), true);
  console.log('PASS close/reopen cancels pending close');
  await shelf.getByLabel('Search clipboard clips', { exact: true }).fill('');
  assert.equal(await app.evaluate(({ clipboard, nativeImage }, path) => {
    const image = nativeImage.createFromPath(path);
    clipboard.writeImage(image);
    return image.isEmpty();
  }, resolve('public/app-icons/keyflow-blue.png')), false, 'valid image fixture');
  await waitCount(4);
  const imageId = await page.evaluate(async () => (await window.electronAPI.clipboard.getSnapshot()).items.find(i => i.kind === 'image').id);
  await page.evaluate(id => window.electronAPI.clipboard.copy(id), imageId);
  assert.equal(await app.evaluate(({ clipboard }) => clipboard.readImage().isEmpty()), false);
  console.log('PASS real image capture + restore');
  const files = [join(output, 'QA one.txt'), join(output, 'QA café 🌿.txt')];
  files.forEach(path => writeFileSync(path, 'KeyFlow clipboard QA fixture'));
  await app.evaluate(async (_, files) => { await globalThis.__qaFiles.writeClipboardFiles(files); }, files);
  await waitCount(5);
  const fileItem = await page.evaluate(async () => (await window.electronAPI.clipboard.getSnapshot()).items.find(i => i.kind === 'files'));
  assert.ok(fileItem, 'Windows file-list capture');
  assert.equal(fileItem.fileCount, 2);
  await page.evaluate(id => window.electronAPI.clipboard.copy(id), fileItem.id);
  assert.deepEqual(await app.evaluate(() => globalThis.__qaFiles.readClipboardFiles()), files);
  await page.evaluate(id => window.electronAPI.clipboard.copy(id, true), fileItem.id);
  assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), files.join('\r\n'));
  console.log('PASS real two-file capture + native file restore + plain paths');
  await shelf.getByTitle('New Folder').click();
  const folderDialog = shelf.getByRole('dialog', { name: 'New Folder Collection', exact: true });
  await folderDialog.getByLabel('Folder Name', { exact: true }).fill('QA Folder 123');
  await folderDialog.getByTitle('Purple', { exact: true }).click();
  await folderDialog.getByTitle('Star', { exact: true }).click();
  await folderDialog.getByRole('button', { name: 'Create Folder', exact: true }).click();
  await folderDialog.waitFor({ state: 'hidden' });
  const board = await page.evaluate(async () => (await window.electronAPI.clipboard.getSnapshot()).pinboards.find(b => b.name === 'QA Folder 123'));
  assert.equal(board.color, 'var(--cat-color-purple)'); assert.equal(board.icon, 'Star');
  await shelf.evaluate(({ id, board }) => window.electronAPI.clipboard.assignPinboard(id, board), { id: imageId, board: board.id });
  await shelf.getByRole('tab', { name: /QA Folder 123/ }).click();
  await shelf.waitForFunction(() => document.querySelectorAll('.clip-shelf-card').length === 1);
  await shelf.getByRole('tab', { name: 'All', exact: true }).click();
  console.log('PASS folder creation, icon/color persistence, assignment and filtering');
  await app.evaluate(({ BrowserWindow }) => {
    const target = new BrowserWindow({ width: 480, height: 320, webPreferences: { contextIsolation: true, nodeIntegration: false } });
    globalThis.__qaPasteTarget = target;
    void target.loadURL('data:text/html,<title>KeyFlow QA paste target</title><textarea aria-label="Paste target" autofocus></textarea>');
  });
  const target = app.windows().find(p => p.url().startsWith('data:')) || await app.waitForEvent('window');
  await target.getByLabel('Paste target').waitFor();
  await app.evaluate(() => globalThis.__qaPasteTarget.focus());
  await target.getByLabel('Paste target').focus();
  await shelf.evaluate(() => window.electronAPI.clipboard.show());
  await shelf.getByLabel('Search clipboard clips').fill('alpha');
  await shelf.keyboard.press('Enter');
  await target.waitForFunction(() => document.querySelector('textarea').value === 'KeyFlow QA alpha');
  console.log('PASS native paste into a separate target window');
  await app.evaluate(() => globalThis.__qaPasteTarget.destroy());
  await shelf.evaluate(() => window.electronAPI.clipboard.show());
  await shelf.getByLabel('Search clipboard clips').fill('');
  for (const layout of ['horizontal', 'center', 'right']) {
    await shelf.evaluate((layout) => window.electronAPI.clipboard.setSettings({ layout }), layout);
    await shelf.waitForTimeout(350);
    const overflow = await shelf.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || document.documentElement.scrollHeight > innerHeight + 1);
    assert.equal(overflow, false, `${layout} viewport overflow`);
    await shelf.screenshot({ path: join(output, `popup-${layout}.png`) });
  }
  console.log('PASS all three popup layouts');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => !w.webContents.getURL().includes('?'))?.setSize(420, 640));
  await page.waitForTimeout(350);
  await page.screenshot({ path: join(output, 'hub-compact.png') });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  console.log('PASS compact clipboard page');
  await page.evaluate(() => window.__keyflowStore.getState().patchSettings('appearance', { theme: 'light' }));
  await shelf.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await shelf.screenshot({ path: join(output, 'popup-light.png') });
  await shelf.emulateMedia({ colorScheme: 'dark' });
  await page.evaluate(() => window.__keyflowStore.getState().patchSettings('appearance', { theme: 'system' }));
  await shelf.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await shelf.emulateMedia({ colorScheme: 'light' });
  await shelf.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  console.log('PASS cross-window appearance + live system theme');
  const engineChecks = await app.evaluate(async ({ clipboard }) => {
    const engine = globalThis.__qaEngine;
    engine.stop();
    const before = engine.snapshot().items.length;
    let release;
    engine.setSourceAppProvider(() => new Promise(resolve => { release = resolve; }));
    clipboard.writeText('QA in-flight capture must not survive pause');
    const pending = engine.captureCurrent();
    engine.setSettings({ paused: true });
    release({ processName: 'qa.exe' }); await pending;
    const pauseSafe = engine.snapshot().items.length === before;
    let rejected = false;
    try { engine.setSettings({ maxItems: 0 }); } catch { rejected = true; }
    const pinned = engine.items.find(item => item.pinned);
    const old = engine.items.find(item => !item.pinned);
    pinned.capturedAt = Date.now() - 40 * 86400000;
    old.capturedAt = pinned.capturedAt;
    engine.setSettings({ retentionDays: 7, maxItems: 2 });
    const retained = engine.snapshot();
    const retentionSafe = retained.items.some(item => item.id === pinned.id) && !retained.items.some(item => item.id === old.id) && retained.items.filter(item => !item.pinned).length <= 2;
    engine.items = []; engine.load();
    return { pauseSafe, rejected, retentionSafe, persisted: engine.snapshot().items.length === retained.items.length && engine.snapshot().settings.retentionDays === 7 };
  });
  assert.deepEqual(engineChecks, { pauseSafe: true, rejected: true, retentionSafe: true, persisted: true });
  console.log('PASS in-flight pause protection, invalid settings, retention + pinned preservation, persistence');
  assert.deepEqual(errors, []);
  console.log('PASS no renderer exceptions');
  console.log(`QA artifacts: ${output}`);
} catch (error) {
  for (const [index, page] of app.windows().entries()) await page.screenshot({ path: join(output, `failure-${index}.png`) }).catch(() => {});
  console.log(`Failure artifacts: ${output}`);
  throw error;
} finally {
  if (clipboardBackedUp) await app.evaluate(async ({ clipboard }) => {
    globalThis.__qaEngine.stop();
    const backup = globalThis.__qaBackup;
    if (backup.files.length) {
      await globalThis.__qaFiles.writeClipboardFiles(backup.files);
    } else clipboard.write({ text: backup.text, html: backup.html, image: backup.image });
  }).catch(() => {});
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
}
