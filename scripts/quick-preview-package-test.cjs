const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const root = resolve(process.argv[2]);
const psd = resolve(process.argv[3]);
const zip = process.argv[4] ? resolve(process.argv[4]) : '';
const docx = process.argv[5] ? resolve(process.argv[5]) : '';
const executable = resolve(root, 'KeyFlow.exe');
const modulePath = resolve(root, 'resources/app.asar/dist-electron/psd-preview.js');
const code = `import {pathToFileURL} from 'node:url';
  const module = await import(pathToFileURL(process.argv[1]).href);
  const result = await module.readPsdComposite(process.argv[2]);
  let archiveOk = true;
  if (process.argv[3]) {
    const archiveModule = await import(pathToFileURL(process.argv[4]).href);
    const archive = await archiveModule.readZipListing(process.argv[3]);
    archiveOk = !!archive && archive.entries.some(entry => entry.name === 'sample.txt');
  }
  let docxOk = true;
  if (process.argv[5]) {
    const docxModule = await import(pathToFileURL(process.argv[6]).href);
    const doc = await docxModule.readDocxText(process.argv[5]);
    docxOk = doc?.text === 'Package fixture';
  }
  console.log(JSON.stringify({ok:!!result,bytes:result?.length||0,archiveOk,docxOk}));`;
const archiveModulePath = resolve(root, 'resources/app.asar/dist-electron/quick-preview-archive.js');
const docxModulePath = resolve(root, 'resources/app.asar/dist-electron/quick-preview-docx.js');
const child = spawnSync(executable, ['--input-type=module', '-e', code, modulePath, psd, zip, archiveModulePath, docx, docxModulePath], {
  env:{...process.env,ELECTRON_RUN_AS_NODE:'1'}, encoding:'utf8', timeout:30000,
});
if (child.error) throw child.error;
assert.equal(child.status, 0, child.stderr);
const result = JSON.parse(child.stdout.trim());
assert.ok(result.ok && result.bytes > 0);
assert.equal(result.archiveOk, true, 'packaged archive reader must load');
assert.equal(result.docxOk, true, 'packaged DOCX reader must load');
console.log(`PASS: packaged image decoder produced ${result.bytes} bytes${zip ? ', archive reader loaded' : ''}${docx ? ', and DOCX reader loaded' : ''}`);
