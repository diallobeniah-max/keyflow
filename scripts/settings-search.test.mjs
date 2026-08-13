import { test } from "node:test";
import assert from "node:assert/strict";
import { searchSettings } from "../src/lib/fuzzySearch.ts";

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
