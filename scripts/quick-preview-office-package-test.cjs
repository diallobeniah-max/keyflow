const { spawnSync } = require('node:child_process');
const { resolve, join } = require('node:path');
const assert = require('node:assert/strict');
const root = resolve(process.argv[2]);
const modulePath = join(root, 'resources/app.asar/dist-electron/quick-preview-office.js');
const expected = join(root, 'resources/quick-preview/office-handler-worker.ps1');
const code = `
  import childProcess from 'node:child_process';
  import {syncBuiltinESMExports} from 'node:module';
  import {pathToFileURL} from 'node:url';
  const original=childProcess.spawn;
  let worker='';
  childProcess.spawn=(exe,args,options)=>{worker=args.at(-1);return original(exe,args,options)};
  syncBuiltinESMExports();
  const {OfficePreviewProcess}=await import(pathToFileURL(process.argv[1]).href);
  const preview=new OfficePreviewProcess();
  const ready=await preview.start(1,'C:\\\\missing.docx',{x:0,y:0,width:100,height:100});
  preview.stop();
  console.log(JSON.stringify({ready,worker}));
`;
const child = spawnSync(join(root, 'KeyFlow.exe'), ['--input-type=module', '-e', code, modulePath], {
  env:{...process.env,ELECTRON_RUN_AS_NODE:'1'}, encoding:'utf8', timeout:30000,
});
if (child.error) throw child.error;
assert.equal(child.status,0,child.stderr);
const result=JSON.parse(child.stdout.trim());
assert.equal(result.ready,false,'invalid window and missing file must fail safely');
assert.equal(resolve(result.worker),expected,'packaged runtime must start the included worker');
console.log('PASS: packaged Office module selected the included worker and failed safely');
