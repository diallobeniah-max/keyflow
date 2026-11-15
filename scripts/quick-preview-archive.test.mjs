import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readZipListing} from '../electron/quick-preview-archive.ts';
import {makeZip} from './quick-preview-zip-fixture.mjs';

test('ZIP preview lists metadata without extracting and limits large archives', async () => {
  const dir = await mkdtemp(join(tmpdir(),'keyflow-zip-preview-'));
  try {
    const path = join(dir,'sample.zip');
    await writeFile(path,makeZip(['Folder/','Folder/café.txt']));
    const listing = await readZipListing(path);
    assert.deepEqual(listing,{entries:[{name:'Folder/',size:0,directory:true},{name:'Folder/café.txt',size:6,directory:false}],total:2,truncated:false});
    await writeFile(path,makeZip(Array.from({length:1001},(_,i)=>`file-${i}.txt`)));
    const large = await readZipListing(path);
    assert.equal(large.entries.length,1000); assert.equal(large.total,1001); assert.equal(large.truncated,true);
    await writeFile(path,'not a zip'); assert.equal(await readZipListing(path),null);
    const controller = new AbortController(); controller.abort();
    assert.equal(await readZipListing(path,controller.signal),null);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
