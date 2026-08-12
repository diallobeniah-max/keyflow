// Builds the native keyboard helper (Rust) into native/keyflow-input/target/release.
// Used by `npm run native:build`, wired into electron:dev / electron:build / electron:dist.

import { spawnSync } from "child_process";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const crateDir = join(root, "native", "keyflow-input");

if (!existsSync(join(crateDir, "Cargo.toml"))) {
  console.error(`[native:build] missing Cargo.toml at ${crateDir}`);
  process.exit(1);
}

const cargo = process.env.CARGO || join(process.env.USERPROFILE || "", ".cargo", "bin", "cargo.exe");

console.log(`[native:build] cargo=${cargo}`);
const result = spawnSync(cargo, ["build", "--release", "--manifest-path", join(crateDir, "Cargo.toml")], {
  stdio: "inherit",
});

if (result.status !== 0) {
  console.error(`[native:build] failed (status ${result.status})`);
  process.exit(result.status ?? 1);
}

const bin = join(crateDir, "target", "release", "keyflow-input.exe");
if (!existsSync(bin)) {
  console.error(`[native:build] build reported success but ${bin} is missing`);
  process.exit(1);
}
console.log(`[native:build] OK ${bin}`);
