import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveNativeHelperPath } from '../dist-electron/native-input-helper.js';

test('preview helper selects the explicitly built binary and never silently falls back', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'keyflow-helper-path-'));
  const oldTarget = process.env.KEYFLOW_NATIVE_TARGET_DIR, oldHelper = process.env.KEYFLOW_INPUT_HELPER;
  const oldResources = process.resourcesPath;
  try {
    delete process.env.KEYFLOW_INPUT_HELPER;
    const custom = join(dir, 'custom'), bundled = join(dir, 'resources');
    await mkdir(join(custom, 'release'), {recursive:true});
    await mkdir(join(bundled, 'keyflow-input'), {recursive:true});
    const customExe = join(custom, 'release', 'keyflow-input.exe');
    const bundledExe = join(bundled, 'keyflow-input', 'keyflow-input.exe');
    await writeFile(customExe, 'custom'); await writeFile(bundledExe, 'bundled');
    process.resourcesPath = bundled;
    process.env.KEYFLOW_NATIVE_TARGET_DIR = custom;
    assert.equal(resolveNativeHelperPath(), customExe);
    process.env.KEYFLOW_NATIVE_TARGET_DIR = join(dir, 'missing');
    assert.equal(resolveNativeHelperPath(), null);
    delete process.env.KEYFLOW_NATIVE_TARGET_DIR;
    assert.equal(resolveNativeHelperPath(), bundledExe);
  } finally {
    if (oldTarget === undefined) delete process.env.KEYFLOW_NATIVE_TARGET_DIR; else process.env.KEYFLOW_NATIVE_TARGET_DIR = oldTarget;
    if (oldHelper === undefined) delete process.env.KEYFLOW_INPUT_HELPER; else process.env.KEYFLOW_INPUT_HELPER = oldHelper;
    if (oldResources === undefined) delete process.resourcesPath; else process.resourcesPath = oldResources;
    await rm(dir, {recursive:true,force:true});
  }
});
