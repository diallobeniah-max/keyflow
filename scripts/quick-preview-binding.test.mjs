import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

test('preview bindings support Space and configurable chords, rejecting reserved combinations', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'keyflow-bindings-'));
  try {
    for (const name of ['win-vk', 'quick-preview-binding']) {
      const source = (await readFile(resolve('electron', `${name}.ts`), 'utf8')).replace('./win-vk.js', './win-vk.mjs');
      const js = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
      await writeFile(join(dir, `${name}.mjs`), js);
    }
    const { parseQuickPreviewBinding: parse, conflictsWithEmergencyShortcut: conflicts, conflictsWithActiveShortcuts: conflictsActive } = await import(pathToFileURL(join(dir, 'quick-preview-binding.mjs')).href);
    assert.deepEqual(parse('Space'), {key:'Space',vk:32,modifiers:0});
    assert.deepEqual(parse('Ctrl+Shift+F8'), {key:'F8',vk:119,modifiers:5});
    assert.deepEqual(parse('Ctrl+Num+'), {key:'Num+',vk:107,modifiers:1});
    assert.equal(conflicts(parse('Shift+Ctrl+K'), 'Ctrl+Shift+K'), true);
    assert.equal(conflicts(parse('Ctrl+K'), 'Ctrl+Shift+K'), false);
    assert.equal(conflictsActive(parse('Ctrl+Shift+F8'), ['Shift+Ctrl+F8']), true);
    assert.equal(conflictsActive(parse('Space'), ['Ctrl+Space', 'Alt+F8']), false);
    for (const input of ['Ctrl+Alt+Delete','Alt+F4','Win+L','Ctrl+Alt+Shift+F12','Hyper+Space','Ctrl+Ctrl+A','NotAKey','']) assert.equal(parse(input), null, input);
  } finally { await rm(dir, {recursive:true,force:true}); }
});
