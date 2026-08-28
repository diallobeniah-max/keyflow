import test from "node:test";
import assert from "node:assert/strict";
import {
  DRAG_ZONES,
  PRESET_ZONE_MASKS,
  activeZones,
  addZone,
  maskToPreset,
  removeZone,
  sameZones,
  toggleZone,
} from "../src/lib/drag-zones.ts";
import {
  DRAG_ZONE_BOTTOM,
  DRAG_ZONE_BOTTOM_LEFT,
  DRAG_ZONE_BOTTOM_RIGHT,
  DRAG_ZONE_LEFT,
  DRAG_ZONE_RIGHT,
  DRAG_ZONE_TOP,
  DRAG_ZONE_TOP_LEFT,
  DRAG_ZONE_TOP_RIGHT,
} from "../src/types/index.ts";

const ALL_BITS =
  DRAG_ZONE_TOP_LEFT |
  DRAG_ZONE_TOP_RIGHT |
  DRAG_ZONE_BOTTOM_LEFT |
  DRAG_ZONE_BOTTOM_RIGHT |
  DRAG_ZONE_TOP |
  DRAG_ZONE_LEFT |
  DRAG_ZONE_RIGHT |
  DRAG_ZONE_BOTTOM;

test("preset topRight activates exactly the top-right corner", () => {
  assert.equal(PRESET_ZONE_MASKS.topRight, DRAG_ZONE_TOP_RIGHT);
  assert.equal(activeZones(PRESET_ZONE_MASKS.topRight).length, 1);
  assert.equal(activeZones(PRESET_ZONE_MASKS.topRight)[0].bit, DRAG_ZONE_TOP_RIGHT);
});

test("preset allCorners activates the four corners only", () => {
  const active = activeZones(PRESET_ZONE_MASKS.allCorners).map((z) => z.bit).sort();
  assert.deepEqual(active, [DRAG_ZONE_TOP_LEFT, DRAG_ZONE_TOP_RIGHT, DRAG_ZONE_BOTTOM_LEFT, DRAG_ZONE_BOTTOM_RIGHT].sort());
});

test("preset allEdges activates the four edges only", () => {
  const active = activeZones(PRESET_ZONE_MASKS.allEdges).map((z) => z.bit).sort();
  assert.deepEqual(active, [DRAG_ZONE_TOP, DRAG_ZONE_LEFT, DRAG_ZONE_RIGHT, DRAG_ZONE_BOTTOM].sort());
});

test("preset all activates every zone", () => {
  assert.equal(PRESET_ZONE_MASKS.all, ALL_BITS);
  assert.equal(activeZones(PRESET_ZONE_MASKS.all).length, 8);
});

test("maskToPreset round-trips each preset", () => {
  for (const preset of ["topRight", "allCorners", "allEdges", "all"]) {
    assert.equal(maskToPreset(PRESET_ZONE_MASKS[preset]), preset);
  }
});

test("maskToPreset reports custom for arbitrary masks", () => {
  assert.equal(maskToPreset(DRAG_ZONE_TOP_RIGHT | DRAG_ZONE_LEFT), "custom");
  assert.equal(maskToPreset(0), "custom");
  assert.equal(maskToPreset(ALL_BITS ^ DRAG_ZONE_TOP), "custom");
});

test("maskToPreset matches presets only by exact bit equality", () => {
  assert.equal(maskToPreset(PRESET_ZONE_MASKS.topRight), "topRight");
  assert.equal(maskToPreset(PRESET_ZONE_MASKS.topRight | DRAG_ZONE_TOP), "custom");
});

test("toggleZone flips a zone on and off", () => {
  assert.equal(toggleZone(0, DRAG_ZONE_TOP_RIGHT), DRAG_ZONE_TOP_RIGHT);
  assert.equal(toggleZone(DRAG_ZONE_TOP_RIGHT, DRAG_ZONE_TOP_RIGHT), 0);
});

test("toggleZone preserves other zones", () => {
  const mask = DRAG_ZONE_TOP_RIGHT | DRAG_ZONE_BOTTOM_LEFT;
  assert.equal(toggleZone(mask, DRAG_ZONE_TOP), mask | DRAG_ZONE_TOP);
  assert.equal(toggleZone(mask, DRAG_ZONE_TOP_RIGHT), DRAG_ZONE_BOTTOM_LEFT);
});

test("addZone is idempotent", () => {
  assert.equal(addZone(DRAG_ZONE_TOP_RIGHT, DRAG_ZONE_TOP_RIGHT), DRAG_ZONE_TOP_RIGHT);
  assert.equal(addZone(0, DRAG_ZONE_TOP_RIGHT), DRAG_ZONE_TOP_RIGHT);
});

test("removeZone is idempotent", () => {
  assert.equal(removeZone(DRAG_ZONE_TOP_RIGHT, DRAG_ZONE_TOP_RIGHT), 0);
  assert.equal(removeZone(0, DRAG_ZONE_TOP_RIGHT), 0);
});

