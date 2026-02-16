import { spawn } from "node:child_process";
import { join } from "node:path";
import { apps, isProcessAlive, readPid } from "./dev-apps.js";

const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

// Check if daemon is already running
const existingPid = readPid();
if (existingPid && isProcessAlive(existingPid)) {
  console.log(`${BOLD}Devkit is already running${RESET} ${DIM}(PID ${existingPid})${RESET}`);
  console.log(`Run ${CYAN}pnpm dev:stop${RESET} to stop, or ${CYAN}pnpm dev:stop && pnpm dev${RESET} to restart.`);
  process.exit(0);
}

// Spawn the daemon detached
const daemonScript = join(import.meta.dirname ?? process.cwd(), "dev-daemon.ts");
const child = spawn("tsx", [daemonScript], {
  detached: true,
  stdio: "ignore",
  cwd: join(import.meta.dirname ?? process.cwd(), ".."),
});
child.unref();

// Print startup banner
console.log();
console.log(`${BOLD}${GREEN}Devkit started in background${RESET} ${DIM}(PID ${child.pid})${RESET}`);
console.log();
for (const app of apps) {
  const padding = " ".repeat(22 - app.id.length);
  console.log(`  ${app.id}${padding}http://localhost:${app.port}`);
}
console.log();
console.log(`${DIM}Logs:${RESET}  ~/.devkit/logs/`);
console.log(`${DIM}View:${RESET}  ${CYAN}http://localhost:2000${RESET}`);
console.log(`${DIM}Stop:${RESET}  ${CYAN}pnpm dev:stop${RESET}`);
console.log();

// Open the web dashboard after a short delay to let Next.js start
setTimeout(() => {
  spawn("open", ["http://localhost:2000"], { stdio: "ignore" }).unref();
}, 3000);
