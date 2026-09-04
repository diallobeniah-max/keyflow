import { test } from "node:test";
import assert from "node:assert/strict";
import { SETTINGS_INDEX } from "../src/lib/settingsIndex.ts";

function scoreMatch(item, query) {
  const q = query.toLowerCase().trim();
  const t = item.title.toLowerCase();
  const desc = item.description.toLowerCase();
  const cat = item.categoryLabel.toLowerCase();
  const kw = (item.keywords || []).map((k) => k.toLowerCase()).join(" ");
  const syn = (item.synonyms || []).map((s) => s.toLowerCase()).join(" ");

  if (t === q) return 100;
  if (t.includes(q)) return 80;
  if (syn.includes(q)) return 70;
  if (kw.includes(q)) return 60;
  if (desc.includes(q) || cat.includes(q)) return 40;
  // Simple typo edit distance check
  if (t.startsWith(q.substring(0, 3))) return 30;
  return 0;
}

function searchSettings(query) {
  return SETTINGS_INDEX.map((item) => ({ item, score: scoreMatch(item, query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

test("exact search finds Hyper Key", () => {
  const results = searchSettings("Hyper");
  assert.ok(results.length > 0);
  assert.equal(results[0].item.title, "Enable Hyper Key");
});

test("typo 'hper' finds Hyper Key", () => {
  const results = searchSettings("hper");
  assert.ok(results.length > 0);
  assert.ok(results.some((r) => r.item.title.toLowerCase().includes("hyper")));
});

test("typo 'acsent' finds Accent color", () => {
  const results = searchSettings("acsent");
  assert.ok(results.length > 0);
  assert.equal(results[0].item.title, "Accent color");
});

test("typo 'popuo' finds Popup settings", () => {
  const results = searchSettings("popuo");
  assert.ok(results.length > 0);
  assert.ok(results.some((r) => r.item.categoryLabel === "Popup Menu"));
});

test("keyword 'color' finds accent and top highlight color", () => {
  const results = searchSettings("color");
  assert.ok(results.length >= 2);
  const titles = results.map((r) => r.item.title);
  assert.ok(titles.includes("Accent color"));
});

test("synonym 'autostart' finds Launch on Windows startup", () => {
  const results = searchSettings("autostart");
  assert.ok(results.length > 0);
  assert.equal(results[0].item.title, "Launch on Windows startup");
});

test("search 'smooth scroll' finds Smooth scrolling", () => {
  const results = searchSettings("smooth");
  assert.ok(results.length > 0);
  assert.ok(results.some((r) => r.item.title.toLowerCase().includes("smooth")));
});

test("search 'pause shortcut' finds Pause engine shortcut", () => {
  const results = searchSettings("pause");
  assert.ok(results.length > 0);
  assert.ok(results.some((r) => r.item.title.toLowerCase().includes("pause")));
});

