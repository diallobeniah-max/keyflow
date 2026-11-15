// Builds the native keyboard helper (Rust). By default it uses Cargo's normal
// native/keyflow-input/target folder. A development launch may set
// KEYFLOW_NATIVE_TARGET_DIR to use a fresh output folder when an abandoned
// helper process has the normal executable locked.

import { spawnSync } from "child_process";
import { existsSync, renameSync, unlinkSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const crateDir = join(root, "native", "keyflow-input");

if (!existsSync(join(crateDir, "Cargo.toml"))) {
  console.error(`[native:build] missing Cargo.toml at ${crateDir}`);
  process.exit(1);
}

const configuredTargetDir = process.env.KEYFLOW_NATIVE_TARGET_DIR?.trim();
const targetDir = configuredTargetDir
  ? resolve(root, configuredTargetDir)
  : join(crateDir, "target");
const bin = join(targetDir, "release", "keyflow-input.exe");
const oldBin = join(targetDir, "release", "keyflow-input.exe.old");

// If this output is in use, rename it so cargo can link a new one without
// changing the running process. A custom target folder avoids this entirely.
if (existsSync(bin)) {
  try {
    if (existsSync(oldBin)) {
      try { unlinkSync(oldBin); } catch {}
    }
    renameSync(bin, oldBin);
  } catch (error) {
    console.error(`[native:build] cannot replace ${bin}; close the KeyFlow instance using it or set KEYFLOW_NATIVE_TARGET_DIR to a fresh folder.`, error);
    process.exit(1);
  }
}

const cargo = process.env.CARGO || join(process.env.USERPROFILE || "", ".cargo", "bin", "cargo.exe");

console.log(`[native:build] cargo=${cargo}`);
const result = spawnSync(cargo, ["build", "--release", "--manifest-path", join(crateDir, "Cargo.toml")], {
  stdio: "inherit",
  env: { ...process.env, CARGO_TARGET_DIR: targetDir },
});

if (result.status !== 0) {
  console.error(`[native:build] failed (status ${result.status})`);
  process.exit(result.status ?? 1);
}

if (!existsSync(bin)) {
  console.error(`[native:build] build reported success but ${bin} is missing`);
  process.exit(1);
}
console.log(`[native:build] OK ${bin}`);
