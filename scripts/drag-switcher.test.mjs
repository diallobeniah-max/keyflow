import test from "node:test";
import assert from "node:assert/strict";
import { HoverDwellDetector } from "../src/lib/drag-switcher.ts";

test("dwell fires activate after the configured dwell time on one tile", () => {
  const d = new HoverDwellDetector(400);
  assert.equal(d.update("hwnd-1", 1000), null);
  assert.equal(d.update("hwnd-1", 1200), null);
  assert.equal(d.update("hwnd-1", 1399), null);
  assert.equal(d.update("hwnd-1", 1400), "hwnd-1"); // fires AT the boundary
});

test("a tile fires at most once until the cursor leaves", () => {
  const d = new HoverDwellDetector(400);
  assert.equal(d.update("hwnd-1", 0), null);
  assert.equal(d.update("hwnd-1", 400), "hwnd-1");
  assert.equal(d.update("hwnd-1", 8000), null, "already fired — no repeat");
});

test("moving off the tile re-arms the dwell for a later re-entry", () => {
  const d = new HoverDwellDetector(400);
  assert.equal(d.update("hwnd-1", 0), null);
  assert.equal(d.update(null, 100), null);
  assert.equal(d.update("hwnd-2", 200), null);
  assert.equal(d.update("hwnd-2", 600), "hwnd-2");
});

test("hovering nothing never fires", () => {
  const d = new HoverDwellDetector(100);
  assert.equal(d.update(null, 0), null);
  assert.equal(d.update(null, 5000), null);
});

test("changing the dwell time takes effect for the current hover", () => {
  const d = new HoverDwellDetector(400);
  assert.equal(d.update("hwnd-1", 0), null);
  d.setDwellMs(100);
  assert.equal(d.update("hwnd-1", 99), null);
  assert.equal(d.update("hwnd-1", 100), "hwnd-1");
});

test("reset clears armed state (overlay hidden / re-shown)", () => {
  const d = new HoverDwellDetector(400);
  assert.equal(d.update("hwnd-1", 0), null);
  assert.equal(d.update("hwnd-1", 200), null);
  d.reset();
  assert.equal(d.update("hwnd-1", 300), null);
  assert.equal(d.update("hwnd-1", 700), "hwnd-1");
});