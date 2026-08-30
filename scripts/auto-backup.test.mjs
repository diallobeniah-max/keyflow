import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AutoBackupService } from "../dist-electron/auto-backup.js";

const backupTestDir = mkdtempSync(join(tmpdir(), "keyflow-auto-backup-"));

after(() => {
  rmSync(backupTestDir, { recursive: true, force: true });
});

test("auto backup writes complete, unique files for repeated manual backups", () => {
  const state = { version: 1, shortcuts: [{ id: "shortcut-1" }] };
  const service = new AutoBackupService();
  service.init(() => state);
  service.setConfig({ enabled: false, path: backupTestDir, intervalMinutes: 60 });

  const first = service.runNow();
  const second = service.runNow();

  assert.equal(first.success, true);
  assert.equal(second.success, true);
  assert.notEqual(first.path, second.path);

  const files = readdirSync(backupTestDir).filter((file) => file.endsWith(".json"));
  assert.equal(files.length, 2);
  assert.deepEqual(JSON.parse(readFileSync(first.path, "utf8")), state);
  assert.deepEqual(JSON.parse(readFileSync(second.path, "utf8")), state);
});

test("auto backup fails safely until the renderer has supplied application state", () => {
  const service = new AutoBackupService();
  service.init(() => null);
  service.setConfig({ enabled: false, path: backupTestDir, intervalMinutes: 60 });

  const result = service.runNow();

  assert.equal(result.success, false);
  assert.match(result.error ?? "", /state/i);
});
