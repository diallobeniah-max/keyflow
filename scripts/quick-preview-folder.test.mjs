import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPreviewFolder } from '../dist-electron/quick-preview-folder.js';

test('folder listing includes metadata and sorts folders first', async () => {
  const dir=await mkdtemp(join(tmpdir(),'keyflow-folder-test-'));
  try {
    await mkdir(join(dir,'Folder 2'));
    await mkdir(join(dir,'Folder 1'));
    await writeFile(join(dir,'résumé.txt'),'hello');
    let initial;
    const result=await readPreviewFolder(dir,undefined,listing=>{initial=listing});
    assert.deepEqual(result.entries.map(entry=>entry.name),['Folder 1','Folder 2','résumé.txt']);
    assert.equal(result.entries[0].directory,true);
    assert.equal(result.entries[2].size,5);
    assert.equal(initial.entries[2].size,null,'initial listing should be available before metadata');
    assert.ok(result.entries[2].modified>0);
    assert.equal(result.truncated,false);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('folder listing is capped for large directories', async () => {
  const dir=await mkdtemp(join(tmpdir(),'keyflow-folder-cap-'));
  try {
    await Promise.all(Array.from({length:501},(_,i)=>writeFile(join(dir,`${i}.txt`),'')));
    const result=await readPreviewFolder(dir);
    assert.equal(result.entries.length,500);
    assert.equal(result.truncated,true);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
