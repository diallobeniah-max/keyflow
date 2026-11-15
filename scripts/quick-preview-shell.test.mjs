import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import ts from 'typescript';

test('Windows thumbnail fallback safely handles file names and cancellation', {skip:process.platform !== 'win32'}, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'keyflow-shell-'));
  try {
    const source = await readFile(resolve('electron/quick-preview-shell.ts'), 'utf8');
    await writeFile(join(dir, 'shell.mjs'), ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
    const {readShellThumbnail, disposeShellThumbnail} = await import(pathToFileURL(join(dir, 'shell.mjs')).href);
    const path = join(dir, 'image $ & quote\' café 日本語.png');
    await sharp({create:{width:100,height:80,channels:3,background:'#2468ac'}}).png().toFile(path);
    try {
      const image = await readShellThumbnail(path);
      assert.ok(image?.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
      const second = await readShellThumbnail(path);
      assert.ok(second?.length, 'the warmed provider must handle a second request');
      const controller = new AbortController(); controller.abort();
      assert.equal(await readShellThumbnail(path, controller.signal), null);
      const inFlight = new AbortController();
      const cancelled = readShellThumbnail(path, inFlight.signal);
      inFlight.abort();
      assert.equal(await cancelled, null);
      assert.ok(await readShellThumbnail(path), 'a cancelled provider must restart for the next preview');
    } finally { disposeShellThumbnail(); }
  } finally { await rm(dir, {recursive:true,force:true}); }
});