test("activeZones returns only enabled zones in picker order", () => {
  const active = activeZones(DRAG_ZONE_TOP_RIGHT | DRAG_ZONE_BOTTOM).map((z) => z.bit);
  assert.deepEqual(active, [DRAG_ZONE_TOP_RIGHT, DRAG_ZONE_BOTTOM]);
});

test("activeZones is empty for an empty mask", () => {
  assert.deepEqual(activeZones(0), []);
});

test("every zone def has a unique bit, label, and css class", () => {
  const bits = new Set();
  const labels = new Set();
  const cls = new Set();
  for (const z of DRAG_ZONES) {
    assert.ok(!bits.has(z.bit), `duplicate bit ${z.bit}`);
    assert.ok(!labels.has(z.label), `duplicate label ${z.label}`);
    assert.ok(!cls.has(z.cls), `duplicate class ${z.cls}`);
    bits.add(z.bit);
    labels.add(z.label);
    cls.add(z.cls);
  }
  assert.equal(DRAG_ZONES.length, 8);
});

test("the eight zone bits cover the full corner+edge mask", () => {
  const covered = DRAG_ZONES.reduce((acc, z) => acc | z.bit, 0);
  assert.equal(covered, ALL_BITS);
});

test("sameZones distinguishes equal and unequal masks", () => {
  assert.equal(sameZones(DRAG_ZONE_TOP_RIGHT, DRAG_ZONE_TOP_RIGHT), true);
  assert.equal(sameZones(DRAG_ZONE_TOP_RIGHT, 0), false);
  assert.equal(sameZones(PRESET_ZONE_MASKS.all, ALL_BITS), true);
});

test("composing corners + edges through addZone reaches the all preset", () => {
  let mask = 0;
  for (const z of DRAG_ZONES) mask = addZone(mask, z.bit);
  assert.equal(mask, ALL_BITS);
  assert.equal(maskToPreset(mask), "all");
});

test("removing one bit from all produces a custom mask", () => {
  const mask = removeZone(ALL_BITS, DRAG_ZONE_BOTTOM_LEFT);
  assert.equal(maskToPreset(mask), "custom");
  assert.equal(activeZones(mask).length, 7);
});

test("custom zone selection never equals a preset mask", () => {
  // Top-right + top edge is a plausible custom selection.
  const custom = DRAG_ZONE_TOP_RIGHT | DRAG_ZONE_TOP;
  assert.notEqual(maskToPreset(custom), "topRight");
  assert.notEqual(maskToPreset(custom), "allCorners");
  assert.notEqual(maskToPreset(custom), "allEdges");
  assert.notEqual(maskToPreset(custom), "all");
  assert.equal(maskToPreset(custom), "custom");
});

test("drag zone default mask is the top-right preset", () => {
  // Mirrors src/lib/defaults.ts dragSwitcher.zones default.
  assert.equal(0x02, DRAG_ZONE_TOP_RIGHT);
  assert.equal(maskToPreset(0x02), "topRight");
});

test("toggleZone on a preset mask degrades to custom", () => {
  const mask = toggleZone(PRESET_ZONE_MASKS.allCorners, DRAG_ZONE_TOP_RIGHT);
  assert.equal(maskToPreset(mask), "custom");
});

test("corner and edge presets are strict subsets of all", () => {
  assert.equal((PRESET_ZONE_MASKS.allCorners & PRESET_ZONE_MASKS.all) === PRESET_ZONE_MASKS.allCorners, true);
  assert.equal((PRESET_ZONE_MASKS.allEdges & PRESET_ZONE_MASKS.all) === PRESET_ZONE_MASKS.allEdges, true);
  assert.equal((PRESET_ZONE_MASKS.topRight & PRESET_ZONE_MASKS.allCorners) === PRESET_ZONE_MASKS.topRight, true);
  assert.equal(PRESET_ZONE_MASKS.allCorners & PRESET_ZONE_MASKS.allEdges, 0, "corners and edges are disjoint");
});

test("picker order is row-major like the 3x3 grid layout", () => {
  const order = DRAG_ZONES.map((z) => z.bit);
  assert.deepEqual(order, [
    DRAG_ZONE_TOP_LEFT, // row 1
    DRAG_ZONE_TOP,
    DRAG_ZONE_TOP_RIGHT,
    DRAG_ZONE_LEFT, // row 2 (center is the screen label)
    DRAG_ZONE_RIGHT,
    DRAG_ZONE_BOTTOM_LEFT, // row 3
    DRAG_ZONE_BOTTOM,
    DRAG_ZONE_BOTTOM_RIGHT,
  ]);
});

test("wire shape: zones mask travels as-is to the native config", () => {
  // Mirrors src/lib/native-input.ts setDragSwitcher payload mapping.
  const settings = { zones: PRESET_ZONE_MASKS.allEdges, activationMs: 0, hoverMs: 400, cornerSize: 16 };
  const wire = {
    enabled: true,
    zones: settings.zones,
    activationMs: settings.activationMs,
    hoverMs: settings.hoverMs,
    cornerSize: settings.cornerSize,
  };
  assert.equal(wire.zones, 0xf0);
  assert.equal(wire.activationMs, 0);
  assert.equal(wire.hoverMs, 400);
  assert.equal(wire.cornerSize, 16);
});