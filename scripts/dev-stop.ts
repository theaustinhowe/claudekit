import { rmSync } from "node:fs";
import { isProcessAlive, pidFilePath, readPid } from "./dev-apps.js";

const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";

const pid = readPid();

if (!pid || !isProcessAlive(pid)) {
  console.log("No claudekit apps running.");
  // Clean up stale PID file
  if (pid) {
    try {
      rmSync(pidFilePath(), { force: true });
    } catch {
      // Ignore
    }
  }
  process.exit(0);
}

console.log(`Stopping claudekit (PID ${pid})...`);

// Send SIGTERM
try {
  process.kill(pid, "SIGTERM");
} catch {
  console.log("Process already stopped.");
  rmSync(pidFilePath(), { force: true });
  process.exit(0);
}

// Poll for exit (up to 5 seconds)
const deadline = Date.now() + 5000;
const poll = setInterval(() => {
  if (!isProcessAlive(pid)) {
    clearInterval(poll);
    // Clean up PID file if daemon didn't
    try {
      rmSync(pidFilePath(), { force: true });
    } catch {
      // Ignore
    }
    console.log(`${BOLD}${GREEN}ClaudeKit stopped.${RESET}`);
    process.exit(0);
  }
  if (Date.now() > deadline) {
    clearInterval(poll);
    console.log("Force killing...");
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Already dead
    }
    try {
      rmSync(pidFilePath(), { force: true });
    } catch {
      // Ignore
    }
    console.log(`${BOLD}${GREEN}ClaudeKit stopped.${RESET}`);
    process.exit(0);
  }
}, 200);
