import { type ChildProcess, spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getAppSettings, readSettings } from "./dev-settings.js";

interface App {
  name: string;
  filter: string;
  color: string;
  port: number;
}

const apps: App[] = [
  { name: "web", filter: "web", color: "\x1b[34m", port: 2000 }, // blue
  { name: "gadget", filter: "gadget", color: "\x1b[35m", port: 2100 }, // magenta
  { name: "gogo-web", filter: "gogo-web", color: "\x1b[36m", port: 2200 }, // cyan
  { name: "gogo-orch", filter: "gogo-orchestrator", color: "\x1b[33m", port: 2201 }, // yellow
  { name: "b4u", filter: "b4u", color: "\x1b[32m", port: 2300 }, // green
  { name: "inspector", filter: "inspector", color: "\x1b[95m", port: 2400 }, // bright magenta
  { name: "storybook", filter: "@devkit/ui", color: "\x1b[31m", port: 6006 }, // red
];

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const LOG_DIR = join(homedir(), ".devkit", "logs");
const MAX_RESTARTS = 3;
const UPTIME_RESET_MS = 30_000;

if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true });
}

function appendToLog(app: string, line: string) {
  try {
    const logFile = join(LOG_DIR, `${app}-dev.log`);
    appendFileSync(logFile, `${line}\n`);
  } catch {
    // Don't crash if we can't write to log
  }
}

function startApp(app: App) {
  let restartCount = 0;
  let startTime = Date.now();
  let proc: ChildProcess | null = null;

  function launch() {
    proc = spawn("pnpm", ["--filter", app.filter, "dev"], {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: import.meta.dirname ? join(import.meta.dirname, "..") : process.cwd(),
    });

    startTime = Date.now();
    const prefix = `${app.color}[${app.name}]${RESET}`;
    const timestamp = () => new Date().toISOString();

    proc.stdout?.on("data", (data: Buffer) => {
      for (const line of data.toString().split("\n")) {
        if (line.trim()) {
          console.log(`${prefix} ${line}`);
          appendToLog(app.filter, `${timestamp()} [stdout] ${line}`);
        }
      }
    });

    proc.stderr?.on("data", (data: Buffer) => {
      for (const line of data.toString().split("\n")) {
        if (line.trim()) {
          console.error(`${prefix} ${line}`);
          appendToLog(app.filter, `${timestamp()} [stderr] ${line}`);
        }
      }
    });

    proc.on("exit", (code) => {
      console.log(`${prefix} exited with code ${code}`);
      appendToLog(app.filter, `${timestamp()} [exit] code=${code}`);

      // Check autoRestart setting
      const exitSettings = readSettings();
      const exitAppSettings = getAppSettings(app.name, exitSettings);
      if (!exitAppSettings.autoRestart) {
        console.log(`${prefix} auto-restart disabled by settings`);
        return;
      }

      if (code !== 0 && code !== null) {
        const uptime = Date.now() - startTime;
        if (uptime > UPTIME_RESET_MS) {
          restartCount = 0;
        }

        if (restartCount < MAX_RESTARTS) {
          restartCount++;
          const delay = 2 ** (restartCount - 1) * 1000;
          console.log(`${prefix} restarting in ${delay}ms (attempt ${restartCount}/${MAX_RESTARTS})`);
          setTimeout(launch, delay);
        } else {
          console.error(`${prefix} ${BOLD}max restarts reached, not restarting${RESET}`);
        }
      }
    });
  }

  launch();
}

const fgSettings = readSettings();
for (const app of apps) {
  const appSettings = getAppSettings(app.name, fgSettings);
  const shouldStart = fgSettings === null || app.name === "web" || appSettings.autoStart;
  if (shouldStart) {
    startApp(app);
  }
}

console.log(`\n${BOLD}Devkit dev servers starting...${RESET}`);
const DIM = "\x1b[2m";
for (const app of apps) {
  const appSettings = getAppSettings(app.name, fgSettings);
  const willStart = fgSettings === null || app.name === "web" || appSettings.autoStart;
  const padding = " ".repeat(20 - app.name.length);
  console.log(`  ${app.color}${app.name}${RESET}:${padding}http://localhost:${app.port}${willStart ? "" : `  ${DIM}(skipped)${RESET}`}`);
}
console.log();
