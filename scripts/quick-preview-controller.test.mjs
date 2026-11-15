import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QuickPreviewController } from '../electron/quick-preview-controller.ts';

test('preview controller respects disabled, pause, close and stale selection', async () => {
  let visible = false, opens = [], warms = 0, disposals = 0, finish;
  const window = { isVisible: () => visible, openPreview: async path => { opens.push(path); visible = true; return true; }, closePreview: () => { visible = false; } };
  const selection = () => new Promise(resolve => { finish = resolve; });
  const controller = new QuickPreviewController(window, selection, () => warms++, () => disposals++);
  const settings = { enabled: true, paused: false, shortcut: 'Space', closeWithEscape: true };
  assert.equal(await controller.toggle(), false);
  controller.configure(settings); assert.equal(warms, 1);
  const pending = controller.toggle();
  controller.configure({ ...settings, paused: true });
  finish('C:\\test.txt');
  assert.equal(await pending, false); assert.deepEqual(opens, []); assert.equal(disposals, 1);
  controller.configure(settings);
  const fresh = controller.toggle(); finish('C:\\test.txt');
  assert.equal(await fresh, true); assert.equal(visible, true);
  assert.equal(await controller.toggle(), true); assert.equal(visible, false);
  const cancelled = controller.toggle();
  assert.equal(await controller.toggle(), true);
  finish('C:\\stale.txt'); assert.equal(await cancelled, false);
  assert.deepEqual(opens, ['C:\\test.txt']);
  controller.destroy(); assert.equal(disposals, 2);
});
