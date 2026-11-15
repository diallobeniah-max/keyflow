import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appliesToExplorer } from '../src/lib/quick-preview-conflicts.ts';

test('only global and Explorer-scoped shortcuts conflict with Explorer preview', () => {
  assert.equal(appliesToExplorer(), true);
  assert.equal(appliesToExplorer({executablePath:'C:\\Windows\\explorer.exe'}), true);
  assert.equal(appliesToExplorer({executablePath:'C:/Windows/EXPLORER.EXE'}), true);
  assert.equal(appliesToExplorer({executablePath:'C:\\Apps\\Photoshop.exe'}), false);
  assert.equal(appliesToExplorer({processName:'explorer.exe'}), true);
  assert.equal(appliesToExplorer({}), true);
});
