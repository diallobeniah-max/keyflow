import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

test('preview streams only the current selected file and supports media ranges', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'keyflow-stream-'));
  let stream;
  try {
    const source = await readFile(resolve('electron/quick-preview-stream.ts'), 'utf8');
    await writeFile(join(dir, 'stream.mjs'), ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
    const { PreviewStream } = await import(pathToFileURL(join(dir, 'stream.mjs')).href);
    const one = join(dir, 'one.wav'), two = join(dir, 'two.wav');
    await writeFile(one, '0123456789'); await writeFile(two, 'abcdefghij');
    stream = new PreviewStream();
    const fetch = (url, options) => stream.serve(new Request(url, options));
    const url = await stream.select(one, 'audio/wav');
    let response = await fetch(url);
    assert.equal(response.status, 200); assert.equal(await response.text(), '0123456789');
    response = await fetch(url, {headers:{Range:'bytes=2-4'}});
    assert.equal(response.status, 206); assert.equal(response.headers.get('content-range'), 'bytes 2-4/10'); assert.equal(await response.text(), '234');
    response = await fetch(url, {headers:{Range:'bytes=-3'}});
    assert.equal(await response.text(), '789');
    response = await fetch(url, {headers:{Range:'bytes=99-'}});
    assert.equal(response.status, 416);
    assert.equal((await fetch(url + '/anything')).status, 404);
    assert.equal((await fetch(url, {method:'POST'})).status, 404);
    const next = await stream.select(two, 'audio/wav');
    assert.equal((await fetch(url)).status, 404);
    assert.equal(await (await fetch(next)).text(), 'abcdefghij');
    stream.clear();
    assert.equal((await fetch(next)).status, 404);
  } finally { stream?.destroy(); await rm(dir, {recursive:true,force:true}); }
});
