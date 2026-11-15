import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QuickPreviewMonitor } from '../electron/quick-preview-monitor.ts';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
test('monitor never publishes a selection from an obsolete native revision', async () => {
  const pending = [], sent = [];
  const monitor = new QuickPreviewMonitor(() => new Promise(resolve => pending.push(resolve)));
  const port = { configureQuickPreview: () => {}, requestQuickPreviewRevision: () => {}, setQuickPreviewSnapshot: (...v) => sent.push(v) };
  try {
    monitor.setPort(port);
    monitor.configure({ enabled: true, key: 32, modifiers: 0 });
    monitor.onRevision(1, true);
    for (let i = 0; i < 20 && pending.length < 1; i++) await wait(10);
    assert.equal(pending.length, 1);
    monitor.onRevision(2, true);
    pending.shift()({ path: 'C:\\old.txt', foreground: '10', focus: '20' });
    for (let i = 0; i < 50 && pending.length < 1; i++) await wait(10);
    assert.equal(pending.length, 1);
    assert.equal(sent.length, 0, 'stale result must not be sent to the hook');
    pending.shift()({ path: 'C:\\new.txt', foreground: '10', focus: '20' });
    for (let i = 0; i < 20 && sent.length < 1; i++) await wait(10);
    assert.deepEqual(sent[0], [2, 10, 20, true]);
  } finally { monitor.destroy(); }
});

test('selection changes preempt the normal refresh delay', async () => {
  let calls = 0;
  const monitor = new QuickPreviewMonitor(async () => {
    calls++;
    return {path:'C:\\file.txt', foreground:'10', focus:'20'};
  });
  const port = {configureQuickPreview: () => {}, requestQuickPreviewRevision: () => {}, setQuickPreviewSnapshot: () => {}};
  try {
    monitor.setPort(port);
    monitor.configure({enabled:true,key:32,modifiers:0});
    monitor.onRevision(1, true);
    for (let i=0; i<30 && calls<1; i++) await wait(5);
    assert.equal(calls, 1);
    monitor.onRevision(2, true);
    for (let i=0; i<20 && calls<2; i++) await wait(5);
    assert.equal(calls, 2, 'a revision change should refresh before the 150 ms periodic poll');
  } finally { monitor.destroy(); }
});

test('reports unavailable when the native mouse observer cannot protect selection', async () => {
  let selections = 0;
  const monitor = new QuickPreviewMonitor(async () => { selections++; return null; });
  const port = {configureQuickPreview: () => {}, requestQuickPreviewRevision: () => {}, setQuickPreviewSnapshot: () => {}};
  try {
    assert.equal(monitor.getHealth(), 'unavailable');
    monitor.setPort(port); monitor.configure({enabled:true,key:32,modifiers:0});
    assert.equal(monitor.getHealth(), 'starting');
    monitor.onRevision(1, false);
    assert.equal(monitor.getHealth(), 'unavailable');
    await wait(30); assert.equal(selections, 0);
    monitor.onRevision(1, true);
    assert.equal(monitor.getHealth(), 'ready');
    for (let i=0; i<20 && selections===0; i++) await wait(5);
    assert.equal(selections, 1);
  } finally { monitor.destroy(); }
});
