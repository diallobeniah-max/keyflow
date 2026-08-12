import { spawn, execSync } from "child_process";
import { createServer } from "vite";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import http from "http";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const DEV_URL = "http://127.0.0.1:1420";

function waitForVite(url, maxRetries = 30, delay = 500) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      http.get(url, (res) => {
        if (res.statusCode === 200) return resolve();
        if (attempts < maxRetries) setTimeout(check, delay);
        else reject(new Error(`Vite not ready after ${maxRetries} attempts (status ${res.statusCode})`));
        res.resume();
      }).on("error", (err) => {
        if (attempts < maxRetries) setTimeout(check, delay);
        else reject(new Error(`Vite not reachable after ${maxRetries} attempts: ${err.message}`));
      });
    };
    check();
  });
}

async function main() {
  console.log("[electron:dev] Compiling Electron TypeScript...");
  try {
    execSync("npx tsc -p electron/tsconfig.json", { cwd: root, stdio: "inherit" });
    execSync("npx tsc -p electron/tsconfig.preload.json", { cwd: root, stdio: "inherit" });
  } catch {
    process.exit(1);
  }

  console.log("[electron:dev] Starting Vite dev server...");
  const server = await createServer({
    root,
    server: { host: "127.0.0.1", port: 1420, strictPort: true },
    logLevel: "warn",
  });
  await server.listen();

  console.log(`[electron:dev] Waiting for Vite at ${DEV_URL}...`);
  await waitForVite(DEV_URL);
  console.log("[electron:dev] Vite is ready.");

  console.log("[electron:dev] Starting Electron...");
  const electronCli = resolve(root, "node_modules", "electron", "cli.js");
  const electronProc = spawn(
    process.execPath,
    [electronCli, ".", "--dev"],
    {
      cwd: root,
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_ENV: "development",
        KEYFLOW_DEV_SERVER_URL: DEV_URL,
        KEYFLOW_OPEN_DEVTOOLS: process.env.KEYFLOW_OPEN_DEVTOOLS ?? "0",
      },
    }
  );

  electronProc.on("close", (code) => {
    console.log(`[electron:dev] Electron exited with code ${code}`);
    server.close();
    process.exit(code ?? 0);
  });

  process.on("SIGINT", () => {
    electronProc.kill("SIGINT");
    server.close();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    electronProc.kill("SIGTERM");
    server.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("[electron:dev] Failed:", err);
  process.exit(1);
});
