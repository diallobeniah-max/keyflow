import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesPreviewKey } from '../src/lib/quick-preview-key.ts';

const event = (key, code, mods = {}) => ({key,code,ctrlKey:false,altKey:false,shiftKey:false,metaKey:false,...mods});
test('preview closes for configured keys using DOM and numpad names', () => {
  assert.ok(matchesPreviewKey('Space', event(' ', 'Space')));
  assert.ok(matchesPreviewKey('Ctrl+Left', event('ArrowLeft','ArrowLeft',{ctrlKey:true})));
  assert.ok(matchesPreviewKey('Shift+1', event('!','Digit1',{shiftKey:true})));
  assert.ok(matchesPreviewKey('Ctrl+Num+', event('+','NumpadAdd',{ctrlKey:true})));
  assert.ok(matchesPreviewKey('Num1', event('1','Numpad1')));
  assert.ok(!matchesPreviewKey('Num1', event('1','Digit1')));
  assert.ok(!matchesPreviewKey('Space', event(' ','Space',{ctrlKey:true})));
});
