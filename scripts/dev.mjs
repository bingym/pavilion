import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frontendDir = path.join(rootDir, "frontend");
const wranglerLogDir = path.join(rootDir, ".wrangler-logs");
const xdgConfigHome = path.join(rootDir, ".wrangler-config");

// ── 1. 先同步构建一次前端，确保 dist/index.html 存在 ─────────────────────────
console.log("[dev] Building frontend...");
const buildResult = spawnSync(
  "npm",
  ["run", "build"],
  { cwd: frontendDir, stdio: "inherit", shell: process.platform === "win32" }
);
if (buildResult.status !== 0) {
  console.error("[dev] Frontend build failed, aborting.");
  process.exit(1);
}
console.log("[dev] Frontend build done. Starting dev servers...\n");

// ── 2. 并行启动 wrangler dev（:8787）和 vite dev（:5173） ────────────────────
function run(cmd, args, opts = {}) {
  const child = spawn(cmd, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...opts,
  });
  return child;
}

const children = [];

const worker = run("npx", ["wrangler", "dev", "--env", "local", "--ip", "127.0.0.1"], {
  cwd: rootDir,
  env: {
    ...process.env,
    WRANGLER_LOG_PATH: wranglerLogDir,
    XDG_CONFIG_HOME: xdgConfigHome,
    WRANGLER_SEND_METRICS: "false",
    WRANGLER_SEND_ERROR_REPORTS: "false",
  },
});
children.push(worker);

const frontend = run("npm", ["run", "dev"], {
  cwd: frontendDir,
});
children.push(frontend);

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    try {
      c.kill("SIGINT");
    } catch {
      // ignore
    }
  }
  setTimeout(() => process.exit(code), 500);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

for (const c of children) {
  c.on("exit", (code) => {
    if (!shuttingDown) shutdown(code ?? 0);
  });
}

