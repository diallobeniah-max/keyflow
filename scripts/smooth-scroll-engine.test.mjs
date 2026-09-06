import test from 'node:test';
import assert from 'node:assert/strict';

let currentRafId = 0;
let rafCallbacks = new Map();
let virtualTime = 1000;

globalThis.performance = {
  now() {
    return virtualTime;
  }
};

globalThis.requestAnimationFrame = (cb) => {
  const id = ++currentRafId;
  rafCallbacks.set(id, cb);
  return id;
};

globalThis.cancelAnimationFrame = (id) => {
  rafCallbacks.delete(id);
};

globalThis.window = {
  innerHeight: 800,
  innerWidth: 1200,
  getComputedStyle: () => ({ overflowY: 'visible', overflowX: 'visible' }),
};

function advanceFrame(dtMs = 16.67) {
  virtualTime += dtMs;
  const pending = Array.from(rafCallbacks.entries());
  rafCallbacks.clear();
  for (const [id, cb] of pending) {
    cb(virtualTime);
  }
}

function createMockElement(scrollTop = 0, scrollHeight = 2000, clientHeight = 800) {
  const listeners = {};
  return {
    scrollTop,
    scrollLeft: 0,
    scrollHeight,
    clientHeight,
    scrollWidth: 1000,
    clientWidth: 800,
    addEventListener(name, fn) {
      listeners[name] = listeners[name] || [];
      listeners[name].push(fn);
    },
    removeEventListener(name, fn) {
      if (listeners[name]) {
        listeners[name] = listeners[name].filter(f => f !== fn);
      }
    },
    scrollBy(x, y) {
      this.scrollTop = Math.max(0, Math.min(this.scrollHeight - this.clientHeight, this.scrollTop + y));
      this.scrollLeft = Math.max(0, Math.min(this.scrollWidth - this.clientWidth, this.scrollLeft + x));
    },
    dispatchEvent(name, event) {
      if (listeners[name]) {
        for (const fn of listeners[name]) fn(event);
      }
    }
  };
}

const { SmoothScrollEngine, SMOOTH_SCROLL_PRESETS } = await import('../src/lib/smooth-scroll-engine.ts');

test('SmoothScrollEngine: presets are well-defined', () => {
  assert.ok(SMOOTH_SCROLL_PRESETS.native);
  assert.ok(SMOOTH_SCROLL_PRESETS.smooth);
  assert.ok(SMOOTH_SCROLL_PRESETS.silky);
  assert.ok(SMOOTH_SCROLL_PRESETS.fast);
  assert.equal(SMOOTH_SCROLL_PRESETS.native.animationTime, 0);
  assert.equal(SMOOTH_SCROLL_PRESETS.smooth.animationTime, 280);
});

test('SmoothScrollEngine: single notch scrolls smooth and settles', () => {
  const el = createMockElement();
  const engine = new SmoothScrollEngine({ stepSize: 100, animationTime: 280 });
  const detach = engine.attach(el);

  let defaultPrevented = false;
  el.dispatchEvent('wheel', {
    deltaMode: 1,
    deltaY: 3,
    deltaX: 0,
    defaultPrevented: false,
    preventDefault: () => { defaultPrevented = true; }
  });

  assert.ok(defaultPrevented, 'Event should be prevented');
  assert.equal(el.scrollTop, 0, 'Initial scroll should be 0 before first rAF frame');

  for (let i = 0; i < 30; i++) {
    advanceFrame(16.67);
  }

  assert.ok(el.scrollTop >= 98 && el.scrollTop <= 102, "Expected ~100px, got " + el.scrollTop);
  assert.equal(rafCallbacks.size, 0, 'Engine should be settled with no pending rAF');

  detach();
});

test('SmoothScrollEngine: rapid scrolling does NOT compound into runaway hyper-speed', () => {
  const el = createMockElement(0, 50000, 800);
  const engine = new SmoothScrollEngine({
    stepSize: 100,
    animationTime: 280,
    accelerationEnabled: true,
    accelerationMax: 3,
    accelerationDelta: 50
  });
  engine.attach(el);

  for (let notch = 0; notch < 20; notch++) {
    virtualTime += 25;
    el.dispatchEvent('wheel', {
      deltaMode: 1,
      deltaY: 3,
      deltaX: 0,
      preventDefault: () => {}
    });
    const pending = Array.from(rafCallbacks.entries());
    rafCallbacks.clear();
    for (const [id, cb] of pending) cb(virtualTime);
  }

  assert.ok(el.scrollTop < 5000, "Scroll speed runaway! Expected controlled distance < 5000, got " + el.scrollTop);
  assert.ok(el.scrollTop > 1000, "Expected responsive scrolling > 1000, got " + el.scrollTop);

  for (let i = 0; i < 40; i++) {
    advanceFrame(16.67);
  }
  assert.equal(rafCallbacks.size, 0, 'Animation should settle cleanly');

  engine.detach();
});

test('SmoothScrollEngine: direction reversal cancels opposing momentum instantly', () => {
  const el = createMockElement(1000, 5000, 800);
  const engine = new SmoothScrollEngine({ stepSize: 100, animationTime: 280 });
  engine.attach(el);

  el.dispatchEvent('wheel', {
    deltaMode: 1,
    deltaY: 3,
    deltaX: 0,
    preventDefault: () => {}
  });
  advanceFrame(16.67);
  const posAfterDown = el.scrollTop;
  assert.ok(posAfterDown > 1000, 'Should have moved down');

  el.dispatchEvent('wheel', {
    deltaMode: 1,
    deltaY: -3,
    deltaX: 0,
    preventDefault: () => {}
  });

  advanceFrame(16.67);
  assert.ok(el.scrollTop < posAfterDown, 'Reversal should immediately start moving in new direction');

  engine.detach();
});

test('SmoothScrollEngine: trackpad precision events pass through untouched', () => {
  const el = createMockElement();
  const engine = new SmoothScrollEngine({ trackpadPassThrough: true });
  engine.attach(el);

  let prevented = false;
  el.dispatchEvent('wheel', {
    deltaMode: 0,
    deltaY: 4.35,
    deltaX: 0,
    preventDefault: () => { prevented = true; }
  });

  assert.equal(prevented, false, 'Trackpad event must not be prevented');
  assert.equal(rafCallbacks.size, 0, 'No rAF should be scheduled for trackpad pass-through');

  engine.detach();
});

test('SmoothScrollEngine: boundary collision clears residual delta without sticking', () => {
  const el = createMockElement(1200, 2000, 800);
  const engine = new SmoothScrollEngine({ stepSize: 100 });
  engine.attach(el);

  el.dispatchEvent('wheel', {
    deltaMode: 1,
    deltaY: 3,
    deltaX: 0,
    preventDefault: () => {}
  });

  advanceFrame(16.67);
  assert.equal(rafCallbacks.size, 0, 'Residual delta at boundary must be cleared, not loop indefinitely');

  engine.detach();
});
