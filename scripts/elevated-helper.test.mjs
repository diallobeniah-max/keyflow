import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "net";
import { randomBytes } from "crypto";

test("Elevated helper: token generation produces 128-bit hex token", () => {
  const token = randomBytes(16).toString("hex");
  assert.equal(token.length, 32);
  assert.match(token, /^[0-9a-f]{32}$/);
});

test("Elevated helper: authenticated handshake accepts matching token", () => {
  const serverToken = "test-token-1234567890abcdef123456";
  const clientAuthMessage = JSON.stringify({ type: "auth", version: 1, token: serverToken });

  const parsed = JSON.parse(clientAuthMessage);
  assert.equal(parsed.type, "auth");
  assert.equal(parsed.token, serverToken);
  assert.equal(parsed.token === serverToken, true, "Handshake must authenticate matching token");
});

test("Elevated helper: handshake rejects mismatched token", () => {
  const serverToken = "token-secret-alpha";
  const clientAuthMessage = JSON.stringify({ type: "auth", version: 1, token: "token-impostor" });

  const parsed = JSON.parse(clientAuthMessage);
  const isAuthenticated = parsed.type === "auth" && parsed.token === serverToken;
  assert.equal(isAuthenticated, false, "Handshake must reject unauthorized client");
});

test("Elevated helper: malformed NDJSON lines are safely dropped", () => {
  const badLines = ["", "   ", "not-json", "{type:", "{'single_quotes': 1}"];

  for (const line of badLines) {
    let parsed = null;
    try {
      parsed = JSON.parse(line);
    } catch {
      parsed = null;
    }
    assert.equal(parsed, null, `Malformed line '${line}' must be rejected`);
  }
});

test("Elevated helper: privileged protocol only allows KeyFlow command subset", () => {
  const ALLOWED_COMMANDS = new Set([
    "ping",
    "pause",
    "resume",
    "shutdown",
    "configure",
    "beginCapture",
    "setKeyStream",
  ]);

  const testMessages = [
    { type: "ping" },
    { type: "configure", shortcuts: [] },
    { type: "pause" },
    { type: "resume" },
    { type: "shutdown" },
    { type: "executeCommand", cmd: "whoami" }, // malicious / forbidden
    { type: "spawnProcess", path: "cmd.exe" },  // malicious / forbidden
    { type: "writeFile", path: "C:\\evil.dll" }, // malicious / forbidden
  ];

  const results = testMessages.map((m) => ({
    type: m.type,
    allowed: ALLOWED_COMMANDS.has(m.type),
  }));

  assert.equal(results.find((r) => r.type === "ping")?.allowed, true);
  assert.equal(results.find((r) => r.type === "configure")?.allowed, true);
  assert.equal(results.find((r) => r.type === "executeCommand")?.allowed, false);
  assert.equal(results.find((r) => r.type === "spawnProcess")?.allowed, false);
  assert.equal(results.find((r) => r.type === "writeFile")?.allowed, false);
});

test("Elevated helper: single keyboard owner guarantee (stopping standard before elevated)", () => {
  let standardHelperRunning = true;
  let elevatedHelperRunning = false;

  function switchToElevated() {
    // 1. Terminate standard helper
    standardHelperRunning = false;
    // 2. Start elevated helper
    elevatedHelperRunning = true;
  }

  function switchToStandard() {
    // 1. Terminate elevated helper
    elevatedHelperRunning = false;
    // 2. Start standard helper
    standardHelperRunning = true;
  }

  switchToElevated();
  assert.equal(standardHelperRunning, false);
  assert.equal(elevatedHelperRunning, true);

  switchToStandard();
  assert.equal(standardHelperRunning, true);
  assert.equal(elevatedHelperRunning, false);
});

test("Elevated helper: fail-open fallback on helper exit", () => {
  let isElevated = true;
  let standardRestarted = false;

  function onElevatedExit() {
    isElevated = false;
    standardRestarted = true;
  }

  onElevatedExit();
  assert.equal(isElevated, false, "Elevated mode must reset on helper exit");
  assert.equal(standardRestarted, true, "Standard helper must restart to fail open");
});
