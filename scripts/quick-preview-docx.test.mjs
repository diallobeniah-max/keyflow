import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readDocxText} from '../electron/quick-preview-docx.ts';
import {makeZip} from './quick-preview-zip-fixture.mjs';

test('DOCX preview extracts bounded plain text without executing document content', async () => {
  const dir=await mkdtemp(join(tmpdir(),'keyflow-docx-preview-'));
  try {
    const path=join(dir,'sample.docx');
    const xml=`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello &amp; café</w:t><w:tab/><w:t>world</w:t></w:r></w:p><w:p><w:r><w:t>Second line</w:t></w:r></w:p></w:body></w:document>`;
    await writeFile(path,makeZip([{name:'word/document.xml',content:xml}]));
    assert.deepEqual(await readDocxText(path),{text:'Hello & café\tworld\nSecond line',truncated:false});
    const strict = xml.replace('http://schemas.openxmlformats.org/wordprocessingml/2006/main','http://purl.oclc.org/ooxml/wordprocessingml/main');
    await writeFile(path,makeZip([{name:'word/document.xml',content:strict}]));
    assert.equal((await readDocxText(path)).text,'Hello & café\tworld\nSecond line');
    const dangerous=`<!DOCTYPE doc [<!ENTITY secret SYSTEM "file:///C:/secret.txt">]><doc>&secret;</doc>`;
    await writeFile(path,makeZip([{name:'word/document.xml',content:dangerous}]));
    assert.equal(await readDocxText(path),null);
    await writeFile(path,makeZip([{name:'word/document.xml',content:`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:t>${'x'.repeat(530000)}</w:t></w:p></w:document>`}]));
    const long=await readDocxText(path); assert.ok(long.truncated); assert.equal(long.text.length,512*1024);
    const controller=new AbortController(); controller.abort(); assert.equal(await readDocxText(path,controller.signal),null);
  } finally {await rm(dir,{recursive:true,force:true});}
});
